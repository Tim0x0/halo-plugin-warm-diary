package com.timxs.warmdiary;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import run.halo.app.core.user.service.UserService;
import run.halo.app.plugin.ReactiveSettingFetcher;

@Component
@RequiredArgsConstructor
public class DiaryAccess {
    static final String DEFAULT_STICKY = "不必写得漂亮，\n真实就很好。";
    // 拥有这个角色的账号可以写日记、读未分享的内容。Halo 判定角色时会自动放行超级管理员。
    static final String MANAGE_ROLE = "warm-diary-manage";
    private final UserService users;
    private final ReactiveSettingFetcher settings;

    Mono<String> username() {
        return ReactiveSecurityContextHolder.getContext().map(c -> c.getAuthentication())
            .filter(a -> a.isAuthenticated() && !(a instanceof AnonymousAuthenticationToken))
            .map(a -> a.getName()).filter(n -> !n.equals("anonymousUser"));
    }

    /** 写日记与读未分享内容的权限：由 Halo 的角色体系判定，超级管理员始终为真。 */
    Mono<Boolean> canManage() {
        return users.hasSufficientRoles(Set.of(MANAGE_ROLE)).defaultIfEmpty(false);
    }

    Mono<Session> session() {
        return timeZone().flatMap(zone -> canManage().flatMap(manage -> username().defaultIfEmpty("")
            .map(name -> new Session(manage, !name.isEmpty(), zone,
                LocalDate.now(ZoneId.of(zone)).toString()))));
    }

    private Mono<String> timeZone() {
        return settings.fetch("basic", BasicSettings.class).map(s -> s.timeZone() == null ? "" : s.timeZone())
            .defaultIfEmpty("").map(zone -> {
                try { return (zone.isBlank() ? ZoneId.systemDefault() : ZoneId.of(zone)).getId(); }
                catch (RuntimeException e) { throw DiaryContent.badRequest("日记时区无效，请在插件设置中填写有效时区，例如 Asia/Shanghai"); }
            });
    }

    Mono<String> stickyNote() {
        return settings.fetch("basic", BasicSettings.class)
            .map(s -> s.stickyNote() == null ? "" : s.stickyNote())
            .defaultIfEmpty("")
            .onErrorReturn("")
            .map(note -> {
                String text = note.strip();
                if (text.length() > 200) text = text.substring(0, 200).strip();
                return text.isBlank() ? DEFAULT_STICKY : text;
            });
    }

    @Schema(name = "DiarySession", requiredProperties = {"canManage", "loggedIn", "timeZone", "today"})
    public record Session(boolean canManage, boolean loggedIn, String timeZone, String today) {}
    public record BasicSettings(String timeZone, String stickyNote) {}
}
