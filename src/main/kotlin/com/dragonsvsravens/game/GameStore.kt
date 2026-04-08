package com.dragonsvsravens.game

import org.springframework.stereotype.Component
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

data class StoredGame(
    val session: GameSession,
    val undoSnapshots: List<GameSnapshot>,
    val lastAccessedAt: Instant
)

interface GameStore {
    fun get(gameId: String): StoredGame?

    fun put(game: StoredGame)

    fun putIfAbsent(game: StoredGame): Boolean

    fun touch(gameId: String, accessedAt: Instant = Instant.now()): StoredGame?

    fun entries(): List<StoredGame>

    fun remove(gameId: String): Boolean
}

@Component
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

    override fun remove(gameId: String): Boolean = games.remove(gameId) != null

    fun clear() {
        games.clear()
    }
}
