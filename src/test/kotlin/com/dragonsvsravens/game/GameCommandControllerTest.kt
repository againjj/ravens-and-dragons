package com.dragonsvsravens.game

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertAll
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
class GameCommandControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `get game returns the requested session in no game state`() {
        val game = createGame()

        mockMvc.get("/api/games/${game.id}")
            .andExpect {
                status { isOk() }
                jsonPath("$.id", equalTo(game.id))
                jsonPath("$.snapshot.phase", equalTo("none"))
                jsonPath("$.snapshot.board", equalTo(emptyMap<String, String>()))
            }
    }

    @Test
    fun `valid start game command increments version and enters setup`() {
        val game = createGame()

        postGameCommand(game.id, command(game.version, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `selecting original game updates the idle session and start game uses its preset board`() {
        val game = createGame()

        postGameCommand(game.id, command(game.version, "select-rule-configuration", ruleConfigurationId = "original-game")).andExpect {
            status { isOk() }
            jsonPath("$.selectedRuleConfigurationId", equalTo("original-game"))
            jsonPath("$.snapshot.ruleConfigurationId", equalTo("original-game"))
            jsonPath("$.snapshot.phase", equalTo("none"))
            jsonPath("$.snapshot.board.d4", equalTo("gold"))
            jsonPath("$.snapshot.board.d5", equalTo("dragon"))
            jsonPath("$.snapshot.board.d7", equalTo("raven"))
        }

        postGameCommand(game.id, command(currentVersion(game.id), "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
            jsonPath("$.snapshot.board.d4", equalTo("gold"))
            jsonPath("$.snapshot.board.d5", equalTo("dragon"))
            jsonPath("$.snapshot.board.d7", equalTo("raven"))
        }
    }

    @Test
    fun `selecting free play starting side updates idle session and setup handoff`() {
        val game = createGame()

        postGameCommand(game.id, command(game.version, "select-starting-side", side = Side.ravens)).andExpect {
            status { isOk() }
            jsonPath("$.selectedStartingSide", equalTo("ravens"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }

        postGameCommand(game.id, command(currentVersion(game.id), "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("setup"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }

        postGameCommand(game.id, command(currentVersion(game.id), "end-setup")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }
    }

    @Test
    fun `original game rejects a move that would leave the moved piece captured`() {
        val game = seedGame(
            gameId = "original-game-test",
            snapshot = GameSnapshot(
                board = linkedMapOf(
                    "b4" to Piece.raven,
                    "c1" to Piece.dragon,
                    "g7" to Piece.gold
                ),
                phase = Phase.move,
                activeSide = Side.ravens,
                pendingMove = null,
                turns = emptyList(),
                ruleConfigurationId = "original-game",
                positionKeys = emptyList()
            ),
            selectedRuleConfigurationId = "original-game"
        )

        postGameCommand(game.id, command(currentVersion(game.id), "move-piece", origin = "b4", destination = "b1")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("You may not move so that your piece is captured."))
        }
    }

    @Test
    fun `stale expected version returns conflict with the latest snapshot`() {
        val game = createGame()

        executeGameCommand(game.id, command(game.version, "start-game"))

        postGameCommand(game.id, command(game.version, "start-game")).andExpect {
            status { isConflict() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `invalid command returns bad request`() {
        val game = createGame()
        startSetup(game.id)
        endSetup(game.id)
        val current = currentGame(game.id)

        postGameCommand(game.id, command(current.version, "move-piece", origin = "a1")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Command move-piece requires destination."))
        }
    }

    @Test
    fun `illegal setup command before starting a game leaves game unchanged`() {
        val game = createGame()
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during none."
        )
    }

    @Test
    fun `illegal move command during setup leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "a2"),
            message = "Command move-piece is not allowed during setup."
        )
    }

    @Test
    fun `illegal cycle setup command after setup leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        endSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during move."
        )
    }

    @Test
    fun `out of bounds square is rejected`() {
        val game = createGame()
        startSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "cycle-setup", square = "i9"),
            message = "Square i9 is outside the 7x7 board."
        )
    }

    @Test
    fun `out of bounds move destination is rejected`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "h1"),
            message = "Square h1 is outside the 7x7 board."
        )
    }

    @Test
    fun `move from empty square leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "move-piece", origin = "b1", destination = "b2"),
            message = "No piece exists at b1."
        )
    }

    @Test
    fun `moving an opposing piece leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        setupRavenAt(game.id, "a1")
        endSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "a2"),
            message = "The active side cannot move the piece at a1."
        )
    }

    @Test
    fun `moving into an occupied square leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        setupDragonAt(game.id, "b2")
        endSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "b2"),
            message = "Destination b2 is occupied."
        )
    }

    @Test
    fun `capture command during move phase leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "capture-piece", square = "e5"),
            message = "Command capture-piece is not allowed during move."
        )
    }

    @Test
    fun `skip capture during move phase leaves game unchanged`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        val before = getGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "skip-capture"),
            message = "Command skip-capture is not allowed during move."
        )
    }

    @Test
    fun `undo during capture restores the pre move snapshot`() {
        val game = createGame()
        enterCapturePhase(game.id)
        val beforeUndo = currentGame(game.id)
        val undone = executeGameCommand(game.id, command(beforeUndo.version, "undo"))

        assertAll(
            { assertEquals(Phase.move, undone.snapshot.phase) },
            { assertEquals(Side.dragons, undone.snapshot.activeSide) },
            { assertEquals(null, undone.snapshot.pendingMove) },
            { assertEquals(Piece.dragon, undone.snapshot.board["a1"]) },
            { assertEquals(null, undone.snapshot.board["a2"]) },
            { assertEquals(false, undone.canUndo) }
        )
    }

    @Test
    fun `undo after capture restores the moved and captured pieces`() {
        val game = createGame()
        enterCapturePhase(game.id)
        executeGameCommand(game.id, command(currentVersion(game.id), "capture-piece", square = "b2"))
        val beforeUndo = currentGame(game.id)
        val undone = executeGameCommand(game.id, command(beforeUndo.version, "undo"))

        assertAll(
            { assertEquals(Phase.move, undone.snapshot.phase) },
            { assertEquals(Side.dragons, undone.snapshot.activeSide) },
            { assertEquals(Piece.dragon, undone.snapshot.board["a1"]) },
            { assertEquals(null, undone.snapshot.board["a2"]) },
            { assertEquals(Piece.raven, undone.snapshot.board["b2"]) },
            { assertEquals(emptyList<TurnRecord>(), undone.snapshot.turns) },
            { assertEquals(false, undone.canUndo) }
        )
    }

    @Test
    fun `fresh game fetch exposes can undo for another client`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        executeGameCommand(game.id, command(currentVersion(game.id), "move-piece", origin = "a1", destination = "a2"))

        mockMvc.get("/api/games/${game.id}")
            .andExpect {
                status { isOk() }
                jsonPath("$.snapshot.board.a2", equalTo("dragon"))
                jsonPath("$.canUndo", equalTo(true))
            }
    }

    @Test
    fun `undo with no move history leaves game unchanged`() {
        val game = createGame()
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "undo"),
            message = "No move is available to undo."
        )
    }

    @Test
    fun `capturing an empty square leaves game unchanged`() {
        val game = createGame()
        enterCapturePhase(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "capture-piece", square = "c3"),
            message = "No piece exists at c3."
        )
    }

    @Test
    fun `capturing a friendly piece leaves game unchanged`() {
        val game = createGame()
        enterCapturePhase(game.id)
        val before = currentGame(game.id)

        assertRejectedCommandLeavesGameUnchanged(
            gameId = game.id,
            before = before,
            command = command(before.version, "capture-piece", square = "a2"),
            message = "The active side cannot capture the piece at a2."
        )
    }

    @Test
    fun `end game preserves the board and adds game over before returning to no game`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        executeGameCommand(game.id, command(currentVersion(game.id), "move-piece", origin = "a1", destination = "a2"))

        postGameCommand(game.id, command(currentVersion(game.id), "end-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("none"))
            jsonPath("$.snapshot.board.a2", equalTo("dragon"))
            jsonPath("$.snapshot.turns[0].type", equalTo("move"))
            jsonPath("$.snapshot.turns[1].type", equalTo("gameOver"))
            jsonPath("$.canUndo", equalTo(false))
        }
    }

    @Test
    fun `starting a new game after game over clears the preserved board and history`() {
        val game = createGame()
        startSetup(game.id)
        setupDragonAt(game.id, "a1")
        endSetup(game.id)
        executeGameCommand(game.id, command(currentVersion(game.id), "move-piece", origin = "a1", destination = "a2"))
        executeGameCommand(game.id, command(currentVersion(game.id), "end-game"))

        postGameCommand(game.id, command(currentVersion(game.id), "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("setup"))
            jsonPath("$.snapshot.board", equalTo(emptyMap<String, String>()))
            jsonPath("$.snapshot.turns.length()", equalTo(0))
        }
    }

    @Test
    fun `loading a removed game returns not found`() {
        val game = seedGame(gameId = "evicted-game")
        gameStore.remove(game.id)

        mockMvc.get("/api/games/${game.id}")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.message", equalTo("Game ${game.id} was not found."))
            }
    }

}
