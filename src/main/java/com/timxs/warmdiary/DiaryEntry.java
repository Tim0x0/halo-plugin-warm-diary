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
        // 记录谁写的，仅供以后展示；权限由角色判定，不参与过滤。
        private String author;
        private Content working;
        private Published published;
        private Instant updatedAt;
        private Instant trashedAt;
    }

    @Schema(name = "DiaryContent", requiredProperties = {"date", "title", "html", "text", "mood", "weather"})
    public record Content(String date, String title, String html, String text,
                          String mood, String weather) {}

    @Schema(name = "DiaryPublished",
        requiredProperties = {"date", "title", "html", "text", "mood", "weather", "publishedAt"})
    public record Published(String date, String title, String html, String text,
                            String mood, String weather, Instant publishedAt) {}
}
