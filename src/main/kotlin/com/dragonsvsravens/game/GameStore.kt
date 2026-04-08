package com.dragonsvsravens.game

import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

data class StoredGame(
    val session: GameSession,
    val undoSnapshots: List<GameSnapshot>
)

interface GameStore {
    fun get(gameId: String): StoredGame?

    fun put(game: StoredGame)

    fun putIfAbsent(game: StoredGame): Boolean
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

    fun clear() {
        games.clear()
    }
}
