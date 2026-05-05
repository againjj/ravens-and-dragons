package com.ravensanddragons.game

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.web.*


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
    fun `create game returns an active free-play session that starts in move phase`() {
        mockMvc.post("/api/games/ravens-and-dragons") {
            with(authenticated("create-game"))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                CreateGameRequest(
                    startingSide = Side.ravens,
                    board = mapOf(
                        "a1" to Piece.dragon
                    )
                )
            )
        }.andExpect {
            status { isOk() }
            jsonPath("$.game.id") { value(org.hamcrest.Matchers.matchesPattern("[23456789CFGHJMPQRVWX]{7}")) }
            jsonPath("$.game.lifecycle", equalTo("active"))
            jsonPath("$.game.gameSlug", equalTo("ravens-and-dragons"))
            jsonPath("$.game.snapshot.phase", equalTo("move"))
            jsonPath("$.game.selectedRuleConfigurationId", equalTo("free-play"))
            jsonPath("$.game.selectedStartingSide", equalTo("ravens"))
            jsonPath("$.game.snapshot.activeSide", equalTo("ravens"))
            jsonPath("$.game.snapshot.board.a1", equalTo("dragon"))
        }
    }

    @Test
    fun `game routes mutate only the selected game`() {
        val firstGame = createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))
        val secondGame = createGame(CreateGameRequest(board = mapOf("b1" to Piece.dragon)))

        postGameCommand(firstGame.id, command(firstGame.version, "move-piece", origin = "a1", destination = "a2")).andExpect {
            status { isOk() }
            jsonPath("$.id", equalTo(firstGame.id))
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.board.a2", equalTo("dragon"))
        }

        mockMvc.get("/api/games/${secondGame.id}") {
            with(authenticated(secondGame.id))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id", equalTo(secondGame.id))
            jsonPath("$.snapshot.board.b1", equalTo("dragon"))
            jsonPath("$.version", equalTo(0))
        }
    }

    @Test
    fun `version conflict response is scoped to the requested game`() {
        val firstGame = createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))
        val secondGame = createGame(CreateGameRequest(board = mapOf("b1" to Piece.dragon)))

        executeGameCommand(firstGame.id, command(firstGame.version, "move-piece", origin = "a1", destination = "a2"))
        executeGameCommand(secondGame.id, command(secondGame.version, "move-piece", origin = "b1", destination = "b2"))

        postGameCommand(firstGame.id, command(firstGame.version, "move-piece", origin = "a1", destination = "a3")).andExpect {
            status { isConflict() }
            jsonPath("$.id", equalTo(firstGame.id))
            jsonPath("$.version", equalTo(1))
            jsonPath("$.snapshot.board.a2", equalTo("dragon"))
        }
    }

    @Test
    fun `persisted game can be reloaded after a follow up request`() {
        val created = createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))

        executeGameCommand(created.id, command(created.version, "move-piece", origin = "a1", destination = "a2"))

        mockMvc.get("/api/games/${created.id}") {
            with(authenticated(created.id))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id", equalTo(created.id))
            jsonPath("$.version", equalTo(1))
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.board.a2", equalTo("dragon"))
        }
    }

    @Test
    fun `bot assignment is rejected for unsupported rule configurations`() {
        val game = createGame(CreateGameRequest(ruleConfigurationId = "free-play"))
        assignSides(game.id, null, null)

        assignBotOpponent(game.id, BotRegistry.randomBotId).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Randall is not available for this rule configuration."))
        }
    }

    @Test
    fun `game view includes bot metadata for assigned seats`() {
        val game = seedGame(
            gameId = "bot-view-game",
            snapshot = GameRules.startGame("sherwood-rules"),
            selectedRuleConfigurationId = "sherwood-rules",
            dragonsPlayerUserId = defaultTestUserId,
            ravensPlayerUserId = null,
            ravensBotId = BotRegistry.randomBotId
        )

        mockMvc.get("/api/games/${game.id}/view") {
            with(authenticated(game.id))
        }.andExpect {
            status { isOk() }
            jsonPath("$.ravensBot.id", equalTo(BotRegistry.randomBotId))
            jsonPath("$.ravensBot.displayName", equalTo("Randall"))
            jsonPath("$.availableBots[0].id", equalTo(BotRegistry.randomBotId))
            jsonPath("$.availableBots[1].id", equalTo(BotRegistry.simpleBotId))
            jsonPath("$.availableBots[1].displayName", equalTo("Simon"))
            jsonPath("$.availableBots[2].id", equalTo(BotRegistry.minimaxBotId))
            jsonPath("$.availableBots[2].displayName", equalTo("Maxine"))
            jsonPath("$.availableBots[3].id", equalTo(BotRegistry.deepMinimaxBotId))
            jsonPath("$.availableBots[3].displayName", equalTo("Alphie"))
            jsonPath("$.availableBots[4].id", equalTo(BotRegistry.machineTrainedBotId))
            jsonPath("$.availableBots[4].displayName", equalTo("Michelle"))
        }
    }

    @Test
    fun `game view exposes bot availability for every release two supported ruleset`() {
        BotRegistry.releaseTwoSupportedRuleConfigurationIds.forEach { ruleConfigurationId ->
            val game = seedGame(
                gameId = "view-$ruleConfigurationId",
                snapshot = GameRules.startGame(ruleConfigurationId),
                selectedRuleConfigurationId = ruleConfigurationId,
                dragonsPlayerUserId = defaultTestUserId,
                ravensPlayerUserId = null
            )

            mockMvc.get("/api/games/${game.id}/view") {
                with(authenticated(game.id))
            }.andExpect {
                status { isOk() }
                jsonPath("$.availableBots[0].id", equalTo(BotRegistry.randomBotId))
                jsonPath("$.availableBots[1].id", equalTo(BotRegistry.simpleBotId))
                jsonPath("$.availableBots[2].id", equalTo(BotRegistry.minimaxBotId))
                jsonPath("$.availableBots[3].id", equalTo(BotRegistry.deepMinimaxBotId))
                if (ruleConfigurationId == "sherwood-rules") {
                    jsonPath("$.availableBots[4].id", equalTo(BotRegistry.machineTrainedBotId))
                }
            }
        }
    }

    @Test
    fun `missing game returns not found on multi game routes`() {
        mockMvc.get("/api/games/missing-game") {
            with(authenticated("missing-game"))
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.message", equalTo("Game missing-game was not found."))
        }
    }

    @Test
    fun `missing game stream returns not found for sse requests`() {
        mockMvc.get("/api/games/missing-game/stream") {
            with(authenticated("missing-game"))
            accept = MediaType.TEXT_EVENT_STREAM
        }.andExpect {
            status { isNotFound() }
            content { string("") }
        }
    }

    @Test
    fun `removed default compatibility routes return not found`() {
        mockMvc.get("/api/game") {
            with(authenticated("legacy-route"))
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.post("/api/game/commands") {
            with(authenticated("legacy-route"))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command(0, "move-piece", origin = "a1", destination = "a2"))
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/game/stream") {
            with(authenticated("legacy-route"))
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `game route serves the frontend app shell`() {
        mockMvc.get("/g/CFGHJMP") {
            with(authenticated("CFGHJMP"))
            accept = MediaType.TEXT_HTML
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }
}
