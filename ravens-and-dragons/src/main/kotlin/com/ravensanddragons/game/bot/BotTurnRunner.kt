package com.ravensanddragons.game.bot

import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import org.springframework.stereotype.Component
import java.time.Instant

@Component
class BotTurnRunner(
    private val gameCommandService: GameCommandService,
    private val botRegistry: BotRegistry
) {
    fun runBotTurns(
        initial: StoredGame,
        persistAndBroadcast: (StoredGame) -> StoredGame
    ): StoredGame {
        var current = initial

        while (true) {
            val botDefinition = currentBotDefinition(current.session) ?: return current
            val legalMoves = GameRules.getLegalMoves(current.session.snapshot)
            if (legalMoves.isEmpty()) {
                return current
            }

            val selectedMove = selectLegalMove(current.session.snapshot, legalMoves, botDefinition.strategy)
            val nextState = gameCommandService.applyCommand(
                current,
                GameCommandRequest(
                    expectedVersion = current.session.version,
                    type = "move-piece",
                    origin = selectedMove.origin,
                    destination = selectedMove.destination
                ),
                actingUserId = null
            )
            current = persistAndBroadcast(groupBotUndoExchange(current, nextState))
        }
    }

    internal fun currentBotDefinition(session: GameSession): BotDefinition? {
        if (session.lifecycle != GameLifecycle.active || session.snapshot.phase != Phase.move) {
            return null
        }

        val activeBotId = when (session.snapshot.activeSide) {
            Side.dragons -> session.dragonsBotId
            Side.ravens -> session.ravensBotId
        } ?: return null

        return botRegistry.requireSupportedDefinition(activeBotId, session.selectedRuleConfigurationId)
    }

    internal fun selectLegalMove(
        snapshot: GameSnapshot,
        legalMoves: List<LegalMove>,
        strategy: GameBotStrategy
    ): LegalMove {
        val selectedMove = try {
            strategy.chooseMove(snapshot, legalMoves)
        } catch (_: RuntimeException) {
            return legalMoves.first()
        }

        return selectedMove.takeIf { it in legalMoves } ?: legalMoves.first()
    }

    internal fun groupBotUndoExchange(previous: StoredGame, updated: StoredGame): StoredGame {
        val previousUndoEntry = previous.undoEntries.lastOrNull() ?: return updated
        val latestUndoEntry = updated.undoEntries.lastOrNull() ?: return updated
        if (previousUndoEntry.kind != UndoEntryKind.humanOnly || latestUndoEntry.kind != UndoEntryKind.botOnly) {
            return updated
        }

        val groupedEntry = previousUndoEntry.copy(kind = UndoEntryKind.humanPlusBot)
        return rebuildStoredGame(
            session = updated.session,
            undoEntries = updated.undoEntries.dropLast(2) + groupedEntry,
            lastAccessedAt = updated.lastAccessedAt
        )
    }

    private fun rebuildStoredGame(
        session: GameSession,
        undoEntries: List<UndoEntry>,
        lastAccessedAt: Instant
    ): StoredGame = GameSessionFactory.createStoredGame(
        gameId = session.id,
        snapshot = session.snapshot,
        undoEntries = undoEntries,
        version = session.version,
        createdAt = session.createdAt,
        updatedAt = session.updatedAt,
        lastAccessedAt = lastAccessedAt,
        lifecycle = session.lifecycle,
        selectedRuleConfigurationId = session.selectedRuleConfigurationId,
        selectedStartingSide = session.selectedStartingSide,
        selectedBoardSize = session.selectedBoardSize,
        dragonsPlayerUserId = session.dragonsPlayerUserId,
        ravensPlayerUserId = session.ravensPlayerUserId,
        dragonsBotId = session.dragonsBotId,
        ravensBotId = session.ravensBotId,
        createdByUserId = session.createdByUserId
    )
}
