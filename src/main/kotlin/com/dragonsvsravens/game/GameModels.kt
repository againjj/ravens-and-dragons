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
    none,
    setup,
    move,
    capture
}

enum class TurnType {
    move,
    gameOver
}

data class RuleConfigurationSummary(
    val id: String,
    val name: String,
    val descriptionSections: List<RuleDescriptionSection>,
    val hasSetupPhase: Boolean,
    val hasManualCapture: Boolean,
    val hasManualEndGame: Boolean
)

data class RuleDescriptionSection(
    val heading: String? = null,
    val paragraphs: List<String>
)

data class TurnRecord(
    val type: TurnType,
    val from: String? = null,
    val to: String? = null,
    val capturedSquares: List<String> = emptyList(),
    val outcome: String? = null
)

data class GameSnapshot(
    val board: Map<String, Piece>,
    val phase: Phase,
    val activeSide: Side,
    val pendingMove: TurnRecord?,
    val turns: List<TurnRecord>,
    val ruleConfigurationId: String,
    val positionKeys: List<String> = emptyList()
)

data class GameSession(
    val id: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val snapshot: GameSnapshot,
    val canUndo: Boolean,
    val availableRuleConfigurations: List<RuleConfigurationSummary>,
    val selectedRuleConfigurationId: String,
    val selectedStartingSide: Side
)

data class GameCommandRequest(
    val expectedVersion: Long,
    val type: String,
    val square: String? = null,
    val origin: String? = null,
    val destination: String? = null,
    val ruleConfigurationId: String? = null,
    val side: Side? = null
)

data class ErrorResponse(
    val message: String
)

class InvalidCommandException(message: String) : RuntimeException(message)

class VersionConflictException(
    val latestGame: GameSession
) : RuntimeException("Game version conflict.")
