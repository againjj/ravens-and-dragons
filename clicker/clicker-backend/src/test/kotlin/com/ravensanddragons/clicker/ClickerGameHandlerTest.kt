package com.ravensanddragons.clicker

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.ravensanddragons.platform.game.runtime.InvalidCommandException
import com.ravensanddragons.platform.game.runtime.VersionConflictException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.assertEquals

class ClickerGameHandlerTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val handler = ClickerGameHandler(
        objectMapper = objectMapper,
        clock = Clock.fixed(Instant.parse("2026-05-12T00:00:00Z"), ZoneOffset.UTC)
    )

    @Test
    fun createsGameAtZero() {
        val game = handler.createGame("CLK1234", objectMapper.createObjectNode(), "user-1")
        val state = game.readState()

        assertEquals("CLK1234", state.id)
        assertEquals("clicker", state.gameSlug)
        assertEquals(1, state.version)
        assertEquals(0, state.counter)
        assertEquals("active", state.lifecycle)
        assertEquals("user-1", state.createdByUserId)
    }

    @Test
    fun clickIncrementsTheCounter() {
        val game = handler.createGame("CLK1234", objectMapper.createObjectNode(), null)
        val updated = handler.applyCommand(game, clickCommand(expectedVersion = 1), "user-1")
        val state = updated.readState()

        assertEquals(2, state.version)
        assertEquals(1, state.counter)
        assertEquals("active", state.lifecycle)
    }

    @Test
    fun tenthClickFinishesTheGame() {
        var game = handler.createGame("CLK1234", objectMapper.createObjectNode(), null)

        repeat(10) {
            game = handler.applyCommand(game, clickCommand(expectedVersion = game.readState().version), "user-1")
        }

        val state = game.readState()
        assertEquals(10, state.counter)
        assertEquals("finished", state.lifecycle)
    }

    @Test
    fun rejectsClicksAfterGameIsOver() {
        var game = handler.createGame("CLK1234", objectMapper.createObjectNode(), null)
        repeat(10) {
            game = handler.applyCommand(game, clickCommand(expectedVersion = game.readState().version), "user-1")
        }

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(game, clickCommand(expectedVersion = 11), "user-1")
        }

        assertEquals("This Clicker game is already over.", exception.message)
    }

    @Test
    fun rejectsStaleCommands() {
        val game = handler.createGame("CLK1234", objectMapper.createObjectNode(), null)

        val exception = assertThrows<VersionConflictException> {
            handler.applyCommand(game, clickCommand(expectedVersion = 0), "user-1")
        }

        assertEquals(1, objectMapper.treeToValue(exception.latestState, ClickerGameState::class.java).version)
    }

    private fun clickCommand(expectedVersion: Long) =
        objectMapper.createObjectNode()
            .put("type", "click")
            .put("expectedVersion", expectedVersion)

    private fun com.ravensanddragons.platform.game.runtime.GameRecord.readState(): ClickerGameState =
        objectMapper.treeToValue(publicState, ClickerGameState::class.java)
}
