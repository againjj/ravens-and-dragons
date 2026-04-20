package com.dragonsvsravens.game

import com.dragonsvsravens.auth.AuthUserSummary
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
    move,
    capture
}

enum class TurnType {
    move,
    gameOver
}

enum class GameLifecycle {
    new,
    active,
    finished
}

data class RuleConfigurationSummary(
    val id: String,
    val name: String,
    val descriptionSections: List<RuleDescriptionSection>,
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
    val boardSize: Int,
    val specialSquare: String,
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
    val lifecycle: GameLifecycle,
    val snapshot: GameSnapshot,
    val canUndo: Boolean,
    val undoOwnerSide: Side? = null,
    val availableRuleConfigurations: List<RuleConfigurationSummary>,
    val selectedRuleConfigurationId: String,
    val selectedStartingSide: Side,
    val selectedBoardSize: Int,
    val dragonsPlayerUserId: String? = null,
    val ravensPlayerUserId: String? = null,
    val dragonsBotId: String? = null,
    val ravensBotId: String? = null,
    val createdByUserId: String? = null
)

data class CreateGameRequest(
    val ruleConfigurationId: String? = null,
    val startingSide: Side? = null,
    val boardSize: Int? = null,
    val board: Map<String, Piece>? = null
)

data class CreateGameResponse(
    val game: GameSession
)

data class GameCommandRequest(
    val expectedVersion: Long,
    val type: String,
    val square: String? = null,
    val origin: String? = null,
    val destination: String? = null,
    val ruleConfigurationId: String? = null,
    val side: Side? = null,
    val boardSize: Int? = null
)

data class ErrorResponse(
    val message: String
)

enum class ViewerRole {
    anonymous,
    spectator,
    dragons,
    ravens
}

data class GamePlayerSummary(
    val id: String,
    val displayName: String
)

data class BotSummary(
    val id: String,
    val displayName: String
)

data class ClaimSideRequest(
    val side: Side
)

data class AssignBotOpponentRequest(
    val botId: String
)

data class GameViewResponse(
    val game: GameSession,
    val currentUser: AuthUserSummary?,
    val dragonsPlayer: GamePlayerSummary?,
    val ravensPlayer: GamePlayerSummary?,
    val dragonsBot: BotSummary?,
    val ravensBot: BotSummary?,
    val availableBots: List<BotSummary>,
    val viewerRole: ViewerRole
)

class InvalidCommandException(message: String) : RuntimeException(message)

class GameNotFoundException(gameId: String) : RuntimeException("Game $gameId was not found.")

class VersionConflictException(
    val latestGame: GameSession
) : RuntimeException("Game version conflict.")
