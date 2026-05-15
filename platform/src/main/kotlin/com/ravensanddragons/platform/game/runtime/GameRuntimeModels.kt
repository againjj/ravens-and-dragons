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
    val lastAccessedAt: Instant = updatedAt,
    val publiclyListed: Boolean = true
)

data class StoredGameAccess(
    val gameId: String,
    val lastAccessedAt: Instant
)

data class PublicGameDetails(
    val gameName: String,
    val openSeats: Int
)

data class PublicGameListing(
    val gameId: String,
    val gameSlug: String,
    val gameName: String,
    val openSeats: Int
)

data class PlayerGameDetails(
    val gameName: String,
    val isCurrentUserTurn: Boolean
)

data class PlayerGameListing(
    val gameId: String,
    val gameSlug: String,
    val gameName: String,
    val isCurrentUserTurn: Boolean
)

data class ErrorResponse(
    val message: String
)

internal fun <T> Iterable<T>.sortedByGameListOrder(
    gameName: (T) -> String,
    gameId: (T) -> String
): List<T> = sortedWith(compareBy<T> { gameName(it) }.thenBy { gameId(it) })

internal fun <T> Sequence<T>.sortedByGameListOrder(
    gameName: (T) -> String,
    gameId: (T) -> String
): Sequence<T> = sortedWith(compareBy<T> { gameName(it) }.thenBy { gameId(it) })

class InvalidCommandException(message: String) : RuntimeException(message)

class GameNotFoundException(gameId: String) : RuntimeException("Game $gameId was not found.")

class PlayerAccountMissingException : RuntimeException("The chosen player account no longer exists.")

class VersionConflictException(
    val latestState: JsonNode
) : RuntimeException("Game version conflict.")
