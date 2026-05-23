package com.ravensanddragons.auth

import jakarta.servlet.DispatcherType
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpSession
import jakarta.servlet.http.HttpSessionEvent
import jakarta.servlet.http.HttpSessionListener
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.boot.web.servlet.ServletListenerRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler
import org.springframework.web.filter.ForwardedHeaderFilter
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        oauth2UserService: OAuth2UserService<OAuth2UserRequest, OAuth2User>,
        oauthLoginSuccessHandler: OAuthLoginSuccessHandler,
        oauthAuthorizationRequestResolverProvider: ObjectProvider<OAuth2AuthorizationRequestResolver>,
        clientRegistrationRepositoryProvider: ObjectProvider<ClientRegistrationRepository>
    ): SecurityFilterChain {
        val builder = http
            .csrf { it.disable() }
            .addFilterBefore(forwardedHeaderFilter(), OAuth2AuthorizationRequestRedirectFilter::class.java)
            .authorizeHttpRequests {
                it.dispatcherTypeMatchers(DispatcherType.FORWARD, DispatcherType.ASYNC).permitAll()
                it.requestMatchers(HttpMethod.GET, "/health", "/login", "/api/auth/session", "/styles.css", "/assets/**", "/favicon.ico").permitAll()
                it.requestMatchers("/api/auth/guest", "/api/auth/signup", "/api/auth/login", "/login/**", "/oauth2/**").permitAll()
                it.requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                it.requestMatchers("/", "/lobby", "/*/create", "/g/**", "/api/games/**").authenticated()
                it.anyRequest().authenticated()
            }
            .exceptionHandling {
                it.authenticationEntryPoint { request, response, _ ->
                    if (request.requestURI.startsWith("/api/") || request.method != HttpMethod.GET.name()) {
                        HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED).commence(request, response, null)
                        return@authenticationEntryPoint
                    }

                    response.sendRedirect(loginRedirectTarget(request))
                }
            }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .rememberMe { it.disable() }
        if (clientRegistrationRepositoryProvider.ifAvailable != null) {
            builder.oauth2Login {
                oauthAuthorizationRequestResolverProvider.ifAvailable?.let { resolver ->
                    it.authorizationEndpoint { endpoint -> endpoint.authorizationRequestResolver(resolver) }
                }
                it.userInfoEndpoint { endpoint -> endpoint.userService(oauth2UserService) }
                it.successHandler(oauthLoginSuccessHandler)
            }
        }
        return builder.build()
    }

    private fun loginRedirectTarget(request: HttpServletRequest): String {
        val nextPath = buildString {
            append(request.requestURI)
            if (!request.queryString.isNullOrBlank()) {
                append("?")
                append(request.queryString)
            }
        }
        val encodedNext = URLEncoder.encode(nextPath, StandardCharsets.UTF_8)
        return "/login?next=$encodedNext"
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
    @ConditionalOnBean(ClientRegistrationRepository::class)
    fun oauthAuthorizationRequestResolver(
        clientRegistrationRepository: ClientRegistrationRepository
    ): OAuth2AuthorizationRequestResolver =
        NextAwareAuthorizationRequestResolver(clientRegistrationRepository)

    @Bean
    fun guestSessionCleanupListener(
        userAccountService: UserAccountService
    ): ServletListenerRegistrationBean<HttpSessionListener> =
        ServletListenerRegistrationBean(
            GuestSessionCleanupListener(userAccountService)
        )

    @Bean
    fun forwardedHeaderFilter(): ForwardedHeaderFilter = ForwardedHeaderFilter()
}

class OAuthLoginSuccessHandler(
    private val userAccountService: UserAccountService,
    private val authSessionSupport: AuthSessionSupport
) : SimpleUrlAuthenticationSuccessHandler("/") {
    companion object {
        const val oauthNextPathSessionAttribute = "auth.oauth.nextPath"
    }

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
        clearAuthenticationAttributes(request)
        redirectStrategy.sendRedirect(request, response, consumeNextPath(request.getSession(false)) ?: "/")
    }

    private fun consumeNextPath(session: HttpSession?): String? {
        val nextPath = session?.getAttribute(oauthNextPathSessionAttribute) as? String
        session?.removeAttribute(oauthNextPathSessionAttribute)
        return nextPath
    }
}

class NextAwareAuthorizationRequestResolver(
    clientRegistrationRepository: ClientRegistrationRepository
) : OAuth2AuthorizationRequestResolver {
    private val delegate = DefaultOAuth2AuthorizationRequestResolver(clientRegistrationRepository, "/oauth2/authorization")

    override fun resolve(request: HttpServletRequest): OAuth2AuthorizationRequest? =
        delegate.resolve(request)
            ?.let { authorizationRequest ->
                storeNextPath(request)
                authorizationRequest.withForwardedRedirectUriIfPresent(request)
            }

    override fun resolve(request: HttpServletRequest, clientRegistrationId: String): OAuth2AuthorizationRequest? =
        delegate.resolve(request, clientRegistrationId)
            ?.let { authorizationRequest ->
                storeNextPath(request)
                authorizationRequest.withForwardedRedirectUriIfPresent(request, clientRegistrationId)
            }

    private fun storeNextPath(request: HttpServletRequest) {
        request.getSession(false)?.removeAttribute(OAuthLoginSuccessHandler.oauthNextPathSessionAttribute)
        request.getParameter("next")
            ?.takeIf(::isSafeLocalPath)
            ?.let { request.getSession(true).setAttribute(OAuthLoginSuccessHandler.oauthNextPathSessionAttribute, it) }
    }

    private fun isSafeLocalPath(path: String): Boolean =
        path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")

    private fun OAuth2AuthorizationRequest.withForwardedRedirectUriIfPresent(
        request: HttpServletRequest,
        clientRegistrationId: String = request.requestURI.substringAfterLast("/")
    ): OAuth2AuthorizationRequest {
        val forwardedProto = request.getHeader("X-Forwarded-Proto")?.substringBefore(",")?.trim()?.takeIf { it.isNotBlank() }
        val forwardedHostHeader = request.getHeader("X-Forwarded-Host")?.substringBefore(",")?.trim()?.takeIf { it.isNotBlank() }
        if (forwardedProto == null || forwardedHostHeader == null) {
            return this
        }

        val forwardedPort = request.getHeader("X-Forwarded-Port")?.substringBefore(",")?.trim()?.takeIf { it.isNotBlank() }
        val host = forwardedHostHeader.substringBefore(":")
        val explicitPort = forwardedHostHeader.substringAfter(":", "")
        val port = explicitPort.ifBlank { forwardedPort.orEmpty() }
        val authority = when {
            port.isBlank() -> host
            forwardedProto == "https" && port == "443" -> host
            forwardedProto == "http" && port == "80" -> host
            else -> "$host:$port"
        }
        val contextPath = request.contextPath.orEmpty()
        val redirectUri = "$forwardedProto://$authority$contextPath/login/oauth2/code/$clientRegistrationId"
        return OAuth2AuthorizationRequest.from(this)
            .redirectUri(redirectUri)
            .build()
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
