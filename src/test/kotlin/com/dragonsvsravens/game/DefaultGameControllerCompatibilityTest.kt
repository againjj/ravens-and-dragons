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
class DefaultGameControllerCompatibilityTest : AbstractGameControllerTestSupport() {

    @Test
    fun `get game returns the shared default session in no game state`() {
        mockMvc.get("/api/game")
            .andExpect {
                status { isOk() }
                jsonPath("$.id", equalTo("default"))
                jsonPath("$.snapshot.phase", equalTo("none"))
                jsonPath("$.snapshot.board", equalTo(emptyMap<String, String>()))
            }
    }

    @Test
    fun `valid start game command increments version and enters setup`() {
        val game = getDefaultGame()

        postDefaultCommand(command(game.version, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `selecting original game updates the idle session and start game uses its preset board`() {
        val game = getDefaultGame()

        postDefaultCommand(command(game.version, "select-rule-configuration", ruleConfigurationId = "original-game")).andExpect {
            status { isOk() }
            jsonPath("$.selectedRuleConfigurationId", equalTo("original-game"))
            jsonPath("$.snapshot.ruleConfigurationId", equalTo("original-game"))
            jsonPath("$.snapshot.phase", equalTo("none"))
            jsonPath("$.snapshot.board.d4", equalTo("gold"))
            jsonPath("$.snapshot.board.d5", equalTo("dragon"))
            jsonPath("$.snapshot.board.d7", equalTo("raven"))
        }

        postDefaultCommand(command(getDefaultGame().version, "start-game")).andExpect {
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
        val game = getDefaultGame()

        postDefaultCommand(command(game.version, "select-starting-side", side = Side.ravens)).andExpect {
            status { isOk() }
            jsonPath("$.selectedStartingSide", equalTo("ravens"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }

        postDefaultCommand(command(getDefaultGame().version, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("setup"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }

        postDefaultCommand(command(getDefaultGame().version, "end-setup")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("move"))
            jsonPath("$.snapshot.activeSide", equalTo("ravens"))
        }
    }

    @Test
    fun `original game rejects a move that would leave the moved piece captured`() {
        seedDefaultGame(
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

        postDefaultCommand(command(getDefaultGame().version, "move-piece", origin = "b4", destination = "b1")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("You may not move so that your piece is captured."))
        }
    }

    @Test
    fun `stale expected version returns conflict with the latest snapshot`() {
        val game = getDefaultGame()

        executeDefaultCommand(command(game.version, "start-game"))

        postDefaultCommand(command(game.version, "start-game")).andExpect {
            status { isConflict() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `invalid command returns bad request`() {
        startSetup()
        endSetup()
        val game = getDefaultGame()

        postDefaultCommand(command(game.version, "move-piece", origin = "a1")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Command move-piece requires destination."))
        }
    }

    @Test
    fun `illegal setup command before starting a game leaves game unchanged`() {
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during none."
        )
    }

    @Test
    fun `illegal move command during setup leaves game unchanged`() {
        startSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "a2"),
            message = "Command move-piece is not allowed during setup."
        )
    }

    @Test
    fun `illegal cycle setup command after setup leaves game unchanged`() {
        startSetup()
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during move."
        )
    }

    @Test
    fun `out of bounds square is rejected`() {
        startSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "cycle-setup", square = "i9"),
            message = "Square i9 is outside the 7x7 board."
        )
    }

    @Test
    fun `out of bounds move destination is rejected`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "h1"),
            message = "Square h1 is outside the 7x7 board."
        )
    }

    @Test
    fun `move from empty square leaves game unchanged`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "b1", destination = "b2"),
            message = "No piece exists at b1."
        )
    }

    @Test
    fun `moving an opposing piece leaves game unchanged`() {
        startSetup()
        setupRavenAt("a1")
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "a2"),
            message = "The active side cannot move the piece at a1."
        )
    }

    @Test
    fun `moving into an occupied square leaves game unchanged`() {
        startSetup()
        setupDragonAt("a1")
        setupDragonAt("b2")
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "b2"),
            message = "Destination b2 is occupied."
        )
    }

    @Test
    fun `capture command during move phase leaves game unchanged`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "capture-piece", square = "e5"),
            message = "Command capture-piece is not allowed during move."
        )
    }

    @Test
    fun `skip capture during move phase leaves game unchanged`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "skip-capture"),
            message = "Command skip-capture is not allowed during move."
        )
    }

    @Test
    fun `undo during capture restores the pre move snapshot`() {
        enterCapturePhase()
        val beforeUndo = getDefaultGame()
        val undone = executeDefaultCommand(command(beforeUndo.version, "undo"))

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
        enterCapturePhase()
        executeDefaultCommand(command(getDefaultGame().version, "capture-piece", square = "b2"))
        val beforeUndo = getDefaultGame()
        val undone = executeDefaultCommand(command(beforeUndo.version, "undo"))

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
        startSetup()
        setupDragonAt("a1")
        endSetup()
        executeDefaultCommand(command(getDefaultGame().version, "move-piece", origin = "a1", destination = "a2"))

        mockMvc.get("/api/game")
            .andExpect {
                status { isOk() }
                jsonPath("$.snapshot.board.a2", equalTo("dragon"))
                jsonPath("$.canUndo", equalTo(true))
            }
    }

    @Test
    fun `undo with no move history leaves game unchanged`() {
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "undo"),
            message = "No move is available to undo."
        )
    }

    @Test
    fun `capturing an empty square leaves game unchanged`() {
        enterCapturePhase()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "capture-piece", square = "c3"),
            message = "No piece exists at c3."
        )
    }

    @Test
    fun `capturing a friendly piece leaves game unchanged`() {
        enterCapturePhase()
        val before = getDefaultGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "capture-piece", square = "a2"),
            message = "The active side cannot capture the piece at a2."
        )
    }

    @Test
    fun `end game preserves the board and adds game over before returning to no game`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        executeDefaultCommand(command(getDefaultGame().version, "move-piece", origin = "a1", destination = "a2"))

        postDefaultCommand(command(getDefaultGame().version, "end-game")).andExpect {
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
        startSetup()
        setupDragonAt("a1")
        endSetup()
        executeDefaultCommand(command(getDefaultGame().version, "move-piece", origin = "a1", destination = "a2"))
        executeDefaultCommand(command(getDefaultGame().version, "end-game"))

        postDefaultCommand(command(getDefaultGame().version, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.snapshot.phase", equalTo("setup"))
            jsonPath("$.snapshot.board", equalTo(emptyMap<String, String>()))
            jsonPath("$.snapshot.turns.length()", equalTo(0))
        }
    }

    private fun enterCapturePhase() {
        startSetup()
        setupDragonAt("a1")
        setupRavenAt("b2")
        endSetup()
        executeDefaultCommand(command(getDefaultGame().version, "move-piece", origin = "a1", destination = "a2"))
    }

    private fun assertGameUnchanged(expected: GameSession) {
        val after = getDefaultGame()
        assertAll(
            { assertEquals(expected.version, after.version) },
            { assertEquals(expected.snapshot, after.snapshot) }
        )
    }

    private fun assertRejectedCommandLeavesGameUnchanged(
        before: GameSession,
        command: GameCommandRequest,
        message: String
    ) {
        postDefaultCommand(command).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo(message))
        }

        assertGameUnchanged(before)
    }

    private fun startSetup(): GameSession =
        executeDefaultCommand(command(getDefaultGame().version, "start-game"))

    private fun endSetup(): GameSession =
        executeDefaultCommand(command(getDefaultGame().version, "end-setup"))

    private fun setupDragonAt(square: String) {
        executeDefaultCommand(command(getDefaultGame().version, "cycle-setup", square = square))
    }

    private fun setupRavenAt(square: String) {
        setupDragonAt(square)
        executeDefaultCommand(command(getDefaultGame().version, "cycle-setup", square = square))
    }
}
