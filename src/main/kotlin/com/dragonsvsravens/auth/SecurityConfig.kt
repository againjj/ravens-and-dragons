package com.dragonsvsravens.auth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpSessionEvent
import jakarta.servlet.http.HttpSessionListener
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.web.servlet.ServletListenerRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler

@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        oauth2UserService: OAuth2UserService<OAuth2UserRequest, OAuth2User>,
        oauthLoginSuccessHandler: OAuthLoginSuccessHandler,
        clientRegistrationRepositoryProvider: ObjectProvider<ClientRegistrationRepository>
    ): SecurityFilterChain {
        val builder = http
            .csrf { it.disable() }
            .authorizeHttpRequests {
                it.requestMatchers(HttpMethod.GET, "/", "/g/**", "/api/games/**", "/api/auth/session", "/styles.css", "/assets/**").permitAll()
                it.requestMatchers(HttpMethod.POST, "/api/games").permitAll()
                it.requestMatchers("/api/auth/guest", "/api/auth/signup", "/api/auth/login", "/login/**", "/oauth2/**").permitAll()
                it.requestMatchers(HttpMethod.POST, "/api/games/*/commands", "/api/games/*/claim-side").authenticated()
                it.anyRequest().permitAll()
            }
            .exceptionHandling {
                it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .rememberMe { it.disable() }
        if (clientRegistrationRepositoryProvider.ifAvailable != null) {
            builder.oauth2Login {
                it.userInfoEndpoint { endpoint -> endpoint.userService(oauth2UserService) }
                it.successHandler(oauthLoginSuccessHandler)
            }
        }
        return builder.build()
    }

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    @Bean
    fun oauth2UserService(): OAuth2UserService<OAuth2UserRequest, OAuth2User> = DefaultOAuth2UserService()

    @Bean
    fun oauthLoginSuccessHandler(
        userAccountService: UserAccountService,
        authSessionSupport: AuthSessionSupport
    ): OAuthLoginSuccessHandler = OAuthLoginSuccessHandler(userAccountService, authSessionSupport)

    @Bean
    fun guestSessionCleanupListener(
        userAccountService: UserAccountService
    ): ServletListenerRegistrationBean<HttpSessionListener> =
        ServletListenerRegistrationBean(
            GuestSessionCleanupListener(userAccountService)
        )
}

class OAuthLoginSuccessHandler(
    private val userAccountService: UserAccountService,
    private val authSessionSupport: AuthSessionSupport
) : SimpleUrlAuthenticationSuccessHandler("/") {
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: org.springframework.security.core.Authentication
    ) {
        val oauthUser = authentication.principal as OAuth2User
        val token = authentication as org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
        val displayName = oauthUser.getAttribute<String>("name")
            ?: oauthUser.getAttribute<String>("login")
            ?: oauthUser.getAttribute<String>("email")
            ?: "${token.authorizedClientRegistrationId.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }} User"
        val email = oauthUser.getAttribute<String>("email")
        val providerSubject = oauthUser.name
        val user = userAccountService.findOrCreateOAuthUser(
            provider = token.authorizedClientRegistrationId,
            providerSubject = providerSubject,
            displayName = displayName,
            email = email
        )
        authSessionSupport.signIn(request, response, user)
        super.onAuthenticationSuccess(request, response, authentication)
    }
}

class GuestSessionCleanupListener(
    private val userAccountService: UserAccountService
) : HttpSessionListener {
    override fun sessionDestroyed(se: HttpSessionEvent) {
        val session = se.session
        val authType = (session.getAttribute(AuthSessionSupport.currentAuthTypeSessionAttribute) as? String)
            ?.let(AuthType::valueOf)
        if (authType == AuthType.guest) {
            val userId = session.getAttribute(AuthSessionSupport.currentUserIdSessionAttribute) as? String ?: return
            userAccountService.deleteGuestUser(userId)
        }
    }
}
