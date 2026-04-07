package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

class GameSessionServiceTest {

    @Test
    fun `broken sse emitter does not prevent a valid command from succeeding`() {
        val service = GameSessionService()
        val emitters = emittersOf(service)
        val failingEmitter = object : SseEmitter(0L) {
            override fun send(builder: SseEventBuilder) {
                throw IllegalStateException("stale emitter")
            }
        }
        val recordingEmitter = RecordingEmitter()

        emitters.add(failingEmitter)
        emitters.add(recordingEmitter)

        val updated = service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "begin-game"
            )
        )

        assertEquals(1, updated.version)
        assertEquals(Phase.move, updated.snapshot.phase)
        assertEquals(1, recordingEmitter.eventsSent)
    }

    @Test
    fun `broken sse emitter is removed after broadcast failure`() {
        val service = GameSessionService()
        val emitters = emittersOf(service)
        val failingEmitter = object : SseEmitter(0L) {
            override fun send(builder: SseEventBuilder) {
                throw IllegalStateException("stale emitter")
            }
        }
        val recordingEmitter = RecordingEmitter()

        emitters.add(failingEmitter)
        emitters.add(recordingEmitter)

        service.applyCommand(
            GameCommandRequest(
                expectedVersion = 0,
                type = "begin-game"
            )
        )

        assertFalse(emitters.contains(failingEmitter))
        assertTrue(emitters.contains(recordingEmitter))
    }

    @Test
    fun `undo restores the previous snapshot and updates can undo`() {
        val service = GameSessionService()

        service.applyCommand(GameCommandRequest(expectedVersion = 0, type = "cycle-setup", square = "a1"))
        service.applyCommand(GameCommandRequest(expectedVersion = 1, type = "begin-game"))
        val moved = service.applyCommand(
            GameCommandRequest(
                expectedVersion = 2,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )

        assertTrue(moved.canUndo)
        assertEquals(Phase.move, moved.snapshot.phase)
        assertEquals(Piece.dragon, moved.snapshot.board["a2"])

        val undone = service.applyCommand(GameCommandRequest(expectedVersion = 3, type = "undo"))

        assertFalse(undone.canUndo)
        assertEquals(Phase.move, undone.snapshot.phase)
        assertEquals(Piece.dragon, undone.snapshot.board["a1"])
        assertFalse(undone.snapshot.board.containsKey("a2"))
    }

    @Test
    fun `undo with no move history is rejected`() {
        val service = GameSessionService()

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(GameCommandRequest(expectedVersion = 0, type = "undo"))
        }

        assertEquals("No move is available to undo.", exception.message)
        assertFalse(service.getGame().canUndo)
    }

    @Suppress("UNCHECKED_CAST")
    private fun emittersOf(service: GameSessionService): MutableList<SseEmitter> {
        val field = GameSessionService::class.java.getDeclaredField("emitters")
        field.isAccessible = true
        return field.get(service) as MutableList<SseEmitter>
    }

    private class RecordingEmitter : SseEmitter(0L) {
        var eventsSent: Int = 0

        override fun send(builder: SseEventBuilder) {
            eventsSent += 1
        }
    }
}
