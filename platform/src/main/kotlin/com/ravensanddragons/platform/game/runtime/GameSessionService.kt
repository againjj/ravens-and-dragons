package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

@Service
class GameSessionService(
    private val gameStore: GameStore,
    private val clock: Clock,
    @Value("\${platform.games.stale-threshold:\${ravens-and-dragons.games.stale-threshold:1008h}}")
    private val staleGameThreshold: Duration,
    gameHandlers: List<GameHandler>
) {
    companion object {
        val defaultStaleGameThreshold: Duration = Duration.ofDays(42)
        private const val finishedLifecycle = "finished"
    }

    private val emittersByGame = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()
    private val gameLocks = ConcurrentHashMap<String, Any>()
    private val gameHandlersBySlug: Map<String, GameHandler> = gameHandlers.associateBy { it.gameSlug }

    fun createGame(gameSlug: String, request: JsonNode, createdByUserId: String? = null): JsonNode {
        val handler = requireHandler(gameSlug)
        val publiclyListed = request.get("publiclyListed")?.asBoolean(true) ?: true
        val gameRequest = request.withoutPlatformFields()
        while (true) {
            val game = handler.createGame(GameIdGenerator.nextId(), gameRequest, createdByUserId).copy(
                publiclyListed = publiclyListed
            )
            if (gameStore.putIfAbsent(game)) {
                return game.publicState
            }
        }
    }

    fun getGame(gameId: String): JsonNode = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        touchGame(gameId)
        current.publicState
    }

    fun getGameView(gameId: String, currentUserId: String?): JsonNode = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        touchGame(gameId)
        requireHandler(current.gameSlug).gameView(current, currentUserId)
    }

    fun listPublicGames(): List<PublicGameListing> =
        gameStore.entries()
            .asSequence()
            .filter { it.publiclyListed && it.lifecycle != finishedLifecycle }
            .mapNotNull { game ->
                val handler = gameHandlersBySlug[game.gameSlug] ?: return@mapNotNull null
                val details = handler.publicGameDetails(game)
                PublicGameListing(
                    gameId = game.id,
                    gameSlug = game.gameSlug,
                    gameName = details.gameName,
                    openSeats = details.openSeats
                )
            }
            .sortedWith(compareBy<PublicGameListing> { it.gameName }.thenBy { it.gameId })
            .toList()

    fun applyCommand(gameId: String, command: JsonNode, actingUserId: String?): JsonNode = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        val handler = requireHandler(current.gameSlug)
        val nextState = handler.applyCommand(current, command, actingUserId)
        val persisted = persistAndBroadcast(gameId, nextState)
        handler.afterCommandPersisted(persisted) { game -> persistAndBroadcast(gameId, game) }.publicState
    }

    fun clearUserReferences(userId: String) {
        gameStore.entries().forEach { game ->
            val handler = gameHandlersBySlug[game.gameSlug] ?: return@forEach
            val updated = handler.clearUserReferences(game, userId) ?: return@forEach
            val persisted = try {
                persistAndBroadcast(game.id, updated)
            } catch (_: ConcurrentGameUpdateException) {
                null
            }
            persisted?.let { broadcast(it.id, it.publicState) }
        }
    }

    fun createEmitter(gameId: String): SseEmitter = createEmitter(gameId, SseEmitter(0L))

    fun createEmitter(gameId: String, emitter: SseEmitter): SseEmitter {
        val emitters = registerEmitter(gameId, emitter)

        val removeEmitter = {
            unregisterEmitter(gameId, emitters, emitter)
            Unit
        }
        emitter.onCompletion(removeEmitter)
        emitter.onTimeout(removeEmitter)
        emitter.onError { removeEmitter() }

        val delivered = sendSnapshot(emitter, getStoredGame(gameId).publicState)
        if (!delivered) {
            removeEmitter()
        }
        return emitter
    }

    fun removeStaleGames(now: Instant = Instant.now(clock)) {
        val staleBefore = now.minus(staleGameThreshold)

        gameStore.staleEntries().forEach { storedGame ->
            val gameId = storedGame.gameId
            val lock = lockFor(gameId)
            synchronized(lock) {
                if (!storedGame.lastAccessedAt.isBefore(staleBefore)) {
                    return@synchronized
                }
                val current = gameStore.get(gameId) ?: return@synchronized
                if (!current.lastAccessedAt.isBefore(staleBefore)) {
                    return@synchronized
                }
                if (hasActiveEmitters(gameId)) {
                    return@synchronized
                }
                gameStore.remove(gameId)
                emittersByGame.remove(gameId)
                gameLocks.remove(gameId, lock)
            }
        }
    }

    private fun broadcast(gameId: String, publicState: JsonNode) {
        emittersByGame[gameId]?.let { emitters ->
            pruneUndeliveredEmitters(gameId, emitters, publicState)
        }
    }

    private fun persistAndBroadcast(gameId: String, game: GameRecord): GameRecord {
        try {
            gameStore.put(game)
        } catch (_: ConcurrentGameUpdateException) {
            val latest = gameStore.get(gameId) ?: throw GameNotFoundException(gameId)
            throw VersionConflictException(latest.publicState)
        }
        broadcast(gameId, game.publicState)
        return game
    }

    private fun sendSnapshot(emitter: SseEmitter, publicState: JsonNode): Boolean {
        try {
            emitter.send(
                SseEmitter.event()
                    .name("game")
                    .data(publicState)
            )
            return true
        } catch (_: Exception) {
            return false
        }
    }

    private fun requireHandler(gameSlug: String): GameHandler =
        gameHandlersBySlug[gameSlug] ?: throw IllegalArgumentException("Game module '$gameSlug' is not registered.")

    private fun JsonNode.withoutPlatformFields(): JsonNode =
        if (this is ObjectNode) {
            deepCopy<ObjectNode>().also { it.remove("publiclyListed") }
        } else {
            this
        }

    private fun touchGame(gameId: String, accessedAt: Instant = Instant.now(clock)) {
        gameStore.touch(gameId, accessedAt) ?: throw GameNotFoundException(gameId)
    }

    private fun getStoredGame(gameId: String): GameRecord =
        gameStore.get(gameId) ?: throw GameNotFoundException(gameId)

    private fun lockFor(gameId: String): Any =
        gameLocks.computeIfAbsent(gameId) { Any() }

    private fun <T> withGameLock(gameId: String, action: () -> T): T = synchronized(lockFor(gameId)) {
        action()
    }

    private fun registerEmitter(gameId: String, emitter: SseEmitter): CopyOnWriteArrayList<SseEmitter> =
        withGameLock(gameId) {
            getStoredGame(gameId)
            touchGame(gameId)
            emittersByGame.computeIfAbsent(gameId) { CopyOnWriteArrayList() }.also { it.add(emitter) }
        }

    private fun unregisterEmitter(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>, emitter: SseEmitter) {
        emitters.remove(emitter)
        withGameLock(gameId) {
            if (cleanupEmitters(gameId, emitters)) {
                touchGame(gameId)
            }
        }
    }

    private fun hasActiveEmitters(gameId: String): Boolean =
        emittersByGame[gameId]?.isNotEmpty() == true

    private fun pruneUndeliveredEmitters(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>, publicState: JsonNode) {
        emitters.forEach { emitter ->
            if (!sendSnapshot(emitter, publicState)) {
                emitters.remove(emitter)
            }
        }
        cleanupEmitters(gameId, emitters)
    }

    private fun cleanupEmitters(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>): Boolean {
        if (emitters.isEmpty()) {
            emittersByGame.remove(gameId, emitters)
            return true
        }
        return false
    }

}
