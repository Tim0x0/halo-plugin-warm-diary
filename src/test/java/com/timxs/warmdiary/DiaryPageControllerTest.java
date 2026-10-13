package com.timxs.warmdiary;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.server.HandlerStrategies;
import org.springframework.web.reactive.result.view.View;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.theme.TemplateNameResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DiaryPageControllerTest {
    private DiaryAccess access;
    private ReactiveExtensionClient extensions;
    private WebTestClient web;

    @BeforeEach
    void setup() {
        access = mock(DiaryAccess.class);
        extensions = mock(ReactiveExtensionClient.class);
        var templates = mock(TemplateNameResolver.class);
        session(true, true);
        when(access.stickyNote()).thenReturn(Mono.just("不必写得漂亮，\n真实就很好。"));
        when(templates.resolveTemplateNameOrDefault(any(), eq("diary"))).thenReturn(Mono.just("diary"));
        when(extensions.fetch(eq(DiaryEntry.class), anyString())).thenReturn(Mono.empty());
        View view = (model, contentType, exchange) -> {
            var response = exchange.getResponse();
            response.getHeaders().setContentType(MediaType.TEXT_HTML);
            var buffer = response.bufferFactory()
                .wrap("<html><body>日记页面</body></html>".getBytes(StandardCharsets.UTF_8));
            return response.writeWith(Mono.just(buffer));
        };
        web = WebTestClient.bindToRouterFunction(
                new DiaryPageController(new DiaryService(extensions, access), templates, access).routes())
            .handlerStrategies(HandlerStrategies.builder().viewResolver((name, locale) -> Mono.just(view)).build())
            .build();
    }

    private void session(boolean owner, boolean loggedIn) {
        when(access.isOwner()).thenReturn(Mono.just(owner));
        when(access.requireOwner()).thenReturn(owner
            ? Mono.just("owner")
            : Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN, "只有日记主人可以访问")));
        when(access.session()).thenReturn(Mono.just(
            new DiaryAccess.Session(true, owner, loggedIn, "Asia/Shanghai", "2026-09-20", false)));
    }

    private String store(DiaryEntry entry) {
        String name = entry.getMetadata().getName();
        when(extensions.fetch(DiaryEntry.class, name)).thenReturn(Mono.just(entry));
        return "/diary/entry/" + name;
    }

    @Test
    void ownerCanOpenPrivateEntryAtTheCanonicalUrl() {
        String path = store(DiaryPrivacyTest.entry());
        web.get().uri(path).exchange().expectStatus().isOk()
            .expectHeader().valueEquals("Cache-Control", "private, no-store")
            .expectHeader().valueMatches("Content-Security-Policy",
                "default-src 'self'; script-src 'self'; .*img-src data:; object-src 'none'; .*")
            .expectBody(String.class).value(body -> assertThat(body).doesNotContain("私密正文", "低落"));
    }

    @Test
    void anonymousAndOtherAccountsGetIdentical404ForPrivateAndMissingEntries() {
        String path = store(DiaryPrivacyTest.entry());
        for (boolean loggedIn : new boolean[] {false, true}) {
            session(false, loggedIn);
            byte[] privateBody = web.get().uri(path).exchange().expectStatus().isNotFound()
                .expectHeader().valueEquals("Cache-Control", "private, no-store")
                .expectBody().returnResult().getResponseBody();
            byte[] missingBody = web.get().uri("/diary/entry/missing").exchange()
                .expectStatus().isNotFound().expectBody().returnResult().getResponseBody();
            assertThat(privateBody).isEqualTo(missingBody);
        }
    }

    @Test
    void obsoleteViewParameterDoesNotDecidePagePermissions() {
        String path = store(DiaryPrivacyTest.entry());
        web.get().uri(path + "?view=public").exchange().expectStatus().isOk();
        web.get().uri(path).exchange().expectStatus().isOk();
        session(false, true);
        web.get().uri(path + "?view=private").exchange().expectStatus().isNotFound();
    }

    @Test
    void publishedEntryIsReadableAtTheSamePathByEveryAudience() {
        var entry = DiaryPrivacyTest.entry();
        DiaryService.applyAction(entry, "publish", Instant.now());
        String path = store(entry);
        for (boolean loggedIn : new boolean[] {false, true}) {
            session(false, loggedIn);
            web.get().uri(path).exchange().expectStatus().isOk();
        }
        session(true, true);
        web.get().uri(path + "?view=public").exchange().expectStatus().isOk();
        web.get().uri(path).exchange().expectStatus().isOk();
    }

    @Test
    void trashedEntryIsNotReadableEvenByOwner() {
        var entry = DiaryPrivacyTest.entry();
        DiaryService.applyAction(entry, "trash", Instant.now());
        String path = store(entry);
        web.get().uri(path).exchange().expectStatus().isNotFound();
        web.get().uri(path + "?view=public").exchange().expectStatus().isNotFound();
    }
}
