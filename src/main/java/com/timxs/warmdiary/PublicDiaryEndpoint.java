package com.timxs.warmdiary;

import static com.timxs.warmdiary.DiaryOpenApi.*;
import static org.springdoc.core.fn.builders.parameter.Builder.parameterBuilder;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import lombok.RequiredArgsConstructor;
import org.springdoc.webflux.core.fn.SpringdocRouteBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;

@Component
@RequiredArgsConstructor
public class PublicDiaryEndpoint implements CustomEndpoint {
    private final DiaryService service;
    private final DiaryAccess access;

    @Override
    public GroupVersion groupVersion() { return new GroupVersion("api.warm-diary.timxs.com", "v1alpha1"); }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        String tag = "DiaryV1alpha1Public";
        return DiaryEndpoint.withErrors(SpringdocRouteBuilder.route()
            .GET("/readableentries", r -> DiaryEndpoint.json(service.listReadable(DiaryService.Query.from(r), publicOnly(r))),
                b -> filters(operation(b, tag, "listReadableEntries", DiaryService.ReadingPage.class), false)
                    .parameter(parameterBuilder().in(ParameterIn.QUERY).name("visibility").implementation(String.class))
                    .parameter(parameterBuilder().in(ParameterIn.QUERY).name("publicOnly").implementation(Boolean.class)
                        .description("Restrict to published snapshots for visitor preview; never grants access.")))
            .GET("/readableentries/{name}", r -> DiaryEndpoint.json(service.getReadable(r.pathVariable("name"), publicOnly(r))),
                b -> named(operation(b, tag, "getReadableEntry", DiaryService.ReadingEntry.class))
                    .parameter(parameterBuilder().in(ParameterIn.QUERY).name("publicOnly").implementation(Boolean.class)))
            .GET("/readablecalendar", r -> DiaryEndpoint.json(service.readableCalendar(r.queryParam("month").orElse(""),
                    publicOnly(r)).map(DiaryService.Calendar::new)),
                b -> operation(b, tag, "getReadableCalendar", DiaryService.Calendar.class)
                    .parameter(parameterBuilder().in(ParameterIn.QUERY).name("month").required(true).implementation(String.class))
                    .parameter(parameterBuilder().in(ParameterIn.QUERY).name("publicOnly").implementation(Boolean.class)))
            .GET("/session", r -> DiaryEndpoint.json(access.session()),
                b -> operation(b, tag, "getDiarySession", DiaryAccess.Session.class))
            .build());
    }

    private static boolean publicOnly(ServerRequest request) {
        return request.queryParam("publicOnly").map(Boolean::parseBoolean).orElse(false);
    }
}
