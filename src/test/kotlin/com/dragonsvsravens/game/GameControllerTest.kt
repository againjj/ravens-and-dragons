package com.dragonsvsravens.game

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest
@AutoConfigureMockMvc
class GameControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `create game returns a new non default session`() {
        mockMvc.post("/api/games") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(CreateGameRequest())
        }.andExpect {
            status { isOk() }
            jsonPath("$.game.id") { value(org.hamcrest.Matchers.matchesPattern("[23456789CFGHJMPQRVWX]{7}")) }
            jsonPath("$.game.lifecycle", equalTo("new"))
            jsonPath("$.game.snapshot.phase", equalTo("none"))
            jsonPath("$.game.selectedRuleConfigurationId", equalTo("free-play"))
        }
    }

    @Test
    fun `new game routes mutate only the selected game`() {
        val firstGame = createGame()
        val secondGame = createGame()

        postGameCommand(firstGame.id, command(firstGame.version, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.id", equalTo(firstGame.id))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }

        mockMvc.get("/api/games/${secondGame.id}")
            .andExpect {
                status { isOk() }
                jsonPath("$.id", equalTo(secondGame.id))
                jsonPath("$.snapshot.phase", equalTo("none"))
                jsonPath("$.version", equalTo(0))
            }
    }

    @Test
    fun `version conflict response is scoped to the requested game`() {
        val firstGame = createGame()
        val secondGame = createGame()

        executeGameCommand(firstGame.id, command(firstGame.version, "start-game"))
        executeGameCommand(secondGame.id, command(secondGame.version, "start-game"))

        postGameCommand(firstGame.id, command(firstGame.version, "start-game")).andExpect {
            status { isConflict() }
            jsonPath("$.id", equalTo(firstGame.id))
            jsonPath("$.version", equalTo(1))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `missing game returns not found on multi game routes`() {
        mockMvc.get("/api/games/missing-game")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.message", equalTo("Game missing-game was not found."))
            }
    }

    @Test
    fun `missing game stream returns not found for sse requests`() {
        mockMvc.get("/api/games/missing-game/stream") {
            accept = MediaType.TEXT_EVENT_STREAM
        }.andExpect {
            status { isNotFound() }
            content { string("") }
        }
    }

    @Test
    fun `removed default compatibility routes return not found`() {
        mockMvc.get("/api/game")
            .andExpect {
                status { isNotFound() }
            }

        mockMvc.post("/api/game/commands") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command(0, "start-game"))
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/game/stream")
            .andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `game route serves the frontend app shell`() {
        mockMvc.get("/g/CFGHJMP") {
            accept = MediaType.TEXT_HTML
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }
}
