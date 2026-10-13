package com.timxs.warmdiary;

import java.util.Locale;
import org.springframework.stereotype.Component;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.index.IndexSpecs;
import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;

/**
 * <p>Plugin main class to manage the lifecycle of the plugin.</p>
 * <p>This class must be public and have a public constructor.</p>
 * <p>Only one main class extending {@link BasePlugin} is allowed per plugin.</p>
 *
 * @author Tim0x0
 */
@Component
public class WarmDiaryPlugin extends BasePlugin {
    private final SchemeManager schemes;

    public WarmDiaryPlugin(PluginContext pluginContext, SchemeManager schemes) {
        super(pluginContext);
        this.schemes = schemes;
    }

    @Override
    public void start() {
        schemes.register(DiaryNotebook.class);
        schemes.register(DiaryEntry.class, specs -> {
            specs.add(IndexSpecs.<DiaryEntry, String>single("spec.owner", String.class)
                .indexFunc(e -> e.getSpec().getOwner()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("workingDate", String.class)
                .indexFunc(e -> e.getSpec().getWorking().date()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("publicDate", String.class)
                .indexFunc(e -> e.getSpec().getPublished() == null ? "" : e.getSpec().getPublished().date()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("trashed", String.class)
                .indexFunc(e -> Boolean.toString(e.getSpec().getTrashedAt() != null)));
            specs.add(IndexSpecs.<DiaryEntry, String>single("published", String.class)
                .indexFunc(e -> Boolean.toString(e.getSpec().getPublished() != null)));
            specs.add(IndexSpecs.<DiaryEntry, String>single("workingMood", String.class)
                .indexFunc(e -> e.getSpec().getWorking().mood()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("publicMood", String.class)
                .indexFunc(e -> e.getSpec().getPublished() == null ? "" : e.getSpec().getPublished().mood()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("workingWeather", String.class)
                .indexFunc(e -> e.getSpec().getWorking().weather()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("publicWeather", String.class)
                .indexFunc(e -> e.getSpec().getPublished() == null ? "" : e.getSpec().getPublished().weather()));
            specs.add(IndexSpecs.<DiaryEntry, String>single("workingSearch", String.class)
                .indexFunc(e -> searchIndex(e.getSpec().getWorking().title(), e.getSpec().getWorking().text())));
            specs.add(IndexSpecs.<DiaryEntry, String>single("publicSearch", String.class)
                .indexFunc(e -> e.getSpec().getPublished() == null ? "" :
                    searchIndex(e.getSpec().getPublished().title(), e.getSpec().getPublished().text())));
        });
    }

    @Override
    public void stop() {
        schemes.unregister(Scheme.buildFromType(DiaryEntry.class));
        schemes.unregister(Scheme.buildFromType(DiaryNotebook.class));
    }

    // SingleValueIndex 常驻堆；contains 全量扫描，截断后仍可搜标题和正文前部。
    private static final int SEARCH_INDEX_LIMIT = 8192;

    static String searchIndex(String title, String text) {
        String value = ((title == null ? "" : title) + " " + (text == null ? "" : text)).toLowerCase(Locale.ROOT);
        return value.length() <= SEARCH_INDEX_LIMIT ? value : value.substring(0, SEARCH_INDEX_LIMIT);
    }
}
