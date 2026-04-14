package com.dragonsvsravens.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.support.StaticListableBeanFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
@Import(OAuthSupportTest.OAuthClientRegistrationTestConfig::class)
class OAuthSupportTest {
    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var oauthLoginSuccessHandler: OAuthLoginSuccessHandler

    @Autowired
    lateinit var mockMvc: MockMvc

    @BeforeEach
    fun resetUsers() {
        jdbcTemplate.update("delete from user_identities")
        jdbcTemplate.update("delete from users")
    }

    @Test
    fun `provider catalog lists configured oauth registrations`() {
        val repository = InMemoryClientRegistrationRepository(googleRegistration(), githubRegistration())
        val beanFactory = StaticListableBeanFactory().apply {
            addBean("clientRegistrationRepository", repository)
        }
        val catalog = OAuthProviderCatalog(beanFactory.getBeanProvider(ClientRegistrationRepository::class.java))

        assertEquals(listOf("github", "google"), catalog.availableProviders())
    }

    @Test
    fun `provider catalog returns empty when no oauth client registration repository exists`() {
        val catalog = OAuthProviderCatalog(StaticListableBeanFactory().getBeanProvider(ClientRegistrationRepository::class.java))

        assertEquals(emptyList<String>(), catalog.availableProviders())
    }

    @Test
    fun `authorization request resolver stores a safe next path in session`() {
        val resolver = NextAwareAuthorizationRequestResolver(InMemoryClientRegistrationRepository(googleRegistration()))
        val request = MockHttpServletRequest("GET", "/oauth2/authorization/google").apply {
            setParameter("next", "/g/CFGHJMP")
        }

        resolver.resolve(request, "google")

        assertEquals("/g/CFGHJMP", request.getSession(false)?.getAttribute(OAuthLoginSuccessHandler.oauthNextPathSessionAttribute))
    }

    @Test
    fun `authorization request resolver ignores an unsafe next path`() {
        val resolver = NextAwareAuthorizationRequestResolver(InMemoryClientRegistrationRepository(googleRegistration()))
        val request = MockHttpServletRequest("GET", "/oauth2/authorization/google").apply {
            setParameter("next", "https://evil.example")
        }

        resolver.resolve(request, "google")

        assertNull(request.getSession(false)?.getAttribute(OAuthLoginSuccessHandler.oauthNextPathSessionAttribute))
    }

    @Test
    fun `oauth login success handler redirects to the stored next path`() {
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        val response = MockHttpServletResponse()
        request.getSession(true)!!.setAttribute(OAuthLoginSuccessHandler.oauthNextPathSessionAttribute, "/g/CFGHJMP")

        oauthLoginSuccessHandler.onAuthenticationSuccess(request, response, googleAuthentication())

        assertEquals("/g/CFGHJMP", response.redirectedUrl)
        assertNull(request.getSession(false)?.getAttribute(OAuthLoginSuccessHandler.oauthNextPathSessionAttribute))
    }

    @Test
    fun `oauth login success handler falls back to root when no next path was stored`() {
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        val response = MockHttpServletResponse()

        oauthLoginSuccessHandler.onAuthenticationSuccess(request, response, googleAuthentication())

        assertEquals("/", response.redirectedUrl)
    }

    @Test
    fun `oauth authorization redirect uses forwarded https headers for base url`() {
        val result = mockMvc.get("/oauth2/authorization/google") {
            secure = false
            header("Host", "dragons-vs-ravens.railway.internal")
            header("X-Forwarded-Proto", "https")
            header("X-Forwarded-Host", "dragons-vs-ravens-production.up.railway.app")
            header("X-Forwarded-Port", "443")
        }.andExpect {
            status { is3xxRedirection() }
        }.andReturn()

        val redirectUrl = result.response.getHeader("Location") ?: error("missing redirect location")
        kotlin.test.assertTrue(
            redirectUrl.startsWith("https://example.com/oauth2/authorize?"),
            "Expected OAuth redirect to target the provider authorization endpoint, but was: $redirectUrl"
        )
        kotlin.test.assertTrue(
            redirectUrl.contains("redirect_uri=https://dragons-vs-ravens-production.up.railway.app/login/oauth2/code/google"),
            "Expected redirect URI to use the forwarded https Railway host, but was: $redirectUrl"
        )
    }

    @TestConfiguration
    class OAuthClientRegistrationTestConfig {
        @Bean
        fun clientRegistrationRepository(): ClientRegistrationRepository =
            InMemoryClientRegistrationRepository(registration("google"))
    }

    private fun googleAuthentication(): OAuth2AuthenticationToken {
        val principal = DefaultOAuth2User(
            listOf(SimpleGrantedAuthority("ROLE_USER")),
            mapOf(
                "sub" to "google-subject",
                "email" to "player@example.com",
                "name" to "Dragon Player"
            ),
            "sub"
        )
        return OAuth2AuthenticationToken(principal, principal.authorities, "google")
    }

    private fun googleRegistration(): ClientRegistration =
        registration("google")

    private fun githubRegistration(): ClientRegistration =
        registration("github")

    companion object {
        private fun registration(registrationId: String): ClientRegistration =
            ClientRegistration.withRegistrationId(registrationId)
                .clientId("client-id")
                .clientSecret("client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile", "email")
                .authorizationUri("https://example.com/oauth2/authorize")
                .tokenUri("https://example.com/oauth2/token")
                .userInfoUri("https://example.com/userinfo")
                .userNameAttributeName("sub")
                .clientName(registrationId)
                .build()
    }
}
