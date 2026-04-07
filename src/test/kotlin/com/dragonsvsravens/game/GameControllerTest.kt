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
    fun resetGameToSetup() {
        val game = getGame()
        if (!isInitialSetup(game)) {
            executeCommand(command(game.version, "reset-game"))
        }
    }

    @Test
    fun `get game returns the shared default session`() {
        mockMvc.get("/api/game")
            .andExpect {
                status { isOk() }
                jsonPath("$.id", equalTo("default"))
                jsonPath("$.snapshot.phase", equalTo("setup"))
                jsonPath("$.snapshot.board.e5", equalTo("gold"))
            }
    }

    @Test
    fun `valid command increments version`() {
        val game = getGame()

        postCommand(command(game.version, "begin-game")).andExpect {
            status { isOk() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("move"))
        }
    }

    @Test
    fun `stale expected version returns conflict with the latest snapshot`() {
        val game = getGame()

        executeCommand(command(game.version, "begin-game"))

        postCommand(command(game.version, "reset-game")).andExpect {
            status { isConflict() }
            jsonPath("$.version", equalTo((game.version + 1).toInt()))
            jsonPath("$.snapshot.phase", equalTo("move"))
        }
    }

    @Test
    fun `invalid command returns bad request`() {
        executeCommand(command(getGame().version, "begin-game"))
        val game = getGame()

        postCommand(command(game.version, "move-piece", origin = "a1")).andExpect {
            status { isBadRequest() }
            jsonPath("$.message", equalTo("Command move-piece requires destination."))
        }
    }

    @Test
    fun `illegal move command during setup leaves game unchanged`() {
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "a2"),
            message = "Command move-piece is not allowed during setup."
        )
    }

    @Test
    fun `illegal cycle setup command after game start leaves game unchanged`() {
        executeCommand(command(getGame().version, "begin-game"))
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "cycle-setup", square = "a1"),
            message = "Command cycle-setup is not allowed during move."
        )
    }

    @Test
    fun `move from empty square leaves game unchanged`() {
        setupDragonAt("a1")
        beginGame()
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "b1", destination = "b2"),
            message = "No piece exists at b1."
        )
    }

    @Test
    fun `moving an opposing piece leaves game unchanged`() {
        setupRavenAt("a1")
        beginGame()
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "a2"),
            message = "The active side cannot move the piece at a1."
        )
    }

    @Test
    fun `moving into an occupied square leaves game unchanged`() {
        setupDragonAt("a1")
        beginGame()
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "move-piece", origin = "a1", destination = "e5"),
            message = "Destination e5 is occupied."
        )
    }

    @Test
    fun `capture command during move phase leaves game unchanged`() {
        setupDragonAt("a1")
        beginGame()
        val before = getGame()

        assertRejectedCommandLeavesGameUnchanged(
            before = before,
            command = command(before.version, "capture-piece", square = "e5"),
            message = "Command capture-piece is not allowed during move."
        )
    }

    @Test
    fun `skip capture during move phase leaves game unchanged`() {
        setupDragonAt("a1")
        beginGame()
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
            { org.junit.jupiter.api.Assertions.assertEquals(emptyList<MoveRecord>(), undone.snapshot.turns) },
            { org.junit.jupiter.api.Assertions.assertEquals(false, undone.canUndo) }
        )
    }

    @Test
    fun `fresh game fetch exposes can undo for another client`() {
        setupDragonAt("a1")
        beginGame()
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

    private fun enterCapturePhase() {
        setupDragonAt("a1")
        setupRavenAt("b2")
        beginGame()
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

    private fun beginGame(): GameSession =
        executeCommand(command(getGame().version, "begin-game"))

    private fun setupDragonAt(square: String) {
        executeCommand(command(getGame().version, "cycle-setup", square = square))
    }

    private fun setupRavenAt(square: String) {
        setupDragonAt(square)
        executeCommand(command(getGame().version, "cycle-setup", square = square))
    }

    private fun isInitialSetup(game: GameSession): Boolean =
        game.snapshot.phase == Phase.setup &&
            game.snapshot.board == mapOf("e5" to Piece.gold) &&
            game.snapshot.turns.isEmpty()

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
