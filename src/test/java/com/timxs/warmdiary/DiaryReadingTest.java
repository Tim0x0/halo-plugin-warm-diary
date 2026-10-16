package com.timxs.warmdiary;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.ListResult;
import run.halo.app.extension.ReactiveExtensionClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DiaryReadingTest {
    private ReactiveExtensionClient extensions;
    private DiaryAccess access;
    private PublicDiaryEndpoint endpoint;

    @BeforeEach
    void setup() {
        extensions = mock(ReactiveExtensionClient.class);
        access = mock(DiaryAccess.class);
        when(access.canManage()).thenReturn(Mono.just(false));
        when(extensions.fetch(eq(DiaryEntry.class), anyString())).thenReturn(Mono.empty());
        endpoint = new PublicDiaryEndpoint(new DiaryService(extensions, access), access);
    }

    /** 同一个阅读接口按角色分流：有管理权限读当前内容，其他人只读已分享快照。 */
    private void manager(boolean manage) {
        when(access.canManage()).thenReturn(Mono.just(manage));
    }

    private WebTestClient browser() {
        return WebTestClient.bindToRouterFunction(endpoint.endpoint()).build();
    }

    private String store(DiaryEntry entry) {
        when(extensions.fetch(DiaryEntry.class, entry.getMetadata().getName())).thenReturn(Mono.just(entry));
        return "/readableentries/" + entry.getMetadata().getName();
    }

    private static DiaryEntry published() {
        var entry = DiaryPrivacyTest.entry();
        entry.getSpec().setPublished(new DiaryEntry.Published("2026-09-01", "公开标题",
            "<p>已公开内容</p>", "已公开内容", "平静", "晴", Instant.now()));
        return entry;
    }

    @Test
    void managersReadTheWorkingCopyWhileVisitorsOnlyGetTheSharedSnapshot() {
        String path = store(published());
        manager(true);
        browser().get().uri(path).exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.working.title").isEqualTo("私密标题");
        manager(false);
        browser().get().uri(path).exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.title").isEqualTo("公开标题");
    }

    @Test
    void anUnpublishedEntryIsNotFoundForVisitorsAndReadableForManagers() {
        String path = store(DiaryPrivacyTest.entry());
        browser().get().uri(path).exchange().expectStatus().isNotFound();
        manager(true);
        browser().get().uri(path).exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.working.title").isEqualTo("私密标题");
    }

    @Test
    void visitorPreviewRestrictsTheManagerToThePublishedSnapshot() {
        String path = store(published());
        for (boolean manage : new boolean[] {false, true}) {
            manager(manage);
            browser().get().uri(path + "?publicOnly=true").exchange().expectStatus().isOk()
                .expectHeader().valueEquals("Cache-Control", "private, no-store")
                .expectHeader().valueEquals("Vary", "Cookie, Authorization")
                .expectBody(String.class).value(body -> assertThat(body)
                    .contains("公开标题", "已公开内容", "平静")
                    .doesNotContain("私密", "working", "低落", "author", "version"));
        }
    }

    @Test
    void anUnpublishedEntryCannotBeReadInVisitorPreview() {
        String path = store(DiaryPrivacyTest.entry());
        manager(true);
        browser().get().uri(path + "?publicOnly=true").exchange().expectStatus().isNotFound();
    }

    @Test
    void trashIsExcludedFromReadingEvenForTheManager() {
        var entry = DiaryPrivacyTest.entry();
        DiaryService.applyAction(entry, "trash", Instant.now());
        String path = store(entry);
        manager(true);
        browser().get().uri(path).exchange().expectStatus().isNotFound();
    }

    @Test
    void calendarCountsSharedDatesForVisitorsAndCurrentDatesForManagers() {
        // 同一篇：当前日期 2026-09-20，分享版本的日期 2026-09-01。筛选条件与目录共用 options()。
        var shared = published();
        when(extensions.listAll(eq(DiaryEntry.class), any(ListOptions.class), any(Sort.class)))
            .thenAnswer(call -> Flux.just(shared));
        manager(false);
        browser().get().uri("/readablecalendar?month=2026-09").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.days['2026-09-01']").isEqualTo(1)
            .jsonPath("$.days['2026-09-20']").doesNotExist();
        manager(true);
        browser().get().uri("/readablecalendar?month=2026-09").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.days['2026-09-20']").isEqualTo(1)
            .jsonPath("$.days['2026-09-01']").doesNotExist();
        manager(true);
        browser().get().uri("/readablecalendar?month=2026-09&publicOnly=true").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.days['2026-09-01']").isEqualTo(1);
        browser().get().uri("/readablecalendar?month=bad").exchange().expectStatus().isBadRequest();
    }

    @Test
    void sessionEndpointIsReadableByEveryone() {
        when(access.session()).thenReturn(Mono.just(new DiaryAccess.Session(false, false, "Asia/Shanghai", "2026-09-20")));
        browser().get().uri("/session").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.canManage").isEqualTo(false);
    }

    @Test
    void readingIgnoresClientSuppliedIdentityParameters() {
        String path = store(published());
        browser().get().uri(path + "?view=private&owner=admin&manage=true").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.title").isEqualTo("公开标题");
    }

    @Test
    void entriesListUsesTheSameBranchAsSingleReads() {
        var shared = published();
        when(extensions.listBy(eq(DiaryEntry.class), any(ListOptions.class), any()))
            .thenReturn(Mono.just(new ListResult<>(List.of(shared))));
        manager(true);
        browser().get().uri("/readableentries").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.items[0].title").isEqualTo("私密标题")
            .jsonPath("$.items[0].shared").isEqualTo(true);
        manager(false);
        browser().get().uri("/readableentries").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.items[0].title").isEqualTo("公开标题")
            .jsonPath("$.items[0].shared").doesNotExist();
    }
}
