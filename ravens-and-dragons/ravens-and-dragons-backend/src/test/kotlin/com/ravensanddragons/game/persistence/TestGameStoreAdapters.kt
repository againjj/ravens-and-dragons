package com.ravensanddragons.game.persistence

import com.ravensanddragons.game.model.GameSession
import com.ravensanddragons.game.session.GameSessionFactory
import com.ravensanddragons.platform.game.runtime.GameRecord
import com.ravensanddragons.platform.game.runtime.GameStore
import com.ravensanddragons.platform.game.runtime.InMemoryGameStore as PlatformInMemoryGameStore
import java.time.Instant

typealias ConcurrentGameUpdateException = com.ravensanddragons.platform.game.runtime.ConcurrentGameUpdateException
typealias StoredGameAccess = com.ravensanddragons.platform.game.runtime.StoredGameAccess

interface TestGameStoreAdapter {
    fun get(gameId: String): StoredGame?
    fun put(game: StoredGame)
    fun putIfAbsent(game: StoredGame): Boolean
    fun touch(gameId: String, accessedAt: Instant = Instant.now()): StoredGame?
    fun entries(): List<StoredGame>
    fun staleEntries(): List<StoredGameAccess>
    fun remove(gameId: String): Boolean
    fun platformStore(): GameStore
}

open class InMemoryGameStore(
    private val gameJsonCodec: GameJsonCodec = defaultGameJsonCodec()
) : TestGameStoreAdapter {
    private val delegate = PlatformInMemoryGameStore()

    override fun get(gameId: String): StoredGame? =
        delegate.get(gameId)?.toStoredGame(gameJsonCodec)

    override fun put(game: StoredGame) {
        delegate.put(game.toGameRecord(gameJsonCodec))
    }

    override fun putIfAbsent(game: StoredGame): Boolean =
        delegate.putIfAbsent(game.toGameRecord(gameJsonCodec))

    override fun touch(gameId: String, accessedAt: Instant): StoredGame? =
        delegate.touch(gameId, accessedAt)?.toStoredGame(gameJsonCodec)

    override fun entries(): List<StoredGame> =
        delegate.entries().map { it.toStoredGame(gameJsonCodec) }

    override fun staleEntries(): List<StoredGameAccess> =
        delegate.staleEntries()

    override fun remove(gameId: String): Boolean =
        delegate.remove(gameId)

    fun clear() {
        delegate.clear()
    }

    override fun platformStore(): GameStore = delegate
}

class JdbcGameStore(
    private val delegate: com.ravensanddragons.platform.game.runtime.JdbcGameStore,
    private val gameJsonCodec: GameJsonCodec = defaultGameJsonCodec()
) : TestGameStoreAdapter {
    override fun get(gameId: String): StoredGame? =
        delegate.get(gameId)?.toStoredGame(gameJsonCodec)

    override fun put(game: StoredGame) {
        delegate.put(game.toGameRecord(gameJsonCodec))
    }

    override fun putIfAbsent(game: StoredGame): Boolean =
        delegate.putIfAbsent(game.toGameRecord(gameJsonCodec))

    override fun touch(gameId: String, accessedAt: Instant): StoredGame? =
        delegate.touch(gameId, accessedAt)?.toStoredGame(gameJsonCodec)

    override fun entries(): List<StoredGame> =
        delegate.entries().map { it.toStoredGame(gameJsonCodec) }

    override fun staleEntries(): List<StoredGameAccess> =
        delegate.staleEntries()

    override fun remove(gameId: String): Boolean =
        delegate.remove(gameId)

    fun clearUserReferences(userId: String): List<StoredGame> {
        val updatedGames = entries().mapNotNull { storedGame ->
            val session = storedGame.session
            if (session.dragonsPlayerUserId != userId && session.ravensPlayerUserId != userId && session.createdByUserId != userId) {
                null
            } else {
                storedGame.copy(
                    session = session.copy(
                        version = session.version + 1,
                        dragonsPlayerUserId = session.dragonsPlayerUserId.takeUnless { it == userId },
                        ravensPlayerUserId = session.ravensPlayerUserId.takeUnless { it == userId },
                        createdByUserId = session.createdByUserId.takeUnless { it == userId }
                    )
                )
            }
        }
        updatedGames.forEach(::put)
        return updatedGames
    }

    override fun platformStore(): GameStore = delegate
}

fun StoredGame.toGameRecord(gameJsonCodec: GameJsonCodec): GameRecord =
    GameRecord(
        id = session.id,
        gameSlug = session.gameSlug,
        version = session.version,
        createdAt = session.createdAt,
        updatedAt = session.updatedAt,
        lifecycle = session.lifecycle.name,
        publicState = gameJsonCodec.valueToTree(session),
        privateState = gameJsonCodec.valueToTree(undoEntries),
        createdByUserId = session.createdByUserId,
        lastAccessedAt = lastAccessedAt
    )

fun GameRecord.toStoredGame(gameJsonCodec: GameJsonCodec): StoredGame =
    gameJsonCodec.convert(publicState, GameSession::class.java).let { session ->
        val undoEntries = gameJsonCodec.readUndoEntries(gameJsonCodec.writeJson(privateState))
        GameSessionFactory.createStoredGame(
            gameId = session.id,
            gameSlug = session.gameSlug,
            snapshot = session.snapshot,
            undoEntries = undoEntries,
            version = session.version,
            createdAt = session.createdAt,
            updatedAt = session.updatedAt,
            lastAccessedAt = lastAccessedAt,
            lifecycle = session.lifecycle,
            selectedRuleConfigurationId = session.selectedRuleConfigurationId,
            selectedStartingSide = session.selectedStartingSide,
            selectedBoardSize = session.selectedBoardSize,
            dragonsPlayerUserId = session.dragonsPlayerUserId,
            ravensPlayerUserId = session.ravensPlayerUserId,
            dragonsBotId = session.dragonsBotId,
            ravensBotId = session.ravensBotId,
            createdByUserId = session.createdByUserId
        )
    }

fun defaultGameJsonCodec(): GameJsonCodec =
    GameJsonCodec(com.ravensanddragons.game.session.defaultObjectMapper())

fun GameStore.getRavensSession(gameId: String, gameJsonCodec: GameJsonCodec): GameSession? =
    get(gameId)?.let { gameJsonCodec.convert(it.publicState, GameSession::class.java) }
