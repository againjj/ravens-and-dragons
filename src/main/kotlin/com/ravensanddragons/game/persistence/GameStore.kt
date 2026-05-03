package com.ravensanddragons.game.persistence

import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.model.*


import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

data class StoredGame(
    val session: GameSession,
    val undoEntries: List<UndoEntry>,
    val lastAccessedAt: Instant
)

data class StoredGameAccess(
    val gameId: String,
    val lastAccessedAt: Instant
)

interface GameStore {
    fun get(gameId: String): StoredGame?

    fun put(game: StoredGame)

    fun putIfAbsent(game: StoredGame): Boolean

    fun touch(gameId: String, accessedAt: Instant = Instant.now()): StoredGame?

    fun entries(): List<StoredGame>

    fun staleEntries(): List<StoredGameAccess>

    fun remove(gameId: String): Boolean

    fun clearUserReferences(userId: String): List<StoredGame>
}

class InMemoryGameStore : GameStore {
    private val games = ConcurrentHashMap<String, StoredGame>()

    override fun get(gameId: String): StoredGame? = games[gameId]

    override fun put(game: StoredGame) {
        games[game.session.id] = game
    }

    override fun putIfAbsent(game: StoredGame): Boolean =
        games.putIfAbsent(game.session.id, game) == null

    override fun touch(gameId: String, accessedAt: Instant): StoredGame? {
        games.computeIfPresent(gameId) { _, storedGame ->
            storedGame.copy(lastAccessedAt = accessedAt)
        }
        return games[gameId]
    }

    override fun entries(): List<StoredGame> = games.values.toList()

    override fun staleEntries(): List<StoredGameAccess> =
        games.values.map { storedGame ->
            StoredGameAccess(
                gameId = storedGame.session.id,
                lastAccessedAt = storedGame.lastAccessedAt
            )
        }

    override fun remove(gameId: String): Boolean = games.remove(gameId) != null

    override fun clearUserReferences(userId: String): List<StoredGame> {
        val updatedGames = mutableListOf<StoredGame>()
        games.forEach { (gameId, storedGame) ->
            val session = storedGame.session
            if (session.dragonsPlayerUserId == userId || session.ravensPlayerUserId == userId || session.createdByUserId == userId) {
                val updated = storedGame.copy(
                    session = session.copy(
                        dragonsPlayerUserId = session.dragonsPlayerUserId.takeUnless { it == userId },
                        ravensPlayerUserId = session.ravensPlayerUserId.takeUnless { it == userId },
                        createdByUserId = session.createdByUserId.takeUnless { it == userId }
                    )
                )
                games[gameId] = updated
                updatedGames += updated
            }
        }
        return updatedGames
    }

    fun clear() {
        games.clear()
    }
}

class ConcurrentGameUpdateException(gameId: String) :
    RuntimeException("Game $gameId was updated concurrently.")
