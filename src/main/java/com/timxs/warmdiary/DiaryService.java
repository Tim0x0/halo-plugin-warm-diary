package com.timxs.warmdiary;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.PageRequestImpl;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.extension.index.query.Queries;

@Component
@RequiredArgsConstructor
public class DiaryService {
    private final ReactiveExtensionClient client;
    private final DiaryAccess access;

    @Schema(name = "DiaryWrite", requiredProperties = {"date", "title", "html", "mood", "weather"})
    public record Write(String name, String version, String date, String title, String html,
                        String mood, String weather) {}
    @Schema(name = "DiaryVersion", requiredProperties = {"version"})
    public record Version(String version) {}
    @Schema(name = "DiaryReadingEntry", oneOf = {PrivateEntry.class, PublicEntry.class})
    public interface ReadingEntry {}
    @Schema(name = "DiaryPublicEntry",
        requiredProperties = {"name", "date", "title", "html", "text", "mood", "weather", "publishedAt"})
    public record PublicEntry(String name, String date, String title, String html, String text,
                              String mood, String weather, Instant publishedAt) implements ReadingEntry {}
    @Schema(name = "DiaryPrivateEntry",
        requiredProperties = {"name", "version", "working", "pendingChanges", "changedFields", "createdAt", "updatedAt"})
    public record PrivateEntry(String name, String version, DiaryEntry.Content working,
                               @Schema(nullable = true) DiaryEntry.Published published, boolean pendingChanges,
                               @Schema(description = "与已分享版本不同的字段：date、title、html、mood、weather")
                               List<String> changedFields,
                               Instant createdAt, Instant updatedAt, @Schema(nullable = true) Instant trashedAt) implements ReadingEntry {}

    // 目录和列表只要日期、标题、摘要和状态；正文在打开一篇时再取。
    @Schema(name = "DiaryReadingSummary", oneOf = {EntrySummary.class, PublicSummary.class})
    public interface ReadingSummary {}
    @Schema(name = "DiaryEntrySummary", requiredProperties = {"name", "version", "date", "title", "excerpt",
        "mood", "weather", "shared", "pendingChanges", "changedFields", "createdAt", "updatedAt"})
    public record EntrySummary(String name, String version, String date, String title, String excerpt,
                               String mood, String weather, boolean shared, boolean pendingChanges,
                               List<String> changedFields, Instant createdAt, Instant updatedAt,
                               @Schema(nullable = true) Instant publishedAt,
                               @Schema(nullable = true) Instant trashedAt) implements ReadingSummary {}
    @Schema(name = "DiaryPublicSummary",
        requiredProperties = {"name", "date", "title", "excerpt", "mood", "weather", "publishedAt"})
    public record PublicSummary(String name, String date, String title, String excerpt, String mood,
                                String weather, Instant publishedAt) implements ReadingSummary {}
    @Schema(name = "DiaryEntryPage", requiredProperties = {"items", "total", "page", "size"})
    public record EntryPage(List<EntrySummary> items, long total, int page, int size) {}
    @Schema(name = "DiaryReadingPage", requiredProperties = {"items", "total", "page", "size"})
    public record ReadingPage(List<ReadingSummary> items, long total, int page, int size) {}
    @Schema(name = "DiaryCalendar", requiredProperties = {"days"})
    public record Calendar(Map<String, Long> days) {}
    public record Query(int page, int size, String keyword, String from, String to, String visibility,
                        String mood, String weather, boolean trash) {
        static Query from(ServerRequest request) {
            try {
                int page = Integer.parseInt(request.queryParam("page").orElse("1"));
                int size = Integer.parseInt(request.queryParam("size").orElse("20"));
                if (page < 1 || page > 100_000 || size < 1 || size > 100) throw new IllegalArgumentException();
                String from = request.queryParam("from").orElse("");
                String to = request.queryParam("to").orElse("");
                if (!from.isBlank()) LocalDate.parse(from);
                if (!to.isBlank()) LocalDate.parse(to);
                if (!from.isBlank() && !to.isBlank() && from.compareTo(to) > 0) throw new IllegalArgumentException();
                String visibility = request.queryParam("visibility").orElse("all");
                if (!List.of("all", "private", "public").contains(visibility)) throw new IllegalArgumentException();
                String mood = filterOption(request.queryParam("mood").orElse(""), DiaryContent.MOODS, "心情");
                String weather = filterOption(request.queryParam("weather").orElse(""), DiaryContent.WEATHERS, "天气");
                return new Query(page, size, DiaryContent.bounded(request.queryParam("keyword").orElse(""), 200, "搜索词"),
                    from, to, visibility, mood, weather, request.queryParam("trash").orElse("false").equals("true"));
            } catch (ResponseStatusException e) {
                throw e;
            } catch (DateTimeParseException | IllegalArgumentException e) {
                throw DiaryContent.badRequest("筛选条件无效");
            }
        }

        /** 空白表示不筛选；有值时走 DiaryContent.option。 */
        private static String filterOption(String value, List<String> allowed, String label) {
            if (value.isBlank()) return "";
            return DiaryContent.option(value, allowed, label);
        }
    }

