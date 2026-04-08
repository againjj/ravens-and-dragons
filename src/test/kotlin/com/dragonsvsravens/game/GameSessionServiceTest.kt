package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

class GameSessionServiceTest {

    @Test
    fun `broken sse emitter does not prevent a valid command from succeeding for its game`() {
        val service = createService()
        val failingEmitter = object : SseEmitter(0L) {
            override fun send(builder: SseEventBuilder) {
                throw IllegalStateException("stale emitter")
            }
        }
        val recordingEmitter = RecordingEmitter()
        val game = service.createGame()

        service.createEmitter(game.id, failingEmitter)
        service.createEmitter(game.id, recordingEmitter)

        val updated = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = 0,
                type = "start-game"
            )
        )

        assertEquals(1, updated.version)
        assertEquals(Phase.setup, updated.snapshot.phase)
        assertEquals(2, recordingEmitter.eventsSent)
    }

    @Test
    fun `sse broadcasts are scoped to one game`() {
        val service = createService()
        val firstGame = service.createGame()
        val secondGame = service.createGame()
        val firstEmitter = RecordingEmitter()
        val secondEmitter = RecordingEmitter()

        service.createEmitter(firstGame.id, firstEmitter)
        service.createEmitter(secondGame.id, secondEmitter)

        service.applyCommand(
            firstGame.id,
            GameCommandRequest(
                expectedVersion = 0,
                type = "start-game"
            )
        )

        assertEquals(2, firstEmitter.eventsSent)
        assertEquals(1, secondEmitter.eventsSent)
    }

    @Test
    fun `mutating one game does not affect another game`() {
        val service = createService()
        val firstGame = service.createGame()
        val secondGame = service.createGame()

        val updatedFirstGame = service.applyCommand(
            firstGame.id,
            GameCommandRequest(
                expectedVersion = firstGame.version,
                type = "start-game"
            )
        )
        val unchangedSecondGame = service.getGame(secondGame.id)

        assertEquals(Phase.setup, updatedFirstGame.snapshot.phase)
        assertEquals(Phase.none, unchangedSecondGame.snapshot.phase)
        assertEquals(0, unchangedSecondGame.version)
    }

    @Test
    fun `version conflicts are scoped to a single game`() {
        val service = createService()
        val firstGame = service.createGame()
        val secondGame = service.createGame()

        service.applyCommand(
            firstGame.id,
            GameCommandRequest(
                expectedVersion = firstGame.version,
                type = "start-game"
            )
        )

        val conflict = assertThrows<VersionConflictException> {
            service.applyCommand(
                firstGame.id,
                GameCommandRequest(
                    expectedVersion = firstGame.version,
                    type = "start-game"
                )
            )
        }

        val updatedSecondGame = service.applyCommand(
            secondGame.id,
            GameCommandRequest(
                expectedVersion = secondGame.version,
                type = "start-game"
            )
        )

        assertEquals(1, conflict.latestGame.version)
        assertEquals(firstGame.id, conflict.latestGame.id)
        assertEquals(Phase.setup, updatedSecondGame.snapshot.phase)
        assertEquals(secondGame.id, updatedSecondGame.id)
    }

    @Test
    fun `selecting a rule configuration updates the shared session in the no game state`() {
        val service = createService()

        val updated = service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "trivial"
            )
        )

        assertEquals("trivial", updated.selectedRuleConfigurationId)
        assertEquals("trivial", updated.snapshot.ruleConfigurationId)
        assertEquals(Phase.none, updated.snapshot.phase)
        assertEquals(Piece.dragon, updated.snapshot.board["a1"])
        assertEquals(Piece.gold, updated.snapshot.board["a2"])
        assertEquals(Piece.raven, updated.snapshot.board["a7"])
        assertTrue(updated.snapshot.turns.isEmpty())
    }

    @Test
    fun `selecting a starting side updates free play in the no game state`() {
        val service = createService()

        val updated = service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-starting-side",
                side = Side.ravens
            )
        )

        assertEquals(Side.ravens, updated.selectedStartingSide)
        assertEquals(Side.ravens, updated.snapshot.activeSide)
        assertEquals(GameRules.freePlayRuleConfigurationId, updated.snapshot.ruleConfigurationId)
    }

    @Test
    fun `undo restores the previous snapshot and updates can undo`() {
        val service = createService()

        service.applyCommand(GameCommandRequest(expectedVersion = 0, type = "start-game"))
        service.applyCommand(GameCommandRequest(expectedVersion = 1, type = "cycle-setup", square = "a1"))
        service.applyCommand(GameCommandRequest(expectedVersion = 2, type = "end-setup"))
        val moved = service.applyCommand(
            GameCommandRequest(
                expectedVersion = 3,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )

        assertTrue(moved.canUndo)
        assertEquals(Phase.move, moved.snapshot.phase)
        assertEquals(Piece.dragon, moved.snapshot.board["a2"])

        val undone = service.applyCommand(GameCommandRequest(expectedVersion = 4, type = "undo"))

        assertFalse(undone.canUndo)
        assertEquals(Phase.move, undone.snapshot.phase)
        assertEquals(Piece.dragon, undone.snapshot.board["a1"])
        assertFalse(undone.snapshot.board.containsKey("a2"))
    }

    @Test
    fun `end game preserves the board and clears undo`() {
        val service = createService()

        service.applyCommand(GameCommandRequest(expectedVersion = 0, type = "start-game"))
        service.applyCommand(GameCommandRequest(expectedVersion = 1, type = "cycle-setup", square = "a1"))
        service.applyCommand(GameCommandRequest(expectedVersion = 2, type = "end-setup"))
        service.applyCommand(
            GameCommandRequest(
                expectedVersion = 3,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )

        val ended = service.applyCommand(GameCommandRequest(expectedVersion = 4, type = "end-game"))

        assertEquals(Phase.none, ended.snapshot.phase)
        assertEquals(Piece.dragon, ended.snapshot.board["a2"])
        assertEquals(TurnType.gameOver, ended.snapshot.turns.last().type)
        assertFalse(ended.canUndo)
    }

    @Test
    fun `starting original game uses its preset board and opening side`() {
        val service = createService()

        service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "original-game"
            )
        )

        val started = service.applyCommand(GameCommandRequest(expectedVersion = 1, type = "start-game"))

        assertEquals("original-game", started.snapshot.ruleConfigurationId)
        assertEquals(Phase.move, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)
        assertEquals(Piece.gold, started.snapshot.board["d4"])
        assertEquals(Piece.dragon, started.snapshot.board["d5"])
        assertEquals(Piece.raven, started.snapshot.board["d7"])
    }

    @Test
    fun `starting sherwood rules uses the original setup and opening side`() {
        val service = createService()

        service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "sherwood-rules"
            )
        )

        val started = service.applyCommand(GameCommandRequest(expectedVersion = 1, type = "start-game"))

        assertEquals("sherwood-rules", started.snapshot.ruleConfigurationId)
        assertEquals(Phase.move, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)
        assertEquals(Piece.gold, started.snapshot.board["d4"])
        assertEquals(Piece.dragon, started.snapshot.board["d5"])
        assertEquals(Piece.raven, started.snapshot.board["d7"])
    }

    @Test
    fun `starting free play honors the selected starting side through setup`() {
        val service = createService()

        service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-starting-side",
                side = Side.ravens
            )
        )

        val started = service.applyCommand(GameCommandRequest(expectedVersion = 1, type = "start-game"))
        assertEquals(Phase.setup, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)

        val endedSetup = service.applyCommand(GameCommandRequest(expectedVersion = 2, type = "end-setup"))
        assertEquals(Phase.move, endedSetup.snapshot.phase)
        assertEquals(Side.ravens, endedSetup.snapshot.activeSide)
    }

    @Test
    fun `undo with no move history is rejected`() {
        val service = createService()

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(GameCommandRequest(expectedVersion = 0, type = "undo"))
        }

        assertEquals("No move is available to undo.", exception.message)
        assertFalse(service.getGame().canUndo)
    }

    private class RecordingEmitter : SseEmitter(0L) {
        var eventsSent: Int = 0

        override fun send(builder: SseEventBuilder) {
            eventsSent += 1
        }
    }

    private fun createService(): GameSessionService = GameSessionService(InMemoryGameStore())
}
