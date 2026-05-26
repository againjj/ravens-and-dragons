package com.ravensanddragons.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.crypto.factory.PasswordEncoderFactories
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AuthControllerTest {
    private val fixedClock = Clock.fixed(Instant.parse("2026-05-26T12:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `signup creates a local account without signing in`() {
        val fixture = createFixture()
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()

        val session = fixture.controller.signup(
            SignupRequest(username = "dragon", password = "password123", displayName = "Dragon Player"),
            request,
            response
        )

        assertFalse(session.authenticated)
        assertNull(session.user)
        assertNull(request.getSession(false))
    }

    @Test
    fun `oauth users can load and update their display name profile`() {
        val fixture = createFixture()
        val oauthUser = fixture.userAccountService.findOrCreateOAuthUser(
            provider = "google",
            providerSubject = "google-subject",
            displayName = "Google Player",
            email = "player@example.com"
        )
        val request = signedInRequest(oauthUser)
        val response = MockHttpServletResponse()

        val profile = fixture.controller.profile(request)
        assertEquals(AuthType.oauth, profile.authType)
        assertNull(profile.username)
        assertEquals("Google Player", profile.displayName)

        val session = fixture.controller.updateProfile(
            UpdateProfileRequest(displayName = "Renamed Google Player"),
            request,
            response
        )

        assertEquals("Renamed Google Player", session.user?.displayName)
    }

    private fun createFixture(): Fixture {
        val database = EmbeddedDatabaseBuilder()
            .setName("auth-controller-${UUID.randomUUID()}")
            .setType(EmbeddedDatabaseType.H2)
            .addScript("classpath:db/migration/V1__create_games.sql")
            .addScript("classpath:db/migration/V2__add_users_and_game_seats.sql")
            .build()
        val userRepository = UserRepository(JdbcTemplate(database))
        val userAccountService = UserAccountService(
            userRepository = userRepository,
            userReferenceCleanups = emptyList(),
            passwordEncoder = PasswordEncoderFactories.createDelegatingPasswordEncoder(),
            clock = fixedClock
        )
        val controller = AuthController(
            userAccountService = userAccountService,
            authSessionSupport = AuthSessionSupport(),
            oauthProviderCatalog = OAuthProviderCatalog(object : ObjectProvider<org.springframework.security.oauth2.client.registration.ClientRegistrationRepository> {
                override fun getObject(vararg args: Any?): org.springframework.security.oauth2.client.registration.ClientRegistrationRepository {
                    throw NoSuchElementException()
                }

                override fun getObject(): org.springframework.security.oauth2.client.registration.ClientRegistrationRepository {
                    throw NoSuchElementException()
                }

                override fun getIfAvailable(): org.springframework.security.oauth2.client.registration.ClientRegistrationRepository? = null

                override fun getIfUnique(): org.springframework.security.oauth2.client.registration.ClientRegistrationRepository? = null
            })
        )
        return Fixture(controller, userAccountService)
    }

    private data class Fixture(
        val controller: AuthController,
        val userAccountService: UserAccountService
    )

    private fun signedInRequest(user: UserRecord): MockHttpServletRequest =
        MockHttpServletRequest().also { request ->
            val session = request.getSession(true)!!
            session.setAttribute(AuthSessionSupport.currentUserIdSessionAttribute, user.id)
            session.setAttribute(AuthSessionSupport.currentAuthTypeSessionAttribute, user.authType.name)
        }
}
