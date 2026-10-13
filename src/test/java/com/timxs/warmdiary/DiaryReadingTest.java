package com.timxs.warmdiary;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.core.user.service.UserService;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.plugin.ReactiveSettingFetcher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DiaryReadingTest {
    private ReactiveExtensionClient extensions;
    private PublicDiaryEndpoint endpoint;

    @BeforeEach
    void setup() {
        extensions = mock(ReactiveExtensionClient.class);
        when(extensions.fetch(DiaryNotebook.class, DiaryNotebook.NAME))
            .thenReturn(Mono.just(DiaryPrivacyTest.notebook()));
        when(extensions.fetch(eq(DiaryEntry.class), anyString())).thenReturn(Mono.empty());
        var access = new DiaryAccess(extensions, mock(UserService.class), mock(ReactiveSettingFetcher.class));
        endpoint = new PublicDiaryEndpoint(new DiaryService(extensions, access), access);
    }

    private WebTestClient browser(String username) {
        var builder = WebTestClient.bindToRouterFunction(endpoint.endpoint());
        if (username != null) {
            var authentication = UsernamePasswordAuthenticationToken.authenticated(username, "", List.of());
            builder.webFilter((exchange, chain) -> chain.filter(exchange)
                .contextWrite(ReactiveSecurityContextHolder.withAuthentication(authentication)));
        }
        return builder.build();
    }

    private String store(DiaryEntry entry) {
        when(extensions.fetch(DiaryEntry.class, entry.getMetadata().getName())).thenReturn(Mono.just(entry));
        return "/readableentries/" + entry.getMetadata().getName();
    }

    @Test
    void sameEndpointUsesHaloIdentityWithoutAClientSuppliedOwnerFlag() {
        String path = store(DiaryPrivacyTest.entry());
        browser("owner").get().uri(path).exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.working.title").isEqualTo("私密标题");
        browser(null).get().uri(path).exchange().expectStatus().isNotFound();
        browser("other").get().uri(path + "?view=private&owner=owner&publicOnly=false")
            .exchange().expectStatus().isNotFound();
    }

    @Test
    void visitorPreviewRestrictsTheOwnerToThePublishedSnapshot() {
        var entry = DiaryPrivacyTest.entry();
        entry.getSpec().setPublished(new DiaryEntry.Published("2026-09-01", "公开标题",
            "<p>已公开内容</p>", "已公开内容", "平静", "晴", Instant.now()));
        String path = store(entry);
        for (String username : new String[] {null, "other", "owner"}) {
            browser(username).get().uri(path + "?publicOnly=true").exchange().expectStatus().isOk()
                .expectHeader().valueEquals("Cache-Control", "private, no-store")
                .expectHeader().valueEquals("Vary", "Cookie, Authorization")
                .expectBody(String.class).value(body -> assertThat(body).contains("公开标题", "已公开内容", "平静")
                    .doesNotContain("私密", "working", "低落", "雨", "owner", "version"));
        }
        browser("owner").get().uri(path).exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.working.title").isEqualTo("私密标题");
    }

    @Test
    void anUnpublishedEntryCannotBeReadInVisitorPreview() {
        String path = store(DiaryPrivacyTest.entry());
        browser("owner").get().uri(path + "?publicOnly=true").exchange().expectStatus().isNotFound();
    }

    @Test
    void trashIsExcludedFromReadingEvenForTheOwner() {
        var entry = DiaryPrivacyTest.entry();
        DiaryService.applyAction(entry, "trash", Instant.now());
        String path = store(entry);
        browser("owner").get().uri(path).exchange().expectStatus().isNotFound();
    }

    @Test
    void calendarCountsSharedDatesForVisitorsAndCurrentDatesForTheOwner() {
        var shared = DiaryPrivacyTest.entry();
        shared.getSpec().setPublished(new DiaryEntry.Published("2026-09-01", "公开标题",
            "<p>已公开内容</p>", "已公开内容", "平静", "晴", Instant.now()));
        // 同一篇：当前日期 2026-09-20，分享版本的日期 2026-09-01。筛选条件与目录共用 options()。
        when(extensions.listAll(eq(DiaryEntry.class), any(ListOptions.class), any(Sort.class)))
            .thenAnswer(call -> Flux.just(shared));
        browser(null).get().uri("/readablecalendar?month=2026-09").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.days['2026-09-01']").isEqualTo(1)
            .jsonPath("$.days['2026-09-20']").doesNotExist();
        browser("owner").get().uri("/readablecalendar?month=2026-09").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.days['2026-09-20']").isEqualTo(1)
            .jsonPath("$.days['2026-09-01']").doesNotExist();
        browser("owner").get().uri("/readablecalendar?month=2026-09&publicOnly=true").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.days['2026-09-01']").isEqualTo(1);
        browser(null).get().uri("/readablecalendar?month=bad").exchange().expectStatus().isBadRequest();
    }
}
