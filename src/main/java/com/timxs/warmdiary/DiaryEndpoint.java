package com.timxs.warmdiary;

import static com.timxs.warmdiary.DiaryOpenApi.*;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springdoc.webflux.core.fn.SpringdocRouteBuilder;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.halo.app.infra.ExternalUrlSupplier;

@Component
@RequiredArgsConstructor
public class DiaryEndpoint implements CustomEndpoint {
    private final DiaryService service;
    private final ExternalUrlSupplier externalUrl;

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("console.api.warm-diary.timxs.com", "v1alpha1");
    }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        String tag = "DiaryV1alpha1Console";
        return withErrors(SpringdocRouteBuilder.route()
            .GET("/entries", r -> json(service.listPrivate(DiaryService.Query.from(r))),
                b -> filters(operation(b, tag, "listPrivateEntries", DiaryService.EntryPage.class), true))
            .GET("/entries/{name}", r -> json(service.getPrivate(r.pathVariable("name"))),
                b -> named(operation(b, tag, "getPrivateEntry", DiaryService.PrivateEntry.class)))
            .POST("/entries", r -> json(readBody(r, DiaryService.Write.class).flatMap(service::create)),
                b -> DiaryOpenApi.body(operation(b, tag, "createEntry", DiaryService.PrivateEntry.class), DiaryService.Write.class))
            .PUT("/entries/{name}", r -> json(readBody(r, DiaryService.Write.class).flatMap(w -> service.update(r.pathVariable("name"), w))),
                b -> DiaryOpenApi.body(named(operation(b, tag, "updateEntry", DiaryService.PrivateEntry.class)), DiaryService.Write.class))
            .POST("/entries/{name}/publish", r -> action(r, "publish"),
                b -> DiaryOpenApi.body(named(operation(b, tag, "publishEntry", DiaryService.PrivateEntry.class)), DiaryService.Version.class))
            .POST("/entries/{name}/unpublish", r -> action(r, "unpublish"),
                b -> DiaryOpenApi.body(named(operation(b, tag, "unpublishEntry", DiaryService.PrivateEntry.class)), DiaryService.Version.class))
            .POST("/entries/{name}/trash", r -> action(r, "trash"),
                b -> DiaryOpenApi.body(named(operation(b, tag, "trashEntry", DiaryService.PrivateEntry.class)), DiaryService.Version.class))
            .POST("/entries/{name}/restore", r -> action(r, "restore"),
                b -> DiaryOpenApi.body(named(operation(b, tag, "restoreEntry", DiaryService.PrivateEntry.class)), DiaryService.Version.class))
            .POST("/entries/{name}/delete", r -> readBody(r, DiaryService.Version.class)
                .flatMap(v -> service.delete(r.pathVariable("name"), v)).then(ok().bodyValue(new Deleted(true))),
                b -> DiaryOpenApi.body(named(operation(b, tag, "deleteEntry", Deleted.class)), DiaryService.Version.class))
            .build());
    }

    @Schema(name = "DiaryDeleted", requiredProperties = {"deleted"})
    public record Deleted(boolean deleted) {}

    private Mono<ServerResponse> action(ServerRequest r, String action) {
        return json(readBody(r, DiaryService.Version.class).flatMap(v -> service.action(r.pathVariable("name"), action, v)));
    }

    // RouterFunction 单测没有 Halo 全局异常处理，这里把常见错误映射为 JSON。
    static RouterFunction<ServerResponse> withErrors(RouterFunction<ServerResponse> routes) {
        return routes.filter((request, next) -> next.handle(request)
            .onErrorResume(OptimisticLockingFailureException.class,
                e -> error(HttpStatus.CONFLICT, "日记已有新版本，请先查看最新版本"))
            .onErrorResume(ResponseStatusException.class, e -> error(
                HttpStatus.valueOf(e.getStatusCode().value()),
                e.getReason() == null ? "请求未能完成" : e.getReason())));
    }

    static ServerResponse.BodyBuilder jsonHeaders(ServerResponse.BodyBuilder response) {
        return response.header("Cache-Control", "private, no-store")
            .header("Vary", "Cookie, Authorization")
            .header("X-Content-Type-Options", "nosniff");
    }

    static ServerResponse.BodyBuilder ok() {
        return jsonHeaders(ServerResponse.ok().contentType(MediaType.APPLICATION_JSON));
    }

    static Mono<ServerResponse> json(Mono<?> value) { return value.flatMap(v -> ok().bodyValue(v)); }

    static Mono<ServerResponse> error(HttpStatus status, String message) {
        return jsonHeaders(ServerResponse.status(status).contentType(MediaType.APPLICATION_JSON))
            .bodyValue(Map.of("status", status.value(), "detail", message));
    }

    private <T> Mono<T> readBody(ServerRequest request, Class<T> type) {
        checkMutation(request);
        return request.bodyToMono(type).switchIfEmpty(Mono.error(DiaryContent.badRequest("缺少请求内容")));
    }

    private void checkMutation(ServerRequest r) {
        // Halo excludes /apis from CSRF checks. Custom headers prevent form-based cross-site writes.
        if (!"1".equals(r.headers().firstHeader("X-Warm-Diary"))
            || "cross-site".equals(r.headers().firstHeader("Sec-Fetch-Site"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "请从本站日记页面操作");
        }
        String origin = r.headers().firstHeader("Origin");
        if (origin == null) return;
        // 反向代理未转发 X-Forwarded-* 时，请求 URI 是内网地址；配置了 halo.external-url 就同时接受站点对外地址。
        String external = externalOrigin();
        if (!origin.equals(r.uri().getScheme() + "://" + r.uri().getRawAuthority())
            && !origin.equals(external)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "不允许跨站修改日记");
        }
    }

    private String externalOrigin() {
        var external = externalUrl.getRaw();
        return external == null ? null : external.getProtocol() + "://" + external.getAuthority();
    }
}
