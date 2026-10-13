package com.timxs.warmdiary;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.URL;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.infra.ExternalUrlSupplier;

class DiaryEndpointTest {
    private static final String INITIALIZE = "http://localhost/notebooks/-/initialize";

    static WebTestClient client(String externalUrl) {
        var access = mock(DiaryAccess.class);
        var supplier = mock(ExternalUrlSupplier.class);
        if (externalUrl != null) when(supplier.getRaw()).thenReturn(url(externalUrl));
        when(access.initialize()).thenReturn(Mono.just(DiaryPrivacyTest.notebook()));
        var endpoint = new DiaryEndpoint(new DiaryService(mock(ReactiveExtensionClient.class), access), access, supplier);
        return WebTestClient.bindToRouterFunction(endpoint.endpoint()).build();
    }

    private static URL url(String value) {
        try {
            return URI.create(value).toURL();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static WebTestClient.ResponseSpec initialize(WebTestClient client, String origin, boolean header) {
        var request = client.post().uri(INITIALIZE);
        if (header) request = request.header("X-Warm-Diary", "1");
        if (origin != null) request = request.header("Origin", origin);
        return request.exchange();
    }

    @Test
    void writesRequireTheDiaryHeaderAndAFirstPartyOrigin() {
        var client = client("https://blog.example.test");
        initialize(client, null, false).expectStatus().isForbidden();
        client.post().uri(INITIALIZE).header("X-Warm-Diary", "1").header("Sec-Fetch-Site", "cross-site")
            .exchange().expectStatus().isForbidden();
        initialize(client, "https://evil.example.test", true).expectStatus().isForbidden();
        // 反向代理未转发 X-Forwarded-* 时，请求地址和站点对外地址都算本站。
        initialize(client, "http://localhost", true).expectStatus().isOk();
        initialize(client, "https://blog.example.test", true).expectStatus().isOk();
    }

    @Test
    void withoutAnExternalUrlOnlyTheRequestOriginIsAccepted() {
        var client = client(null);
        initialize(client, "http://localhost", true).expectStatus().isOk();
        initialize(client, "https://blog.example.test", true).expectStatus().isForbidden();
    }
}