    static PrivateEntry privateView(DiaryEntry e) {
        var s = e.getSpec();
        var w = s.getWorking();
        var p = s.getPublished();
        var changed = new ArrayList<String>();
        if (p != null) {
            if (!w.date().equals(p.date())) changed.add("date");
            if (!w.title().equals(p.title())) changed.add("title");
            if (!w.html().equals(p.html())) changed.add("html");
            if (!w.mood().equals(p.mood())) changed.add("mood");
            if (!w.weather().equals(p.weather())) changed.add("weather");
        }
        return new PrivateEntry(e.getMetadata().getName(), String.valueOf(e.getMetadata().getVersion()),
            w, p, !changed.isEmpty(), List.copyOf(changed), e.getMetadata().getCreationTimestamp(),
            s.getUpdatedAt(), s.getTrashedAt());
    }

    static PublicEntry publicView(DiaryEntry e) {
        var p = e.getSpec().getPublished();
        if (p == null || e.getSpec().getTrashedAt() != null || e.getMetadata().getDeletionTimestamp() != null) throw notFound();
        return new PublicEntry(e.getMetadata().getName(), p.date(), p.title(), p.html(), p.text(),
            p.mood(), p.weather(), p.publishedAt());
    }

    /** 正文开头的一段纯文本，用于目录和没有标题的日记。 */
    static String excerpt(String text) {
        String s = text == null ? "" : text.replaceAll("\\s+", " ").strip();
        return s.substring(0, s.offsetByCodePoints(0, Math.min(80, s.codePointCount(0, s.length()))));
    }

    static EntrySummary summary(DiaryEntry e) {
        var v = privateView(e);
        var w = v.working();
        var p = v.published();
        return new EntrySummary(v.name(), v.version(), w.date(), w.title(), excerpt(w.text()), w.mood(),
            w.weather(), p != null, v.pendingChanges(), v.changedFields(), v.createdAt(), v.updatedAt(),
            p == null ? null : p.publishedAt(), v.trashedAt());
    }

    static PublicSummary publicSummary(DiaryEntry e) {
        var p = publicView(e);
        return new PublicSummary(p.name(), p.date(), p.title(), excerpt(p.text()), p.mood(), p.weather(),
            p.publishedAt());
    }

