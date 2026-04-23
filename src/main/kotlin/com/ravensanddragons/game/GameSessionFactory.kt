package com.ravensanddragons.game

import java.time.Instant

object GameSessionFactory {
    fun createFreshStoredGame(
        gameId: String,
        snapshot: GameSnapshot,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side,
        selectedBoardSize: Int,
        dragonsBotId: String? = null,
        ravensBotId: String? = null,
        createdByUserId: String? = null,
        now: Instant = Instant.now()
    ): StoredGame = createStoredGame(
        gameId = gameId,
        snapshot = snapshot,
        undoEntries = emptyList(),
        version = 0,
        createdAt = now,
        updatedAt = now,
        lifecycle = when {
            snapshot.turns.lastOrNull()?.type == TurnType.gameOver -> GameLifecycle.finished
            snapshot.phase == Phase.none -> GameLifecycle.new
            else -> GameLifecycle.active
        },
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide,
        selectedBoardSize = selectedBoardSize,
        dragonsBotId = dragonsBotId,
        ravensBotId = ravensBotId,
        createdByUserId = createdByUserId
    )

    fun createStoredGame(
        gameId: String,
        snapshot: GameSnapshot,
        undoEntries: List<UndoEntry>,
        version: Long,
        createdAt: Instant,
        updatedAt: Instant,
        lastAccessedAt: Instant = updatedAt,
        lifecycle: GameLifecycle,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side,
        selectedBoardSize: Int,
        dragonsPlayerUserId: String? = null,
        ravensPlayerUserId: String? = null,
        dragonsBotId: String? = null,
        ravensBotId: String? = null,
        createdByUserId: String? = null
    ): StoredGame = StoredGame(
        session = GameSession(
            id = gameId,
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lifecycle = lifecycle,
            snapshot = snapshot,
            canUndo = canUndo(undoEntries, dragonsBotId, ravensBotId, lifecycle),
            undoOwnerSide = undoEntries.lastOrNull()?.ownerSide,
            availableRuleConfigurations = GameRules.availableRuleConfigurations(),
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide,
            selectedBoardSize = selectedBoardSize,
            dragonsPlayerUserId = dragonsPlayerUserId,
            ravensPlayerUserId = ravensPlayerUserId,
            dragonsBotId = dragonsBotId,
            ravensBotId = ravensBotId,
            createdByUserId = createdByUserId
        ),
        undoEntries = undoEntries,
        lastAccessedAt = lastAccessedAt
    )

    private fun canUndo(
        undoEntries: List<UndoEntry>,
        dragonsBotId: String?,
        ravensBotId: String?,
        lifecycle: GameLifecycle
    ): Boolean {
        val lastEntry = undoEntries.lastOrNull() ?: return false
        val hasBotSeat = dragonsBotId != null || ravensBotId != null
        return if (hasBotSeat) {
            lastEntry.kind == UndoEntryKind.humanPlusBot ||
                (lifecycle == GameLifecycle.finished && lastEntry.kind == UndoEntryKind.humanOnly)
        } else {
            lastEntry.kind != UndoEntryKind.botOnly
        }
    }
}
