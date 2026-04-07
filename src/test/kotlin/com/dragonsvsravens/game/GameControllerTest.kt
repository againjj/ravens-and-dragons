package com.dragonsvsravens.game

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertAll
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest
@AutoConfigureMockMvc
class GameControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @BeforeEach
    fun resetGameToNoGame() {
        while (true) {
            val game = getGame()
            when (game.snapshot.phase) {
                Phase.none -> return
                Phase.setup -> executeCommand(command(game.version, "end-setup"))
                Phase.move, Phase.capture -> executeCommand(command(game.version, "end-game"))
            }
        }
    }

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
        val game = getGame()

        postCommand(command(game.version, "start-game")).andExpect {
            status { isOk() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `stale expected version returns conflict with the latest snapshot`() {
        val game = getGame()

        executeCommand(command(game.version, "start-game"))

        postCommand(command(game.version, "start-game")).andExpect {
            status { isConflict() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("setup"))
        }
    }

    @Test
    fun `invalid command returns bad request`() {
        startSetup()
        endSetup()
        val game = getGame()

        postCommand(command(game.version, "move-piece", origin = "a1")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Command move-piece requires destination."))
        }
    }

    @Test
    fun `illegal setup command before starting a game leaves game unchanged`() {
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during none."
        )
    }

    @Test
    fun `illegal move command during setup leaves game unchanged`() {
        startSetup()
        val before = getGame()

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
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during move."
        )
    }

    @Test
    fun `move from empty square leaves game unchanged`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        val before = getGame()

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
        val before = getGame()

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
        val before = getGame()

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
        val before = getGame()

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
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "skip-capture"),
            message = "Command skip-capture is not allowed during move."
        )
    }

    @Test
    fun `undo during capture restores the pre move snapshot`() {
        enterCapturePhase()
        val beforeUndo = getGame()
        val undone = executeCommand(command(beforeUndo.version, "undo"))

        assertAll(
            { org.junit.jupiter.api.Assertions.assertEquals(Phase.move, undone.snapshot.phase) },
            { org.junit.jupiter.api.Assertions.assertEquals(Side.dragons, undone.snapshot.activeSide) },
            { org.junit.jupiter.api.Assertions.assertEquals(null, undone.snapshot.pendingMove) },
            { org.junit.jupiter.api.Assertions.assertEquals(Piece.dragon, undone.snapshot.board["a1"]) },
            { org.junit.jupiter.api.Assertions.assertEquals(null, undone.snapshot.board["a2"]) },
            { org.junit.jupiter.api.Assertions.assertEquals(false, undone.canUndo) }
        )
    }

    @Test
    fun `undo after capture restores the moved and captured pieces`() {
        enterCapturePhase()
        executeCommand(command(getGame().version, "capture-piece", square = "b2"))
        val beforeUndo = getGame()
        val undone = executeCommand(command(beforeUndo.version, "undo"))

        assertAll(
            { org.junit.jupiter.api.Assertions.assertEquals(Phase.move, undone.snapshot.phase) },
            { org.junit.jupiter.api.Assertions.assertEquals(Side.dragons, undone.snapshot.activeSide) },
            { org.junit.jupiter.api.Assertions.assertEquals(Piece.dragon, undone.snapshot.board["a1"]) },
            { org.junit.jupiter.api.Assertions.assertEquals(null, undone.snapshot.board["a2"]) },
            { org.junit.jupiter.api.Assertions.assertEquals(Piece.raven, undone.snapshot.board["b2"]) },
            { org.junit.jupiter.api.Assertions.assertEquals(emptyList<TurnRecord>(), undone.snapshot.turns) },
            { org.junit.jupiter.api.Assertions.assertEquals(false, undone.canUndo) }
        )
    }

    @Test
    fun `fresh game fetch exposes can undo for another client`() {
        startSetup()
        setupDragonAt("a1")
        endSetup()
        executeCommand(command(getGame().version, "move-piece", origin = "a1", destination = "a2"))

        mockMvc.get("/api/game")
            .andExpect {
                status { isOk() }
                jsonPath("$.snapshot.board.a2", equalTo("dragon"))
                jsonPath("$.canUndo", equalTo(true))
            }
    }

    @Test
    fun `undo with no move history leaves game unchanged`() {
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "undo"),
            message = "No move is available to undo."
        )
    }

    @Test
    fun `capturing an empty square leaves game unchanged`() {
        enterCapturePhase()
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "capture-piece", square = "c3"),
            message = "No piece exists at c3."
        )
    }

    @Test
    fun `capturing a friendly piece leaves game unchanged`() {
        enterCapturePhase()
        val before = getGame()

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
        executeCommand(command(getGame().version, "move-piece", origin = "a1", destination = "a2"))

        postCommand(command(getGame().version, "end-game")).andExpect {
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
        executeCommand(command(getGame().version, "move-piece", origin = "a1", destination = "a2"))
        executeCommand(command(getGame().version, "end-game"))

        postCommand(command(getGame().version, "start-game")).andExpect {
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
        executeCommand(command(getGame().version, "move-piece", origin = "a1", destination = "a2"))
    }

    private fun assertGameUnchanged(expected: GameSession) {
        val after = getGame()
        assertAll(
            { org.junit.jupiter.api.Assertions.assertEquals(expected.version, after.version) },
            { org.junit.jupiter.api.Assertions.assertEquals(expected.snapshot, after.snapshot) }
        )
    }

    private fun assertRejectedCommandLeavesGameUnchanged(
        before: GameSession,
        command: GameCommandRequest,
        message: String
    ) {
        postCommand(command).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo(message))
        }

        assertGameUnchanged(before)
    }

    private fun startSetup(): GameSession =
        executeCommand(command(getGame().version, "start-game"))

    private fun endSetup(): GameSession =
        executeCommand(command(getGame().version, "end-setup"))

    private fun setupDragonAt(square: String) {
        executeCommand(command(getGame().version, "cycle-setup", square = square))
    }

    private fun setupRavenAt(square: String) {
        setupDragonAt(square)
        executeCommand(command(getGame().version, "cycle-setup", square = square))
    }

    private fun isNoGame(game: GameSession): Boolean =
        game.snapshot.phase == Phase.none

    private fun command(
        expectedVersion: Long,
        type: String,
        square: String? = null,
        origin: String? = null,
        destination: String? = null
    ): GameCommandRequest = GameCommandRequest(
        expectedVersion = expectedVersion,
        type = type,
        square = square,
        origin = origin,
        destination = destination
    )

    private fun getGame(): GameSession =
        objectMapper.readValue(
            mockMvc.get("/api/game")
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

    private fun executeCommand(command: GameCommandRequest): GameSession =
        objectMapper.readValue(
            postCommand(command)
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

    private fun postCommand(command: GameCommandRequest): org.springframework.test.web.servlet.ResultActionsDsl =
        mockMvc.post("/api/game/commands") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command)
        }
}
