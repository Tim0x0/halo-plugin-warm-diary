package com.timxs.warmdiary;

import java.time.Instant;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "warm-diary.timxs.com", version = "v1alpha1", kind = "DiaryEntry",
    plural = "diaryentries", singular = "diaryentry")
public class DiaryEntry extends AbstractExtension {
    private Spec spec;

    @Data
    public static class Spec {
        private String owner;
        private Content working;
        private Published published;
        private Instant updatedAt;
        private Instant trashedAt;
    }

    @Schema(name = "DiaryContent", requiredProperties = {"date", "title", "html", "text", "mood", "weather"})
    public record Content(String date, String title, String html, String text,
                          String mood, String weather) {
        public Content {
            mood = mood == null ? "" : mood;
            weather = weather == null ? "" : weather;
        }
    }

    // 心情和天气随日记一起分享；早期分享快照可能没有这两项，读出为空。
    @Schema(name = "DiaryPublished",
        requiredProperties = {"date", "title", "html", "text", "mood", "weather", "publishedAt"})
    public record Published(String date, String title, String html, String text,
                            String mood, String weather, Instant publishedAt) {
        public Published {
            mood = mood == null ? "" : mood;
            weather = weather == null ? "" : weather;
        }
    }
}
