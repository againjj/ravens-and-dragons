package com.ravensanddragons.auth

import com.ravensanddragons.game.AbstractGameControllerTestSupport
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpSession
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `guest login creates a temporary authenticated session`() {
        val result = mockMvc.post("/api/auth/guest")
            .andExpect {
                status { isOk() }
                jsonPath("$.user.authType", equalTo("guest"))
            }
            .andReturn()

        val session = result.request.session as MockHttpSession
        val guestUserId = session.getAttribute(AuthSessionSupport.currentUserIdSessionAttribute) as String

        mockMvc.get("/api/auth/session") {
            this.session = session
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated", equalTo(true))
            jsonPath("$.user.id", equalTo(guestUserId))
            jsonPath("$.user.authType", equalTo("guest"))
        }
    }

    @Test
    fun `signup creates a local account and login establishes an authenticated session`() {
        mockMvc.post("/api/auth/signup") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                SignupRequest(
                    username = "new-player",
                    password = "password123",
                    displayName = "New Player"
                )
            )
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated", equalTo(false))
            jsonPath("$.user", nullValue())
        }

        mockMvc.post("/api/auth/login") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                LoginRequest(
                    username = "new-player",
                    password = "password123"
                )
            )
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated", equalTo(true))
            jsonPath("$.user.authType", equalTo("local"))
            jsonPath("$.user.displayName", equalTo("New Player"))
        }
    }

    @Test
    fun `signup rejects a blank display name`() {
        mockMvc.post("/api/auth/signup") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                SignupRequest(
                    username = "new-player",
                    password = "password123",
                    displayName = "   "
                )
            )
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Display name is required."))
        }
    }

    @Test
    fun `logout clears a guest session and deletes the guest user`() {
        val loginResult = mockMvc.post("/api/auth/guest")
            .andExpect {
                status { isOk() }
            }
            .andReturn()
        val session = loginResult.request.session as MockHttpSession
        val guestUserId = session.getAttribute(AuthSessionSupport.currentUserIdSessionAttribute) as String

        mockMvc.post("/api/auth/logout") {
            this.session = session
        }.andExpect {
            status { isNoContent() }
        }

        assertEquals(
            0,
            jdbcTemplate.queryForObject("select count(*) from users where id = ?", Int::class.java, guestUserId)
        )
    }

    @Test
    fun `local user can load their profile`() {
        mockMvc.get("/api/auth/profile") {
            with(authenticated("profile", defaultTestUserId))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id", equalTo(defaultTestUserId))
            jsonPath("$.username", equalTo(defaultTestUserId))
            jsonPath("$.displayName", equalTo("Test Player"))
        }
    }

    @Test
    fun `authenticated user can list existing players`() {
        seedUser("guest-player", "Guest Player", authType = AuthType.guest, username = "guest-player")
        seedUser("oauth-player", "OAuth Player", authType = AuthType.oauth, username = "oauth-player")

        mockMvc.get("/api/auth/users") {
            with(authenticated("profile", defaultTestUserId))
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].displayName", equalTo("Guest Player"))
            jsonPath("$[0].authType", equalTo("guest"))
            jsonPath("$[1].displayName", equalTo("OAuth Player"))
            jsonPath("$[1].authType", equalTo("oauth"))
            jsonPath("$[2].displayName", equalTo("Other Player"))
            jsonPath("$[3].displayName", equalTo("Test Player"))
            jsonPath("$[3].authType", equalTo("local"))
        }
    }

    @Test
    fun `local user can update their display name`() {
        mockMvc.post("/api/auth/profile") {
            with(authenticated("profile", defaultTestUserId))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(UpdateProfileRequest(displayName = "Renamed Player"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.user.displayName", equalTo("Renamed Player"))
            jsonPath("$.user.authType", equalTo("local"))
        }

        assertEquals(
            "Renamed Player",
            jdbcTemplate.queryForObject("select display_name from users where id = ?", String::class.java, defaultTestUserId)
        )
    }

    @Test
    fun `profile update rejects an invalid display name`() {
        mockMvc.post("/api/auth/profile") {
            with(authenticated("profile", defaultTestUserId))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(UpdateProfileRequest(displayName = "   "))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Display name is required."))
        }
    }

    @Test
    fun `guest accounts cannot load or update the profile page`() {
        seedUser("guest-profile", "Guest Profile", authType = AuthType.guest, username = "guest-profile")

        mockMvc.get("/api/auth/profile") {
            with(authenticated("profile", "guest-profile", AuthType.guest))
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("Only local password and OAuth accounts may manage profiles here."))
        }

        mockMvc.post("/api/auth/profile") {
            with(authenticated("profile", "guest-profile", AuthType.guest))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(UpdateProfileRequest(displayName = "Guest Rename"))
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("Only local password and OAuth accounts may manage profiles here."))
        }
    }

    @Test
    fun `oauth accounts can load and update their display name profile`() {
        seedUser("oauth-profile", "OAuth Profile", authType = AuthType.oauth, username = null)

        mockMvc.get("/api/auth/profile") {
            with(authenticated("profile", "oauth-profile", AuthType.oauth))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id", equalTo("oauth-profile"))
            jsonPath("$.username", nullValue())
            jsonPath("$.displayName", equalTo("OAuth Profile"))
            jsonPath("$.authType", equalTo("oauth"))
        }

        mockMvc.post("/api/auth/profile") {
            with(authenticated("profile", "oauth-profile", AuthType.oauth))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(UpdateProfileRequest(displayName = "OAuth Rename"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.user.displayName", equalTo("OAuth Rename"))
            jsonPath("$.user.authType", equalTo("oauth"))
        }
    }

    @Test
    fun `local account deletion releases seats and preserves the game`() {
        val game = seedGame(
            gameId = "PROFILE1",
            dragonsPlayerUserId = defaultTestUserId,
            ravensPlayerUserId = alternateTestUserId,
            createdByUserId = defaultTestUserId
        )
        val result = mockMvc.post("/api/auth/delete-account") {
            with(authenticated(game.id, defaultTestUserId))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(DeleteAccountRequest(password = "password123"))
        }.andExpect {
            status { isNoContent() }
        }.andReturn()

        assertEquals(
            0,
            jdbcTemplate.queryForObject("select count(*) from users where id = ?", Int::class.java, defaultTestUserId)
        )

        val updatedGame = storedGameSession(game.id)
        assertNull(updatedGame?.dragonsPlayerUserId)
        assertEquals(alternateTestUserId, updatedGame?.ravensPlayerUserId)
        assertNull(updatedGame?.createdByUserId)
        assertEquals(game.id, updatedGame?.id)

        val session = result.request.session as MockHttpSession
        assertNull(session.getAttribute(AuthSessionSupport.currentUserIdSessionAttribute))
        assertNull(session.getAttribute(AuthSessionSupport.currentAuthTypeSessionAttribute))
    }

    @Test
    fun `local account deletion rejects the wrong password`() {
        mockMvc.post("/api/auth/delete-account") {
            with(authenticated("profile", defaultTestUserId))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(DeleteAccountRequest(password = "wrong-password"))
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.message", equalTo("Password confirmation was incorrect."))
        }

        assertEquals(
            1,
            jdbcTemplate.queryForObject("select count(*) from users where id = ?", Int::class.java, defaultTestUserId)
        )
    }
}
