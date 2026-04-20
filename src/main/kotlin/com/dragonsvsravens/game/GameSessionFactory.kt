package com.dragonsvsravens.game

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
        undoSnapshots = emptyList(),
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
            canUndo = undoSnapshots.isNotEmpty() && dragonsBotId == null && ravensBotId == null,
            undoOwnerSide = undoSnapshots.lastOrNull()?.activeSide,
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
        undoSnapshots = undoSnapshots,
        lastAccessedAt = lastAccessedAt
    )
}
