package com.ravensanddragons.platform.game.runtime

import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

interface GameStore {
    fun get(gameId: String): GameRecord?

    fun put(game: GameRecord)

    fun putIfAbsent(game: GameRecord): Boolean

    fun touch(gameId: String, accessedAt: Instant = Instant.now()): GameRecord?

    fun entries(): List<GameRecord>

    fun staleEntries(): List<StoredGameAccess>

    fun remove(gameId: String): Boolean
}

class InMemoryGameStore : GameStore {
    private val games = ConcurrentHashMap<String, GameRecord>()

    override fun get(gameId: String): GameRecord? = games[gameId]

    override fun put(game: GameRecord) {
        games[game.id] = game
    }

    override fun putIfAbsent(game: GameRecord): Boolean =
        games.putIfAbsent(game.id, game) == null

    override fun touch(gameId: String, accessedAt: Instant): GameRecord? {
        games.computeIfPresent(gameId) { _, storedGame ->
            storedGame.copy(lastAccessedAt = accessedAt)
        }
        return games[gameId]
    }

    override fun entries(): List<GameRecord> = games.values.toList()

    override fun staleEntries(): List<StoredGameAccess> =
        games.values.map { storedGame ->
            StoredGameAccess(
                gameId = storedGame.id,
                lastAccessedAt = storedGame.lastAccessedAt
            )
        }

    override fun remove(gameId: String): Boolean = games.remove(gameId) != null

    fun clear() {
        games.clear()
    }
}

class ConcurrentGameUpdateException(gameId: String) :
    RuntimeException("Game $gameId was updated concurrently.")
