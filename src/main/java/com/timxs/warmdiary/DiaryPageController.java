package com.timxs.warmdiary;

import static org.springframework.web.reactive.function.server.RequestPredicates.GET;
import static org.springframework.web.reactive.function.server.RouterFunctions.route;

import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.theme.TemplateNameResolver;
import run.halo.app.theme.router.ModelConst;

@Component
@RequiredArgsConstructor
public class DiaryPageController {
    // 页面不加载任何网络图片；img-src 只放行手帐样式里内联的 data: 图标（下拉框箭头）。
    private static final String CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    private final DiaryService diaries;
    private final TemplateNameResolver templates;
    private final DiaryAccess access;

    @Bean
    RouterFunction<ServerResponse> diaryPages() {
        return routes();
    }

    RouterFunction<ServerResponse> routes() {
        return route(GET("/diary"), req -> shell(req, HttpStatus.OK))
            .andRoute(GET("/diary/"), req -> shell(req, HttpStatus.OK))
            .andRoute(GET("/diary/write"), req -> shell(req, HttpStatus.OK))
            .andRoute(GET("/diary/entry/{id}"), this::entry);
    }

    private Mono<ServerResponse> entry(ServerRequest request) {
        return diaries.getReadable(request.pathVariable("id"), false)
            .then(shell(request, HttpStatus.OK))
            .onErrorResume(ResponseStatusException.class, error -> {
                if (error.getStatusCode().value() != 404) return Mono.error(error);
                return shell(request, HttpStatus.NOT_FOUND);
            });
    }

    private Mono<ServerResponse> shell(ServerRequest request, HttpStatus status) {
        return access.stickyNote().flatMap(sticky -> {
            Map<String, Object> model = new HashMap<>();
            model.put(ModelConst.TEMPLATE_ID, "diary");
            model.put("stickyNote", sticky);
            return templates.resolveTemplateNameOrDefault(request.exchange(), "diary")
                .flatMap(name -> headers(ServerResponse.status(status)).render(name, model));
        });
    }

    private ServerResponse.BodyBuilder headers(ServerResponse.BodyBuilder response) {
        return response.contentType(MediaType.TEXT_HTML)
            .header("Cache-Control", "private, no-store")
            .header("X-Robots-Tag", "noindex, nofollow")
            .header("X-Content-Type-Options", "nosniff")
            .header("Referrer-Policy", "same-origin")
            .header("Content-Security-Policy", CSP);
    }
}
