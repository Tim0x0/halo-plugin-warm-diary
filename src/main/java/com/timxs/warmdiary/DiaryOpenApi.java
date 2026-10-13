package com.timxs.warmdiary;

import static org.springdoc.core.fn.builders.apiresponse.Builder.responseBuilder;
import static org.springdoc.core.fn.builders.content.Builder.contentBuilder;
import static org.springdoc.core.fn.builders.parameter.Builder.parameterBuilder;
import static org.springdoc.core.fn.builders.requestbody.Builder.requestBodyBuilder;
import static org.springdoc.core.fn.builders.schema.Builder.schemaBuilder;

import io.swagger.v3.oas.annotations.enums.ParameterIn;
import org.springdoc.core.fn.builders.operation.Builder;
import org.springframework.http.MediaType;

final class DiaryOpenApi {
    private DiaryOpenApi() {}

    static Builder operation(Builder b, String tag, String id, Class<?> result) {
        return b.tag(tag).operationId(id)
            .response(responseBuilder().responseCode("200").implementation(result));
    }

    static Builder named(Builder b) {
        return b.parameter(parameterBuilder().in(ParameterIn.PATH).name("name").required(true)
            .implementation(String.class).description("Diary identifier"));
    }

    static Builder body(Builder b, Class<?> type) {
        return b.parameter(parameterBuilder().in(ParameterIn.HEADER).name("X-Warm-Diary")
                .required(true).implementation(String.class).description("Must be 1"))
            .requestBody(requestBodyBuilder().required(true).content(contentBuilder()
                .mediaType(MediaType.APPLICATION_JSON_VALUE).schema(schemaBuilder().implementation(type))));
    }

    static Builder filters(Builder b, boolean owner) {
        b.parameter(parameterBuilder().in(ParameterIn.QUERY).name("page").implementation(Integer.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("size").implementation(Integer.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("keyword").implementation(String.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("from").implementation(String.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("to").implementation(String.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("mood").implementation(String.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("weather").implementation(String.class));
        if (owner) b.parameter(parameterBuilder().in(ParameterIn.QUERY).name("visibility").implementation(String.class))
            .parameter(parameterBuilder().in(ParameterIn.QUERY).name("trash").implementation(Boolean.class));
        return b;
    }
}
