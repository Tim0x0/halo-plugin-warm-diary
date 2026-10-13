package com.timxs.warmdiary;

import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "warm-diary.timxs.com", version = "v1alpha1", kind = "DiaryNotebook",
    plural = "diarynotebooks", singular = "diarynotebook")
public class DiaryNotebook extends AbstractExtension {
    public static final String NAME = "warm-diary-notebook";
    private Spec spec;

    @Data
    public static class Spec {
        private String owner;
    }
}
