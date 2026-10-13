package com.timxs.warmdiary;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.core.user.service.UserService;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.plugin.ReactiveSettingFetcher;

@Component
@RequiredArgsConstructor
public class DiaryAccess {
    static final String DEFAULT_STICKY = "不必写得漂亮，\n真实就很好。";
    private final ReactiveExtensionClient client;
    private final UserService users;
    private final ReactiveSettingFetcher settings;

    Mono<String> username() {
        return ReactiveSecurityContextHolder.getContext().map(c -> c.getAuthentication())
            .filter(a -> a.isAuthenticated() && !(a instanceof AnonymousAuthenticationToken))
            .map(a -> a.getName()).filter(n -> !n.equals("anonymousUser"));
    }

    Mono<DiaryNotebook> notebook() {
        return client.fetch(DiaryNotebook.class, DiaryNotebook.NAME);
    }

    Mono<String> ownerName() {
        return notebook().map(n -> n.getSpec().getOwner())
            .filter(owner -> owner != null && !owner.isBlank());
    }

    Mono<String> requireOwner() {
        return username().flatMap(name -> ownerName().filter(name::equals))
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN, "只有日记主人可以访问")));
    }

    Mono<Boolean> isOwner() {
        return username().flatMap(name -> ownerName().filter(name::equals)).hasElement();
    }

    Mono<Session> session() {
        return timeZone().flatMap(zone -> username().defaultIfEmpty("").flatMap(name -> notebook()
                .map(n -> session(true, !name.isEmpty() && name.equals(n.getSpec().getOwner()),
                    !name.isEmpty(), zone, false))
                .switchIfEmpty(Mono.defer(() -> {
                    Mono<Boolean> canInitialize = name.isEmpty()
                        ? Mono.just(false)
                        : users.hasSufficientRoles(Set.of("super-role")).defaultIfEmpty(false);
                    return canInitialize.map(allowed -> session(false, false, !name.isEmpty(), zone, allowed));
                }))));
    }

    private Mono<String> timeZone() {
        return settings.fetch("basic", BasicSettings.class).map(s -> s.timeZone() == null ? "" : s.timeZone())
            .defaultIfEmpty("").map(zone -> {
                try { return (zone.isBlank() ? ZoneId.systemDefault() : ZoneId.of(zone)).getId(); }
                catch (RuntimeException e) { throw DiaryContent.badRequest("日记时区无效，请在插件设置中填写有效时区，例如 Asia/Shanghai"); }
            });
    }

    Mono<String> stickyNote() {
        return settings.fetch("basic", BasicSettings.class)
            .map(s -> s.stickyNote() == null ? "" : s.stickyNote())
            .defaultIfEmpty("")
            .onErrorReturn("")
            .map(note -> {
                String text = note.strip();
                if (text.length() > 200) text = text.substring(0, 200).strip();
                return text.isBlank() ? DEFAULT_STICKY : text;
            });
    }

    private Session session(boolean initialized, boolean owner, boolean loggedIn, String zone,
                            boolean canInitialize) {
        return new Session(initialized, owner, loggedIn, zone,
            LocalDate.now(ZoneId.of(zone)).toString(), canInitialize);
    }

    Mono<DiaryNotebook> initialize() {
        return username().switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED)))
            .flatMap(name -> users.hasSufficientRoles(Set.of("super-role"))
                .filter(Boolean::booleanValue)
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN, "请由超级管理员初始化")))
                .flatMap(ignored -> notebook().flatMap(existing -> Mono.<DiaryNotebook>error(
                    new ResponseStatusException(HttpStatus.CONFLICT, "日记本已经初始化")))
                    .switchIfEmpty(Mono.defer(() -> {
                        var notebook = new DiaryNotebook();
                        var metadata = new Metadata();
                        metadata.setName(DiaryNotebook.NAME);
                        notebook.setMetadata(metadata);
                        var spec = new DiaryNotebook.Spec();
                        spec.setOwner(name);
                        notebook.setSpec(spec);
                        return client.create(notebook);
                    }))));
    }

    // isOwner：当前账号是不是日记主人（日记本里记的 owner 是用户名，两者不同名以免混淆）。
    @Schema(name = "DiarySession", requiredProperties = {"initialized", "isOwner", "loggedIn", "timeZone", "today", "canInitialize"})
    public record Session(boolean initialized, boolean isOwner, boolean loggedIn, String timeZone, String today,
                          boolean canInitialize) {}
    public record BasicSettings(String timeZone, String stickyNote) {}
}
