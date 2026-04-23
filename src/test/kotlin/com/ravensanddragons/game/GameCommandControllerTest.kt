package com.ravensanddragons.game

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest
@AutoConfigureMockMvc
class GameCommandControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `valid start game command increments version and enters move`() {
        val gameId = createIdleGame()

        postGameCommand(gameId, command(0, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.version", equalTo(1))
            jsonPath("$.lifecycle", equalTo("active"))
            jsonPath("$.snapshot.phase", equalTo("move"))
        }
    }

    @Test
    fun `selecting original game updates the idle session and start game uses its preset board`() {
        val gameId = createIdleGame()

        postGameCommand(gameId, command(0, "select-rule-configuration", ruleConfigurationId = "original-game")).andExpect {
            status { isOk() }
            jsonPath("$.selectedRuleConfigurationId", equalTo("original-game"))
            jsonPath("$.snapshot.ruleConfigurationId", equalTo("original-game"))
            jsonPath("$.snapshot.phase", equalTo("none"))
            jsonPath("$.snapshot.board.d4", equalTo("gold"))
        }

        postGameCommand(gameId, command(1, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
            jsonPath("$.snapshot.board.d4", equalTo("gold"))
        }
    }

    @Test
    fun `selecting free play starting side updates idle session and start game uses it`() {
        val gameId = createIdleGame()

        postGameCommand(gameId, command(0, "select-starting-side", side = Side.ravens)).andExpect {
            status { isOk() }
            jsonPath("$.selectedStartingSide", equalTo("ravens"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }

        postGameCommand(gameId, command(1, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }
    }

    @Test
    fun `selecting free play board size updates idle session and start game uses it`() {
        val gameId = createIdleGame()

        postGameCommand(gameId, command(0, "select-board-size", boardSize = 9)).andExpect {
            status { isOk() }
            jsonPath("$.selectedBoardSize", equalTo(9))
            jsonPath("$.snapshot.boardSize", equalTo(9))
            jsonPath("$.snapshot.specialSquare", equalTo("e5"))
        }

        postGameCommand(gameId, command(1, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.boardSize", equalTo(9))
            jsonPath("$.snapshot.specialSquare", equalTo("e5"))
        }
    }

    @Test
    fun `move command rejects occupied destinations`() {
        val game = createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon, "a2" to Piece.raven)))

        postGameCommand(game.id, command(game.version, "move-piece", origin = "a1", destination = "a2")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Destination a2 is occupied."))
        }
    }

    @Test
    fun `move command can enter capture phase`() {
        val game = createGame(
            CreateGameRequest(
                board = mapOf(
                    "a1" to Piece.dragon,
                    "b2" to Piece.raven,
                    "d4" to Piece.gold
                )
            )
        )

        postGameCommand(game.id, command(game.version, "move-piece", origin = "a1", destination = "a2")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("capture"))
            jsonPath("$.snapshot.pendingMove.from", equalTo("a1"))
            jsonPath("$.snapshot.pendingMove.to", equalTo("a2"))
        }
    }

    @Test
    fun `unknown setup-era command before starting a game leaves game unchanged`() {
        val gameId = createIdleGame()
        val before = currentGame(gameId)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = gameId,
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Unknown command type: cycle-setup"
        )
    }

    private fun createIdleGame(): String {
        val storedGame = GameSessionFactory.createStoredGame(
            gameId = "IDLE${System.nanoTime()}",
            snapshot = GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons),
            undoEntries = emptyList(),
            version = 0,
            createdAt = java.time.Instant.now(),
            updatedAt = java.time.Instant.now(),
            lifecycle = GameLifecycle.new,
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            dragonsPlayerUserId = defaultTestUserId,
            ravensPlayerUserId = defaultTestUserId,
            createdByUserId = defaultTestUserId
        )
        gameStore.putIfAbsent(storedGame)
        return storedGame.session.id
    }
}
