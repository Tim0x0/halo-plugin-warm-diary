package com.timxs.warmdiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.halo.app.core.user.service.UserService;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.plugin.ReactiveSettingFetcher;

class DiaryAccessTest {
    @Test
    void sessionExposesInitializationPermissionWithoutTreatingLoginAsOwnership() {
        var client = mock(ReactiveExtensionClient.class);
        var users = mock(UserService.class);
        var settings = mock(ReactiveSettingFetcher.class);
        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class)))
            .thenReturn(Mono.just(new DiaryAccess.BasicSettings("Asia/Shanghai", null)));
        when(client.fetch(DiaryNotebook.class, DiaryNotebook.NAME)).thenReturn(Mono.empty());
        when(users.hasSufficientRoles(any())).thenReturn(Mono.just(true));
        var access = new DiaryAccess(client, users, settings);
        var admin = UsernamePasswordAuthenticationToken.authenticated("admin", "", List.of());

        StepVerifier.create(access.session().contextWrite(ReactiveSecurityContextHolder.withAuthentication(admin)))
            .assertNext(session -> assertThat(session)
                .extracting(DiaryAccess.Session::initialized, DiaryAccess.Session::isOwner,
                    DiaryAccess.Session::loggedIn, DiaryAccess.Session::canInitialize)
                .containsExactly(false, false, true, true))
            .verifyComplete();

        when(users.hasSufficientRoles(any())).thenReturn(Mono.just(false));
        var reader = UsernamePasswordAuthenticationToken.authenticated("reader", "", List.of());
        StepVerifier.create(access.session().contextWrite(ReactiveSecurityContextHolder.withAuthentication(reader)))
            .assertNext(session -> assertThat(session.canInitialize()).isFalse())
            .verifyComplete();

        StepVerifier.create(access.session())
            .assertNext(session -> assertThat(session)
                .extracting(DiaryAccess.Session::initialized, DiaryAccess.Session::loggedIn,
                    DiaryAccess.Session::canInitialize)
                .containsExactly(false, false, false))
            .verifyComplete();
    }

    @Test
    void initializedNotebookCannotBeClaimedAgainByAnyAccount() {
        var client = mock(ReactiveExtensionClient.class);
        var users = mock(UserService.class);
        var settings = mock(ReactiveSettingFetcher.class);
        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class)))
            .thenReturn(Mono.just(new DiaryAccess.BasicSettings("Asia/Shanghai", null)));
        when(client.fetch(DiaryNotebook.class, DiaryNotebook.NAME))
            .thenReturn(Mono.just(DiaryPrivacyTest.notebook()));
        var access = new DiaryAccess(client, users, settings);

        for (String name : List.of("owner", "other-admin")) {
            var account = UsernamePasswordAuthenticationToken.authenticated(name, "", List.of());
            StepVerifier.create(access.session().contextWrite(ReactiveSecurityContextHolder.withAuthentication(account)))
                .assertNext(session -> assertThat(session)
                    .extracting(DiaryAccess.Session::initialized, DiaryAccess.Session::isOwner,
                        DiaryAccess.Session::canInitialize)
                    .containsExactly(true, name.equals("owner"), false))
                .verifyComplete();
        }
        StepVerifier.create(access.session())
            .assertNext(session -> assertThat(session.canInitialize()).isFalse())
            .verifyComplete();
        verifyNoInteractions(users);

        when(users.hasSufficientRoles(any())).thenReturn(Mono.just(true));
        var otherAdmin = UsernamePasswordAuthenticationToken.authenticated("other-admin", "", List.of());
        StepVerifier.create(access.initialize().contextWrite(ReactiveSecurityContextHolder.withAuthentication(otherAdmin)))
            .expectErrorSatisfies(error -> assertThat(error)
                .isInstanceOfSatisfying(ResponseStatusException.class,
                    response -> assertThat(response.getStatusCode().value()).isEqualTo(409)))
            .verify();
        verify(client, never()).create(any(DiaryNotebook.class));
    }

    @Test
    void loginAloneDoesNotGrantPrivateAccess() {
        var client = mock(ReactiveExtensionClient.class);
        when(client.fetch(DiaryNotebook.class, DiaryNotebook.NAME)).thenReturn(Mono.just(DiaryPrivacyTest.notebook()));
        var access = new DiaryAccess(client, mock(UserService.class), mock(ReactiveSettingFetcher.class));
        StepVerifier.create(access.requireOwner()).expectError(ResponseStatusException.class).verify();
        var other = UsernamePasswordAuthenticationToken.authenticated("other", "", List.of());
        StepVerifier.create(access.requireOwner().contextWrite(ReactiveSecurityContextHolder.withAuthentication(other)))
            .expectError(ResponseStatusException.class).verify();
        var owner = UsernamePasswordAuthenticationToken.authenticated("owner", "", List.of());
        StepVerifier.create(access.requireOwner().contextWrite(ReactiveSecurityContextHolder.withAuthentication(owner)))
            .assertNext(name -> assertThat(name).isEqualTo("owner")).verifyComplete();
    }

    @Test
    void ordinaryUserCannotClaimAnUninitializedNotebook() {
        var client = mock(ReactiveExtensionClient.class);
        var users = mock(UserService.class);
        when(users.hasSufficientRoles(any())).thenReturn(Mono.just(false));
        var access = new DiaryAccess(client, users, mock(ReactiveSettingFetcher.class));
        var other = UsernamePasswordAuthenticationToken.authenticated("other", "", List.of());
        StepVerifier.create(access.initialize().contextWrite(ReactiveSecurityContextHolder.withAuthentication(other)))
            .expectError(ResponseStatusException.class).verify();
        verifyNoInteractions(client);
    }

    @Test
    void stickyNoteUsesPluginSettingAndFallsBackToDefault() {
        var settings = mock(ReactiveSettingFetcher.class);
        var access = new DiaryAccess(mock(ReactiveExtensionClient.class), mock(UserService.class), settings);

        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class)))
            .thenReturn(Mono.just(new DiaryAccess.BasicSettings("Asia/Shanghai", "  给自己留一句。  ")));
        StepVerifier.create(access.stickyNote()).expectNext("给自己留一句。").verifyComplete();

        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class)))
            .thenReturn(Mono.just(new DiaryAccess.BasicSettings("Asia/Shanghai", "   ")));
        StepVerifier.create(access.stickyNote()).expectNext(DiaryAccess.DEFAULT_STICKY).verifyComplete();

        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class))).thenReturn(Mono.empty());
        StepVerifier.create(access.stickyNote()).expectNext(DiaryAccess.DEFAULT_STICKY).verifyComplete();

        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class)))
            .thenReturn(Mono.error(new RuntimeException("unavailable")));
        StepVerifier.create(access.stickyNote()).expectNext(DiaryAccess.DEFAULT_STICKY).verifyComplete();
    }
}
