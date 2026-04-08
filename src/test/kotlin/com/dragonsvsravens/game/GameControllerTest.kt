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
            jsonPath("$.game.id") { value(org.hamcrest.Matchers.not("default")) }
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
}
