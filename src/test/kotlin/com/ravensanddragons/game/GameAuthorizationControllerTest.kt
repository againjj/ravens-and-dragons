package com.ravensanddragons.game

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
class GameAuthorizationControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `anonymous users cannot load a game`() {
        val game = createGame()

        anonymousGetGame(game.id).andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `anonymous users cannot load a game view`() {
        val game = createGame()

        mockMvc.get("/api/games/${game.id}/view") {
            accept = MediaType.APPLICATION_JSON
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `anonymous users cannot open a game stream`() {
        val game = createGame()

        mockMvc.get("/api/games/${game.id}/stream") {
            accept = MediaType.TEXT_EVENT_STREAM
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `anonymous users cannot submit commands`() {
        val game = createGame()

        anonymousPostGameCommand(game.id, command(game.version, "move-piece", origin = "a1", destination = "a2")).andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `authenticated user can claim an open side`() {
        val game = createGame()
        assignSides(game.id, null, null)

        claimSide(game.id, Side.dragons, defaultTestUserId).andExpect {
            status { isOk() }
            jsonPath("$.dragonsPlayerUserId", equalTo(defaultTestUserId))
        }
    }

    @Test
    fun `authenticated user can claim both open sides and others cannot steal them`() {
        val game = createGame()
        assignSides(game.id, null, null)

        claimSide(game.id, Side.dragons, defaultTestUserId).andExpect {
            status { isOk() }
            jsonPath("$.dragonsPlayerUserId", equalTo(defaultTestUserId))
        }

        claimSide(game.id, Side.ravens, defaultTestUserId).andExpect {
            status { isOk() }
            jsonPath("$.dragonsPlayerUserId", equalTo(defaultTestUserId))
            jsonPath("$.ravensPlayerUserId", equalTo(defaultTestUserId))
        }

        claimSide(game.id, Side.dragons, alternateTestUserId).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("Dragons is already claimed."))
        }
    }

    @Test
    fun `with one seat claimed backend rejects assigning a bot to the claimed seat but allows the open seat`() {
        val game = createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))
        assignSides(game.id, defaultTestUserId, null)

        assignBotOpponent(game.id, BotRegistry.randomBotId, alternateTestUserId).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("You must claim exactly one human seat before assigning a bot opponent."))
        }

        assignBotOpponent(game.id, BotRegistry.randomBotId, defaultTestUserId).andExpect {
            status { isOk() }
            jsonPath("$.ravensBotId", equalTo(BotRegistry.randomBotId))
        }
    }

    @Test
    fun `with both seats claimed any bot assignment is rejected`() {
        val game = createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))
        assignSides(game.id, defaultTestUserId, defaultTestUserId)

        assignBotOpponent(game.id, BotRegistry.randomBotId, defaultTestUserId).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("A bot opponent can be assigned only to an open seat."))
        }
    }

    @Test
    fun `spectator cannot submit commands`() {
        val game = createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))
        assignSides(game.id, defaultTestUserId, alternateTestUserId)
        seedUser("spectator-user", "Spectator")

        authenticatedPostGameCommand(
            game.id,
            command(game.version, "move-piece", origin = "a1", destination = "a2"),
            userId = "spectator-user"
        ).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("You must claim a side before submitting commands."))
        }
    }

    @Test
    fun `wrong side cannot move when it is not their turn`() {
        val game = createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))
        assignSides(game.id, defaultTestUserId, alternateTestUserId)

        authenticatedPostGameCommand(
            game.id,
            command(game.version, "move-piece", origin = "a1", destination = "a2"),
            userId = alternateTestUserId
        ).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("It is not your turn."))
        }
    }

    @Test
    fun `player who made the last move can undo after the turn passes`() {
        val game = createGame(
            CreateGameRequest(
                board = mapOf(
                    "a1" to Piece.dragon,
                    "b1" to Piece.raven
                )
            )
        )
        assignSides(game.id, defaultTestUserId, alternateTestUserId)

        authenticatedPostGameCommand(
            game.id,
            command(game.version, "move-piece", origin = "a1", destination = "a2"),
            userId = defaultTestUserId
        ).andExpect {
            status { isOk() }
        }

        authenticatedPostGameCommand(
            game.id,
            command(1, "undo"),
            userId = defaultTestUserId
        ).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.board.a1", equalTo("dragon"))
        }
    }

}
