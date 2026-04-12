package com.dragonsvsravens.game

import java.time.Instant

object GameSessionFactory {
    fun createFreshStoredGame(
        gameId: String,
        snapshot: GameSnapshot,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side,
        selectedBoardSize: Int,
        createdByUserId: String? = null,
        now: Instant = Instant.now()
    ): StoredGame = createStoredGame(
        gameId = gameId,
        snapshot = snapshot,
        undoSnapshots = emptyList(),
        version = 0,
        createdAt = now,
        updatedAt = now,
        lifecycle = GameLifecycle.new,
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide,
        selectedBoardSize = selectedBoardSize,
        createdByUserId = createdByUserId
    )

    fun createStoredGame(
        gameId: String,
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot>,
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
        createdByUserId: String? = null
    ): StoredGame = StoredGame(
        session = GameSession(
            id = gameId,
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lifecycle = lifecycle,
            snapshot = snapshot,
            canUndo = undoSnapshots.isNotEmpty(),
            undoOwnerSide = undoSnapshots.lastOrNull()?.activeSide,
            availableRuleConfigurations = GameRules.availableRuleConfigurations(),
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide,
            selectedBoardSize = selectedBoardSize,
            dragonsPlayerUserId = dragonsPlayerUserId,
            ravensPlayerUserId = ravensPlayerUserId,
            createdByUserId = createdByUserId
        ),
        undoSnapshots = undoSnapshots,
        lastAccessedAt = lastAccessedAt
    )
}
