package com.dragonsvsravens.game

import java.time.Instant

object GameSessionFactory {
    fun createFreshStoredGame(
        gameId: String,
        snapshot: GameSnapshot,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side,
        now: Instant = Instant.now()
    ): StoredGame = createStoredGame(
        gameId = gameId,
        snapshot = snapshot,
        undoSnapshots = emptyList(),
        version = 0,
        createdAt = now,
        updatedAt = now,
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide
    )

    fun createStoredGame(
        gameId: String,
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot>,
        version: Long,
        createdAt: Instant,
        updatedAt: Instant,
        lastAccessedAt: Instant = updatedAt,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side
    ): StoredGame = StoredGame(
        session = GameSession(
            id = gameId,
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            snapshot = snapshot,
            canUndo = undoSnapshots.isNotEmpty(),
            availableRuleConfigurations = GameRules.availableRuleConfigurations(),
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide
        ),
        undoSnapshots = undoSnapshots,
        lastAccessedAt = lastAccessedAt
    )
}