    static void checkVersion(Long current, String supplied) {
        if (supplied == null || !String.valueOf(current).equals(supplied)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "这篇日记已在其他页面修改。当前输入已保留，请先查看最新版本。");
        }
    }

    static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "日记不存在");
    }

    /** 已存在且未在删除中的一篇日记；写权限由角色判定，不在这里过滤。 */
    Mono<DiaryEntry> entry(String name) {
        return client.fetch(DiaryEntry.class, name)
            .filter(e -> e.getMetadata().getDeletionTimestamp() == null)
            .switchIfEmpty(Mono.error(notFound()));
    }

    Mono<PrivateEntry> getPrivate(String name) {
        return entry(name).map(DiaryService::privateView);
    }

    Mono<PublicEntry> getPublic(String name) {
        return client.fetch(DiaryEntry.class, name).map(DiaryService::publicView).switchIfEmpty(Mono.error(notFound()));
    }

    // 页面和浏览器 API 都认 Halo 登录身份，不认路径。publicOnly 只能收窄到已分享快照，不能放开私密访问。
    Mono<ReadingEntry> getReadable(String name, boolean publicOnly) {
        if (publicOnly) return readPublic(name);
        return access.canManage().flatMap(manage -> manage ? readPrivate(name) : readPublic(name));
    }

    private Mono<ReadingEntry> readPrivate(String name) {
        return entry(name).map(DiaryService::privateView)
            .filter(e -> e.trashedAt() == null)
            .switchIfEmpty(Mono.error(notFound()))
            .cast(ReadingEntry.class);
    }

    private Mono<ReadingEntry> readPublic(String name) {
        return getPublic(name).cast(ReadingEntry.class);
    }

    Mono<ReadingPage> listReadable(Query query, boolean publicOnly) {
        var readingQuery = new Query(query.page(), query.size(), query.keyword(), query.from(),
            query.to(), query.visibility(), query.mood(), query.weather(), false);
        if (publicOnly) return listPublic(readingQuery);
        return access.canManage()
            .flatMap(manage -> manage ? listPrivateAsReading(readingQuery) : listPublic(readingQuery));
    }

    private Mono<ReadingPage> listPrivateAsReading(Query q) {
        return listPrivate(q).map(page -> new ReadingPage(List.<ReadingSummary>copyOf(page.items()),
            page.total(), page.page(), page.size()));
    }

    Mono<PrivateEntry> create(Write input) {
        return access.username().defaultIfEmpty("").flatMap(author -> {
            var content = DiaryContent.validate(input);
            try {
                if (input.name() == null || !UUID.fromString(input.name()).toString().equals(input.name())) throw new IllegalArgumentException();
            } catch (RuntimeException e) { return Mono.error(DiaryContent.badRequest("日记标识无效")); }
            // 客户端稳定 UUID，丢失创建响应后可以安全重试。
            return client.fetch(DiaryEntry.class, input.name()).flatMap(existing -> {
                if (existing.getSpec().getTrashedAt() == null
                    && existing.getMetadata().getDeletionTimestamp() == null
                    && existing.getSpec().getWorking().equals(content)) return Mono.just(existing);
                return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT, "日记已经存在，请先获取最新版本"));
            }).switchIfEmpty(Mono.defer(() -> {
                var entry = new DiaryEntry();
                var metadata = new Metadata();
                metadata.setName(input.name());
                entry.setMetadata(metadata);
                var spec = new DiaryEntry.Spec();
                spec.setAuthor(author);
                spec.setWorking(content);
                spec.setUpdatedAt(Instant.now());
                entry.setSpec(spec);
                return client.create(entry);
            }));
        }).map(DiaryService::privateView);
    }

    Mono<PrivateEntry> update(String name, Write input) {
        return entry(name).flatMap(e -> {
            checkVersion(e.getMetadata().getVersion(), input.version());
            if (e.getSpec().getTrashedAt() != null) return Mono.error(DiaryContent.badRequest("请先恢复这篇日记"));
            e.getSpec().setWorking(DiaryContent.validate(input));
            e.getSpec().setUpdatedAt(Instant.now());
            return client.update(e);
        }).map(DiaryService::privateView);
    }

    Mono<PrivateEntry> action(String name, String action, Version input) {
        return entry(name).flatMap(e -> {
            checkVersion(e.getMetadata().getVersion(), input.version());
            applyAction(e, action, Instant.now());
            return client.update(e);
        }).map(DiaryService::privateView);
    }

    static void applyAction(DiaryEntry e, String action, Instant now) {
        var s = e.getSpec();
        if (s.getTrashedAt() != null && !action.equals("restore")) throw DiaryContent.badRequest("请先恢复这篇日记");
        switch (action) {
            case "publish" -> {
                var w = s.getWorking();
                s.setPublished(new DiaryEntry.Published(w.date(), w.title(), w.html(), w.text(),
                    w.mood(), w.weather(), now));
            }
            case "unpublish" -> s.setPublished(null);
            case "trash" -> { s.setPublished(null); s.setTrashedAt(now); }
            case "restore" -> { s.setPublished(null); s.setTrashedAt(null); }
            default -> throw DiaryContent.badRequest("未知操作");
        }
        s.setUpdatedAt(now);
    }

    Mono<Void> delete(String name, Version input) {
        return entry(name).flatMap(e -> {
            checkVersion(e.getMetadata().getVersion(), input.version());
            if (e.getSpec().getTrashedAt() == null) return Mono.error(DiaryContent.badRequest("只有回收站中的日记可以永久删除"));
            return client.delete(e);
        }).then();
    }

    private ListOptions options(Query q, boolean publicOnly) {
        var builder = ListOptions.builder()
            .andQuery(Queries.isNull("metadata.deletionTimestamp"))
            .andQuery(Queries.equal("trashed", Boolean.toString(!publicOnly && q.trash())));
        if (publicOnly) builder.andQuery(Queries.equal("published", "true"));
        else if (!q.visibility().equals("all")) {
            builder.andQuery(Queries.equal("published", Boolean.toString(q.visibility().equals("public"))));
        }
        String dateIndex = publicOnly ? "publicDate" : "workingDate";
        if (!q.from().isBlank()) builder.andQuery(Queries.greaterThan(dateIndex, q.from(), true));
        if (!q.to().isBlank()) builder.andQuery(Queries.lessThan(dateIndex, q.to(), true));
        if (!q.keyword().isBlank()) builder.andQuery(Queries.contains(publicOnly ? "publicSearch" : "workingSearch", q.keyword().toLowerCase(Locale.ROOT)));
        if (!q.mood().isBlank()) builder.andQuery(Queries.equal(publicOnly ? "publicMood" : "workingMood", q.mood()));
        if (!q.weather().isBlank()) builder.andQuery(Queries.equal(publicOnly ? "publicWeather" : "workingWeather", q.weather()));
        return builder.build();
    }

    private Sort sort(boolean publicOnly) {
        return Sort.by(Sort.Order.desc(publicOnly ? "publicDate" : "workingDate"),
            Sort.Order.desc("metadata.creationTimestamp"), Sort.Order.desc("metadata.name"));
    }

    Mono<EntryPage> listPrivate(Query q) {
        return client.listBy(DiaryEntry.class, options(q, false),
            PageRequestImpl.of(q.page(), q.size(), sort(false)))
            .map(page -> new EntryPage(page.getItems().stream().map(DiaryService::summary).toList(), page.getTotal(), q.page(), q.size()));
    }

    private Mono<ReadingPage> listPublic(Query q) {
        return client.listBy(DiaryEntry.class, options(q, true), PageRequestImpl.of(q.page(), q.size(), sort(true)))
            .map(page -> new ReadingPage(page.getItems().stream().<ReadingSummary>map(DiaryService::publicSummary).toList(),
                page.getTotal(), q.page(), q.size()));
    }

    // 有管理权限的账号看全部日记的当前日期；访客和访客预览只看已分享版本的日期。
    Mono<Map<String, Long>> readableCalendar(String month, boolean publicOnly) {
        final YearMonth yearMonth;
        try { yearMonth = YearMonth.parse(month); }
        catch (RuntimeException e) { return Mono.error(DiaryContent.badRequest("月份无效")); }
        if (publicOnly) return calendarDays(yearMonth, true);
        return access.canManage().flatMap(manage -> calendarDays(yearMonth, !manage));
    }

    private Mono<Map<String, Long>> calendarDays(YearMonth yearMonth, boolean publicOnly) {
        var q = new Query(1, 100, "", yearMonth.atDay(1).toString(), yearMonth.atEndOfMonth().toString(), "all", "", "", false);
        return client.listAll(DiaryEntry.class, options(q, publicOnly), sort(publicOnly))
            .collect(() -> new TreeMap<String, Long>(), (map, entry) -> map.merge(publicOnly
                ? entry.getSpec().getPublished().date() : entry.getSpec().getWorking().date(), 1L, Long::sum))
            .map(map -> (Map<String, Long>) map);
    }
}
