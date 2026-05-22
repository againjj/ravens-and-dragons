package com.ravensanddragons.tictactoe

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.ravensanddragons.platform.game.runtime.GameRecord
import com.ravensanddragons.platform.game.runtime.InvalidCommandException
import com.ravensanddragons.platform.game.runtime.VersionConflictException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.assertEquals

class TicTacToeGameHandlerTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val handler = TicTacToeGameHandler(
        objectMapper = objectMapper,
        clock = Clock.fixed(Instant.parse("2026-05-12T00:00:00Z"), ZoneOffset.UTC)
    )

    @Test
    fun createsEmptyGameWithXToMove() {
        val game = handler.createGame("TTT1234", objectMapper.createObjectNode(), "user-1")
        val state = game.readState()

        assertEquals("TTT1234", state.id)
        assertEquals("tic-tac-toe", state.gameSlug)
        assertEquals(1, state.version)
        assertEquals(List(9) { null }, state.board)
        assertEquals("X", state.currentMark)
        assertEquals("active", state.lifecycle)
        assertEquals(null, state.winner)
        assertEquals("user-1", state.createdByUserId)
    }

    @Test
    fun placingMarkAlternatesTurns() {
        val game = handler.createGame("TTT1234", objectMapper.createObjectNode(), null)
        val updated = handler.applyCommand(game, placeMarkCommand(expectedVersion = 1, cellIndex = 4), "user-1")
        val state = updated.readState()

        assertEquals(2, state.version)
        assertEquals("X", state.board[4])
        assertEquals("O", state.currentMark)
        assertEquals("active", state.lifecycle)
    }

    @Test
    fun finishesWhenAPlayerWins() {
        var game = handler.createGame("TTT1234", objectMapper.createObjectNode(), null)
        listOf(0, 3, 1, 4, 2).forEach { cellIndex ->
            game = handler.applyCommand(
                game,
                placeMarkCommand(expectedVersion = game.readState().version, cellIndex = cellIndex),
                "user-1"
            )
        }

        val state = game.readState()
        assertEquals("finished", state.lifecycle)
        assertEquals("X", state.winner)
        assertEquals(listOf(0, 1, 2), state.winningLine)
        assertEquals("X", state.currentMark)
    }

    @Test
    fun finishesWhenTheBoardDraws() {
        var game = handler.createGame("TTT1234", objectMapper.createObjectNode(), null)
        listOf(0, 1, 2, 4, 3, 5, 7, 6, 8).forEach { cellIndex ->
            game = handler.applyCommand(
                game,
                placeMarkCommand(expectedVersion = game.readState().version, cellIndex = cellIndex),
                "user-1"
            )
        }

        val state = game.readState()
        assertEquals("finished", state.lifecycle)
        assertEquals(null, state.winner)
        assertEquals(emptyList(), state.winningLine)
    }

    @Test
    fun rejectsOccupiedSquares() {
        val game = handler.createGame("TTT1234", objectMapper.createObjectNode(), null)
        val updated = handler.applyCommand(game, placeMarkCommand(expectedVersion = 1, cellIndex = 4), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(updated, placeMarkCommand(expectedVersion = 2, cellIndex = 4), "user-1")
        }

        assertEquals("That square is already occupied.", exception.message)
    }

    @Test
    fun rejectsMovesAfterGameIsOver() {
        var game = handler.createGame("TTT1234", objectMapper.createObjectNode(), null)
        listOf(0, 3, 1, 4, 2).forEach { cellIndex ->
            game = handler.applyCommand(
                game,
                placeMarkCommand(expectedVersion = game.readState().version, cellIndex = cellIndex),
                "user-1"
            )
        }

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(game, placeMarkCommand(expectedVersion = 6, cellIndex = 5), "user-1")
        }

        assertEquals("This Tic-Tac-Toe game is already over.", exception.message)
    }

    @Test
    fun rejectsStaleCommands() {
        val game = handler.createGame("TTT1234", objectMapper.createObjectNode(), null)

        val exception = assertThrows<VersionConflictException> {
            handler.applyCommand(game, placeMarkCommand(expectedVersion = 0, cellIndex = 0), "user-1")
        }

        assertEquals(1, objectMapper.treeToValue(exception.latestState, TicTacToeGameState::class.java).version)
    }

    private fun placeMarkCommand(expectedVersion: Long, cellIndex: Int) =
        objectMapper.createObjectNode()
            .put("type", "placeMark")
            .put("expectedVersion", expectedVersion)
            .put("cellIndex", cellIndex)

    private fun GameRecord.readState(): TicTacToeGameState =
        objectMapper.treeToValue(publicState, TicTacToeGameState::class.java)
}
