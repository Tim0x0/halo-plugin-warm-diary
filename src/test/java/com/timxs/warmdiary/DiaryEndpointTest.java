package com.timxs.warmdiary;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.URL;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.infra.ExternalUrlSupplier;

class DiaryEndpointTest {
    static WebTestClient client(String externalUrl) {
        var access = mock(DiaryAccess.class);
        var supplier = mock(ExternalUrlSupplier.class);
        if (externalUrl != null) when(supplier.getRaw()).thenReturn(url(externalUrl));
        var endpoint = new DiaryEndpoint(new DiaryService(mock(ReactiveExtensionClient.class), access), supplier);
        return WebTestClient.bindToRouterFunction(endpoint.endpoint()).build();
    }

    private static URL url(String value) {
        try {
            return URI.create(value).toURL();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // 写操作都带 X-Warm-Diary 与本站 Origin；过了这道校验就没有请求体，因此回 400。
    private static WebTestClient.ResponseSpec write(WebTestClient client, String origin, boolean header) {
        var request = client.post().uri("http://localhost/entries");
        if (header) request = request.header("X-Warm-Diary", "1");
        if (origin != null) request = request.header("Origin", origin);
        return request.exchange();
    }

    @Test
    void writesRequireTheDiaryHeaderAndAFirstPartyOrigin() {
        var client = client("https://blog.example.test");
        write(client, null, false).expectStatus().isForbidden();
        client.post().uri("http://localhost/entries").header("X-Warm-Diary", "1").header("Sec-Fetch-Site", "cross-site")
            .exchange().expectStatus().isForbidden();
        write(client, "https://evil.example.test", true).expectStatus().isForbidden();
        // 反向代理未转发 X-Forwarded-* 时，请求地址和站点对外地址都算本站。
        write(client, "http://localhost", true).expectStatus().isBadRequest();
        write(client, "https://blog.example.test", true).expectStatus().isBadRequest();
    }

    @Test
    void withoutAnExternalUrlOnlyTheRequestOriginIsAccepted() {
        var client = client(null);
        write(client, "http://localhost", true).expectStatus().isBadRequest();
        write(client, "https://blog.example.test", true).expectStatus().isForbidden();
    }
}
