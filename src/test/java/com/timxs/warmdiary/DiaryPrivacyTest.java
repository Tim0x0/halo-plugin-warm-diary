package com.timxs.warmdiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.UUID;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import tools.jackson.databind.json.JsonMapper;

class DiaryPrivacyTest {
    ReactiveExtensionClient client;
    DiaryAccess access;
    DiaryService service;

    @BeforeEach
    void setup() {
        client = mock(ReactiveExtensionClient.class);
        access = mock(DiaryAccess.class);
        when(access.username()).thenReturn(Mono.just("admin"));
        service = new DiaryService(client, access);
    }

    static DiaryEntry entry() {
        var e = new DiaryEntry();
        var m = new Metadata();
        m.setName(UUID.randomUUID().toString()); m.setVersion(7L); m.setCreationTimestamp(Instant.parse("2026-09-01T08:00:00Z"));
        e.setMetadata(m);
        var spec = new DiaryEntry.Spec(); spec.setAuthor("admin");
        spec.setWorking(new DiaryEntry.Content("2026-09-20", "私密标题", "<p>私密正文</p>", "私密正文", "低落", "雨"));
        e.setSpec(spec); return e;
    }

    @Test
    void publicSnapshotNeverIncludesDraftOrPrivateMetadata() {
        var e = entry();
        e.getSpec().setPublished(new DiaryEntry.Published("2026-09-10", "公开标题", "<p>旧版本</p>", "旧版本",
            "平静", "晴", Instant.parse("2026-09-10T08:00:00Z")));
        var json = new JsonMapper().writeValueAsString(DiaryService.publicView(e));
        assertThat(json).contains("2026-09-10", "公开标题", "旧版本", "平静", "晴")
            .doesNotContain("私密", "2026-09-20", "低落", "雨", "author", "version", "updatedAt", "working");
    }

    @Test
    void moodAndWeatherAreSharedWithTheEntry() {
        var e = entry();
        DiaryService.applyAction(e, "publish", Instant.now());
        var shared = DiaryService.publicView(e);
        assertThat(shared.mood()).isEqualTo("低落");
        assertThat(shared.weather()).isEqualTo("雨");
        assertThat(DiaryService.privateView(e).pendingChanges()).isFalse();
        assertThat(DiaryService.privateView(e).changedFields()).isEmpty();
        var w = e.getSpec().getWorking();
        e.getSpec().setWorking(new DiaryEntry.Content(w.date(), w.title(), w.html(), w.text(), "平静", w.weather()));
        assertThat(DiaryService.privateView(e).pendingChanges()).isTrue();
        assertThat(DiaryService.privateView(e).changedFields()).containsExactly("mood");
        assertThat(DiaryService.publicView(e).mood()).isEqualTo("低落");
    }

    @Test
    void moodAndWeatherMustComeFromTheOptions() {
        var valid = DiaryContent.validate(new DiaryService.Write(null, null, "2026-09-20", "x", "", "怀念", "多云"));
        assertThat(valid.mood()).isEqualTo("怀念");
        assertThat(valid.weather()).isEqualTo("多云");
        assertThatThrownBy(() -> DiaryContent.validate(new DiaryService.Write(null, null, "2026-09-20", "x", "", "开心", "")))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> DiaryContent.validate(new DiaryService.Write(null, null, "2026-09-20", "x", "", "", "晴转多云")))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void privateTrashedAndDeletedEntriesAreIndistinguishableFromMissing() {
        var e = entry();
        assertNotFound(e);
        DiaryService.applyAction(e, "publish", Instant.now());
        DiaryService.applyAction(e, "trash", Instant.now());
        assertNotFound(e);
        DiaryService.applyAction(e, "restore", Instant.now());
        assertNotFound(e);
        assertThat(e.getSpec().getWorking().title()).isEqualTo("私密标题");
        DiaryService.applyAction(e, "publish", Instant.now());
        e.getMetadata().setDeletionTimestamp(Instant.now());
        assertNotFound(e);
    }

