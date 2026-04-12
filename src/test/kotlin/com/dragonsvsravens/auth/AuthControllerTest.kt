package com.dragonsvsravens.auth

import com.dragonsvsravens.game.AbstractGameControllerTestSupport
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Assertions.assertEquals
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
    fun `signup and login establish a local authenticated session`() {
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
            jsonPath("$.authenticated", equalTo(true))
            jsonPath("$.user.authType", equalTo("local"))
            jsonPath("$.user.displayName", equalTo("New Player"))
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
}
