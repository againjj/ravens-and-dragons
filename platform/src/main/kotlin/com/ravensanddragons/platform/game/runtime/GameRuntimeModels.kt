package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode
import java.time.Instant

data class GameRecord(
    val id: String,
    val gameSlug: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val lifecycle: String,
    val publicState: JsonNode,
    val privateState: JsonNode,
    val createdByUserId: String? = null,
    val lastAccessedAt: Instant = updatedAt
)

data class StoredGameAccess(
    val gameId: String,
    val lastAccessedAt: Instant
)

data class ErrorResponse(
    val message: String
)

class InvalidCommandException(message: String) : RuntimeException(message)

class GameNotFoundException(gameId: String) : RuntimeException("Game $gameId was not found.")

class VersionConflictException(
    val latestState: JsonNode
) : RuntimeException("Game version conflict.")
