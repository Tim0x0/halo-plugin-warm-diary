package com.timxs.warmdiary;

import java.time.LocalDate;
import java.util.List;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class DiaryContent {
    private static final Safelist ALLOWED = new Safelist().addTags(
        "p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "blockquote");
    // 与前端 ui/src/diary/api.ts 的 moods、weathers 保持一致。
    static final List<String> MOODS = List.of("平静", "愉快", "放松", "怀念", "低落", "疲惫");
    static final List<String> WEATHERS = List.of("晴", "多云", "阴", "雨", "雪", "风");

    private DiaryContent() {}

    static DiaryEntry.Content validate(DiaryService.Write input) {
        String date = input.date();
        try {
            if (date == null || !date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
            LocalDate.parse(date);
        } catch (RuntimeException e) {
            throw badRequest("请选择有效的日记日期");
        }
        String title = bounded(input.title(), 120, "标题").strip();
        String html = sanitize(bounded(input.html(), 150_000, "正文"));
        String text = Jsoup.parseBodyFragment(html).text().strip();
        if (title.isBlank() && text.isBlank()) throw badRequest("写一点内容再保存吧");
        return new DiaryEntry.Content(date, title, html, text,
            option(input.mood(), MOODS, "心情"), option(input.weather(), WEATHERS, "天气"));
    }

    static String option(String value, List<String> options, String field) {
        String text = value == null ? "" : value;
        if (!text.isEmpty() && !options.contains(text)) throw badRequest("请从列表中选择" + field);
        return text;
    }

    static String sanitize(String input) {
        return Jsoup.clean(input, "", ALLOWED, new Document.OutputSettings().prettyPrint(false));
    }

    static String bounded(String value, int max, String field) {
        String text = value == null ? "" : value;
        if (text.length() > max) throw badRequest(field + "过长，最多 " + max + " 个字符");
        return text;
    }

    static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
