package com.ravensanddragons.game

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.web.*


import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class BotTurnRunnerTest {

    @Test
    fun `runBotTurns applies a synchronous bot reply and groups undo`() {
        val runner = createRunner()
        val preExchange = storedGame(
            snapshot = GameRules.startGame("sherwood-rules").copy(
                phase = Phase.move,
                activeSide = Side.dragons
            ),
            dragonsPlayerUserId = "player-one",
            ravensBotId = BotRegistry.randomBotId
        )
        val humanMove = GameRules.getLegalMoves(preExchange.session.snapshot).first()
        val afterHumanMove = GameCommandService(fixedClock()).applyCommand(
            preExchange,
            GameCommandRequest(
                expectedVersion = preExchange.session.version,
                type = "move-piece",
                origin = humanMove.origin,
                destination = humanMove.destination
            ),
            "player-one"
        )
        val persistedGames = mutableListOf<StoredGame>()

        val result = runner.runBotTurns(afterHumanMove) { stored ->
            persistedGames += stored
            stored
        }

        assertSame(result, persistedGames.last())
        assertEquals(2, result.session.snapshot.turns.size)
        assertEquals(1, result.undoEntries.size)
        assertEquals(UndoEntryKind.humanPlusBot, result.undoEntries.single().kind)
    }

    @Test
    fun `runBotTurns exits without persisting when the game is finished`() {
        val runner = createRunner()
        val finished = storedGame(
            snapshot = GameRules.endGame(GameRules.startGame("sherwood-rules"), "Dragons win"),
            lifecycle = GameLifecycle.finished,
            dragonsPlayerUserId = "player-one",
            ravensBotId = BotRegistry.randomBotId
        )
        var persisted = false

        val result = runner.runBotTurns(finished) {
            persisted = true
            it
        }

        assertSame(finished, result)
        assertEquals(false, persisted)
    }

    @Test
    fun `runBotTurns exits without persisting when the bot side has no legal moves`() {
        val runner = createRunner()
        val noMoves = storedGame(
            snapshot = GameRules.startGame("sherwood-rules").copy(
                board = mapOf(
                    "e5" to Piece.gold,
                    "d5" to Piece.dragon,
                    "e4" to Piece.dragon
                ),
                phase = Phase.move,
                activeSide = Side.ravens,
                turns = emptyList()
            ).copy(
                positionKeys = emptyList()
            ),
            lifecycle = GameLifecycle.active,
            dragonsPlayerUserId = "player-one",
            ravensBotId = BotRegistry.randomBotId
        )
        var persisted = false

        val result = runner.runBotTurns(noMoves) {
            persisted = true
            it
        }

        assertSame(noMoves, result)
        assertEquals(false, persisted)
    }

    @Test
    fun `selectLegalMove falls back when a bot returns an illegal move`() {
        val runner = createRunner()
        val snapshot = GameRules.startGame("sherwood-rules")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val selectedMove = runner.selectLegalMove(
            snapshot,
            legalMoves,
            object : GameBotStrategy {
                override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove =
                    LegalMove("d4", "d5")
            }
        )

        assertEquals(legalMoves.first(), selectedMove)
    }

    @Test
    fun `selectLegalMove falls back when a bot throws during search`() {
        val runner = createRunner()
        val snapshot = GameRules.startGame("sherwood-rules")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val selectedMove = runner.selectLegalMove(
            snapshot,
            legalMoves,
            object : GameBotStrategy {
                override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove =
                    throw IllegalArgumentException("boom")
            }
        )

        assertEquals(legalMoves.first(), selectedMove)
    }

    private fun createRunner(clock: Clock = fixedClock()): BotTurnRunner =
        BotTurnRunner(GameCommandService(clock), BotRegistry(FixedRandomIndexSource()))

    private fun storedGame(
        snapshot: GameSnapshot,
        lifecycle: GameLifecycle = GameLifecycle.active,
        dragonsPlayerUserId: String? = null,
        ravensBotId: String? = null
    ): StoredGame = GameSessionFactory.createStoredGame(
        gameId = "bot-runner-game",
        snapshot = snapshot,
        undoEntries = emptyList(),
        version = 0,
        createdAt = fixedClock().instant(),
        updatedAt = fixedClock().instant(),
        lastAccessedAt = fixedClock().instant(),
        lifecycle = lifecycle,
        selectedRuleConfigurationId = snapshot.ruleConfigurationId,
        selectedStartingSide = Side.dragons,
        selectedBoardSize = snapshot.boardSize,
        dragonsPlayerUserId = dragonsPlayerUserId,
        ravensBotId = ravensBotId
    )

    private fun fixedClock(now: Instant = Instant.parse("2026-04-08T12:00:00Z")): Clock =
        Clock.fixed(now, ZoneOffset.UTC)

    private class FixedRandomIndexSource : RandomIndexSource {
        override fun nextInt(bound: Int): Int = 0
    }
}
