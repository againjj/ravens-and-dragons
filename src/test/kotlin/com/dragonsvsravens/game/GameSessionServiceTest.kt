package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
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