    private void assertNotFound(DiaryEntry e) {
        assertThatThrownBy(() -> DiaryService.publicView(e)).isInstanceOfSatisfying(ResponseStatusException.class,
            ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void listSummariesCarryAnExcerptInsteadOfTheFullBody() {
        var e = entry();
        e.getSpec().setWorking(new DiaryEntry.Content("2026-09-20", "", "<p>长文</p>", "一".repeat(100) + "尾巴",
            "低落", "雨"));
        DiaryService.applyAction(e, "publish", Instant.parse("2026-09-20T08:00:00Z"));
        var json = new JsonMapper().writeValueAsString(DiaryService.summary(e));
        assertThat(json).contains("\"excerpt\"", "\"shared\":true").doesNotContain("<p>", "尾巴", "\"html\"", "\"text\"");
        assertThat(DiaryService.summary(e).excerpt()).hasSize(80);
        var visitor = new JsonMapper().writeValueAsString(DiaryService.publicSummary(e));
        assertThat(visitor).doesNotContain("<p>", "version", "working", "pendingChanges", "author");
    }

    @Test
    void autosaveKeepsPublishedContentUntilExplicitPublish() {
        var e = entry();
        DiaryService.applyAction(e, "publish", Instant.now());
        var original = e.getSpec().getPublished();
        when(client.fetch(DiaryEntry.class, e.getMetadata().getName())).thenReturn(Mono.just(e));
        when(client.update(any(DiaryEntry.class))).thenAnswer(call -> Mono.just(call.getArgument(0)));
        var input = new DiaryService.Write(null, "7", "2026-08-01", "新标题", "<p>新的未公开内容</p>", "平静", "晴");
        StepVerifier.create(service.update(e.getMetadata().getName(), input)).assertNext(result -> {
            assertThat(result.pendingChanges()).isTrue();
            assertThat(result.working().title()).isEqualTo("新标题");
            assertThat(result.published()).isEqualTo(original);
        }).verifyComplete();
        DiaryService.applyAction(e, "publish", Instant.now());
        assertThat(DiaryService.publicView(e).title()).isEqualTo("新标题");
    }

    @Test
    void staleWriteAndStalePublishCannotOverwriteNewerVersion() {
        var e = entry();
        when(client.fetch(DiaryEntry.class, e.getMetadata().getName())).thenReturn(Mono.just(e));
        StepVerifier.create(service.update(e.getMetadata().getName(), new DiaryService.Write(null, "6", "2026-09-20", "覆盖", "<p>覆盖</p>", "", "")))
            .expectErrorMatches(ex -> ex instanceof ResponseStatusException r && r.getStatusCode().value() == 409).verify();
        StepVerifier.create(service.action(e.getMetadata().getName(), "publish", new DiaryService.Version("6")))
            .expectErrorMatches(ex -> ex instanceof ResponseStatusException r && r.getStatusCode().value() == 409).verify();
        verify(client, never()).update(any(DiaryEntry.class));
        assertThat(e.getSpec().getPublished()).isNull();
    }

    @Test
    void createRecordsTheAuthorAndRequiresAStableClientId() {
        var name = UUID.randomUUID().toString();
        when(client.fetch(DiaryEntry.class, name)).thenReturn(Mono.empty());
        when(client.create(any(DiaryEntry.class))).thenAnswer(call -> Mono.just(call.getArgument(0)));
        StepVerifier.create(service.create(new DiaryService.Write(name, null, "2026-09-20", "标题", "<p>内容</p>", "", "")))
            .assertNext(result -> assertThat(result.name()).isEqualTo(name))
            .verifyComplete();
        var created = ArgumentCaptor.forClass(DiaryEntry.class);
        verify(client).create(created.capture());
        assertThat(created.getValue().getSpec().getAuthor()).isEqualTo("admin");
        assertThat(created.getValue().getSpec().getTrashedAt()).isNull();
        assertThat(created.getValue().getSpec().getPublished()).isNull();
    }

    @Test
    void writesWithoutAStableIdAreRejectedBeforeTouchingStorage() {
        StepVerifier.create(service.create(new DiaryService.Write("not-a-uuid", null, "2026-09-20", "标题", "<p>内容</p>", "", "")))
            .expectErrorMatches(ex -> ex instanceof ResponseStatusException r && r.getStatusCode().value() == 400).verify();
        verifyNoInteractions(client);
    }

    @Test
    void lostCreateResponseCanBeRetriedWithoutCreatingDuplicatesOrPublishing() {
        var e = entry(); var w = e.getSpec().getWorking();
        when(client.fetch(DiaryEntry.class, e.getMetadata().getName())).thenReturn(Mono.just(e));
        StepVerifier.create(service.create(new DiaryService.Write(e.getMetadata().getName(), null, w.date(), w.title(), w.html(), w.mood(), w.weather())))
            .assertNext(result -> { assertThat(result.version()).isEqualTo("7"); assertThat(result.published()).isNull(); }).verifyComplete();
        verify(client, never()).create(any(DiaryEntry.class));
    }

    @Test
    void sanitizerKeepsTextFormattingAndRemovesMediaAndActiveContent() {
        var clean = DiaryContent.validate(new DiaryService.Write(null, null, "2026-09-20", "",
            "<p onclick='alert(1)'>今天<strong>很好</strong><em>慢慢来</em><img src='https://example.com/private.jpg'><iframe src='x'></iframe><script>alert(1)</script><a href='javascript:alert(1)'>文字</a></p><ul><li>小事</li></ul>", "", ""));
        assertThat(clean.html()).contains("<strong>很好</strong>", "<em>慢慢来</em>", "<ul><li>小事</li></ul>")
            .doesNotContain("img", "https://", "iframe", "script", "onclick", "href");
        assertThatThrownBy(() -> DiaryContent.validate(new DiaryService.Write(null, null, "2026-02-30", "x", "", "", "")))
            .isInstanceOf(ResponseStatusException.class);
    }
}
