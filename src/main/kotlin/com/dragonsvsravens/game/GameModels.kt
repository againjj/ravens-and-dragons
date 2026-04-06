package com.dragonsvsravens.game

import java.time.Instant

enum class Piece {
    dragon,
    raven,
    gold
}

enum class Side {
    dragons,
    ravens
}

enum class Phase {
    setup,
    move,
    capture
}

data class MoveRecord(
    val from: String,
    val to: String,
    val captured: String? = null
)

data class GameSnapshot(
    val board: Map<String, Piece>,
    val phase: Phase,
    val activeSide: Side,
    val pendingMove: MoveRecord?,
    val turns: List<MoveRecord>
)

data class GameSession(
    val id: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val snapshot: GameSnapshot
)

data class GameCommandRequest(
    val expectedVersion: Long,
    val type: String,
    val square: String? = null,
    val origin: String? = null,
    val destination: String? = null
)

data class ErrorResponse(
    val message: String
)

class InvalidCommandException(message: String) : RuntimeException(message)

class VersionConflictException(
    val latestGame: GameSession
) : RuntimeException("Game version conflict.")
