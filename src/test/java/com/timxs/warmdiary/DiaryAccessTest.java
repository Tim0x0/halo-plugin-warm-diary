package com.timxs.warmdiary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.halo.app.core.user.service.UserService;
import run.halo.app.plugin.ReactiveSettingFetcher;

class DiaryAccessTest {
    private final UserService users = mock(UserService.class);
    private final ReactiveSettingFetcher settings = mock(ReactiveSettingFetcher.class);

    private DiaryAccess access(boolean manage) {
        when(settings.fetch(eq("basic"), eq(DiaryAccess.BasicSettings.class)))
            .thenReturn(Mono.just(new DiaryAccess.BasicSettings("Asia/Shanghai", null)));
        when(users.hasSufficientRoles(any())).thenReturn(Mono.just(manage));
        return new DiaryAccess(users, settings);
    }

    private static UsernamePasswordAuthenticationToken account(String name) {
        return UsernamePasswordAuthenticationToken.authenticated(name, "", List.of());
    }

    @Test
    void sessionReportsManagePermissionFromRolesNotFromLogin() {
        StepVerifier.create(access(true).session().contextWrite(ReactiveSecurityContextHolder.withAuthentication(account("admin"))))
            .assertNext(session -> assertThat(session)
                .extracting(DiaryAccess.Session::canManage, DiaryAccess.Session::loggedIn)
                .containsExactly(true, true))
            .verifyComplete();

        StepVerifier.create(access(false).session().contextWrite(ReactiveSecurityContextHolder.withAuthentication(account("reader"))))
            .assertNext(session -> assertThat(session)
                .extracting(DiaryAccess.Session::canManage, DiaryAccess.Session::loggedIn)
                .containsExactly(false, true))
            .verifyComplete();

        StepVerifier.create(access(false).session())
            .assertNext(session -> assertThat(session)
                .extracting(DiaryAccess.Session::canManage, DiaryAccess.Session::loggedIn)
                .containsExactly(false, false))
            .verifyComplete();
    }

    @Test
    void canManageAsksHaloForTheManageRoleSoSuperAdminsPassAutomatically() {
        var access = access(true);
        StepVerifier.create(access.canManage()).expectNext(true).verifyComplete();
        verify(users).hasSufficientRoles(Set.of(DiaryAccess.MANAGE_ROLE));
    }

    @Test
    void loginAloneDoesNotGrantManagePermission() {
        var access = access(false);
        StepVerifier.create(access.canManage().contextWrite(ReactiveSecurityContextHolder.withAuthentication(account("other"))))
            .expectNext(false).verifyComplete();
    }

    @Test
    void stickyNoteUsesPluginSettingAndFallsBackToDefault() {
        var settings = mock(ReactiveSettingFetcher.class);
        var access = new DiaryAccess(mock(UserService.class), settings);

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
