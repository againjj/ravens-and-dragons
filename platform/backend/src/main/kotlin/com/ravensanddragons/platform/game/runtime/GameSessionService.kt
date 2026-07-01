package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executor

@Service
class GameSessionService(
    private val gameStore: GameStore,
    private val clock: Clock,
    @Value("\${platform.games.stale-threshold:\${ravens-and-dragons.games.stale-threshold:1008h}}")
    private val staleGameThreshold: Duration,
    gameHandlers: List<GameHandler>,
    private val playerAccountValidator: PlayerAccountValidator,
    @Qualifier("commandFollowUpExecutor")
    private val commandFollowUpExecutor: Executor
) {
    companion object {
        private val logger = LoggerFactory.getLogger(GameSessionService::class.java)
        val defaultStaleGameThreshold: Duration = Duration.ofDays(42)
        private const val finishedLifecycle = "finished"
    }

    private val emittersByGame = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()
    private val emittersByUser = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()
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
        publicStateForClient(current)
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
            .sortedByGameListOrder({ it.gameName }, { it.gameId })
            .toList()

    fun listPlayerGames(currentUserId: String): List<PlayerGameListing> =
        gameStore.entries()
            .asSequence()
            .filter { it.lifecycle != finishedLifecycle }
            .mapNotNull { game ->
                val handler = gameHandlersBySlug[game.gameSlug] ?: return@mapNotNull null
                val details = handler.playerGameDetails(game, currentUserId) ?: return@mapNotNull null
                PlayerGameListing(
                    gameId = game.id,
                    gameSlug = game.gameSlug,
                    gameName = details.gameName,
                    isCurrentUserTurn = details.isCurrentUserTurn
                )
            }
            .sortedByGameListOrder({ it.gameName }, { it.gameId })
            .toList()

    @Transactional
    fun applyCommand(gameId: String, command: JsonNode, actingUserId: String?): JsonNode = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        val handler = requireHandler(current.gameSlug)
        val commandResult = handler.applyCommandResult(current, command, actingUserId)
        val persistableState = handler.persistedStateAfterCommand(commandResult.state)
        playerAccountValidator.requirePlayerAccountsExist(newPlayerUserIds(handler, current, persistableState))
        val commandPublicState = handler.commandPublicState(commandResult.state, persistableState)
        val commandResponseState = handler.commandResponse(commandResult, persistableState, actingUserId)
        val persisted = persistAndBroadcast(gameId, persistableState, commandPublicState)
        afterCommit {
            broadcastPlayerGamesFor(current, persisted)
            commandFollowUpExecutor.execute {
                runCommandFollowUp(gameId)
            }
        }
        commandResponseState
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
            persisted?.let { afterCommit { broadcastPlayerGamesFor(game, it) } }
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

        val delivered = sendSnapshot(emitter, publicStateForClient(getStoredGame(gameId)))
        if (!delivered) {
            removeEmitter()
            completeEmitter(emitter)
        }
        return emitter
    }

    fun createPlayerGamesEmitter(currentUserId: String): SseEmitter =
        createPlayerGamesEmitter(currentUserId, SseEmitter(0L))

    fun createPlayerGamesEmitter(currentUserId: String, emitter: SseEmitter): SseEmitter {
        val emitters = emittersByUser.computeIfAbsent(currentUserId) { CopyOnWriteArrayList() }.also { it.add(emitter) }
        val removeEmitter = {
            unregisterPlayerGamesEmitter(currentUserId, emitters, emitter)
            Unit
        }
        emitter.onCompletion(removeEmitter)
        emitter.onTimeout(removeEmitter)
        emitter.onError { removeEmitter() }

        val delivered = sendPlayerGames(currentUserId, emitter)
        if (!delivered) {
            removeEmitter()
            completeEmitter(emitter)
        }
        return emitter
    }

    fun removeStaleGames() {
        removeStaleGames(Instant.now(clock))
    }

    fun removeStaleGames(now: Instant) {
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

    private fun broadcastPlayerGamesFor(before: GameRecord, after: GameRecord) {
        val users = playerUserIds(before) + playerUserIds(after)
        users.forEach(::broadcastPlayerGames)
    }

    private fun broadcastPlayerGames(currentUserId: String) {
        emittersByUser[currentUserId]?.let { emitters ->
            pruneUndeliveredPlayerGamesEmitters(currentUserId, emitters)
        }
    }

    private fun persistAndBroadcast(gameId: String, game: GameRecord, broadcastPublicState: JsonNode = game.publicState): GameRecord {
        putWithVersionCheck(gameId, game)
        afterCommit { broadcast(gameId, broadcastPublicState) }
        return game
    }

    private fun runCommandFollowUp(gameId: String) {
        try {
            val current = withGameLock(gameId) {
                gameStore.get(gameId) ?: throw GameNotFoundException(gameId)
            }
            val handler = requireHandler(current.gameSlug)
            val finalState = handler.afterCommandCommitted(current) { game ->
                withGameLock(gameId) {
                    persistAndBroadcastCommitted(gameId, game)
                }
            }
            if (finalState != current) {
                withGameLock(gameId) {
                    val latest = gameStore.get(gameId)
                    if (latest?.version == finalState.version) {
                        broadcastPlayerGamesFor(current, finalState)
                    }
                }
            }
        } catch (_: GameNotFoundException) {
            // The game may have been cleaned up before an async follow-up ran.
        } catch (_: VersionConflictException) {
            // A later command, such as undo, superseded this queued follow-up.
        } catch (exception: RuntimeException) {
            logger.warn("Post-command follow-up failed for game {}", gameId, exception)
        }
    }

    private fun persistAndBroadcastCommitted(
        gameId: String,
        game: GameRecord,
        broadcastPublicState: JsonNode = game.publicState
    ): GameRecord {
        putWithVersionCheck(gameId, game)
        broadcast(gameId, broadcastPublicState)
        return game
    }

    private fun putWithVersionCheck(gameId: String, game: GameRecord) {
        val latest = gameStore.get(gameId) ?: throw GameNotFoundException(gameId)
        if (latest.version != game.version - 1) {
            throw VersionConflictException(latest.publicState)
        }
        try {
            gameStore.put(game)
        } catch (_: ConcurrentGameUpdateException) {
            val updated = gameStore.get(gameId) ?: throw GameNotFoundException(gameId)
            throw VersionConflictException(updated.publicState)
        }
    }

    private fun afterCommit(action: () -> Unit) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    action()
                }
            })
        } else {
            action()
        }
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

    private fun sendPlayerGames(currentUserId: String, emitter: SseEmitter): Boolean {
        try {
            emitter.send(
                SseEmitter.event()
                    .name("player-games")
                    .data(listPlayerGames(currentUserId))
            )
            return true
        } catch (_: Exception) {
            return false
        }
    }

    private fun playerUserIds(game: GameRecord): Set<String> =
        gameHandlersBySlug[game.gameSlug]?.playerUserIds(game).orEmpty()

    private fun newPlayerUserIds(handler: GameHandler, before: GameRecord, after: GameRecord): Set<String> =
        handler.playerUserIds(after) - handler.playerUserIds(before)

    private fun requireHandler(gameSlug: String): GameHandler =
        gameHandlersBySlug[gameSlug] ?: throw IllegalArgumentException("Game module '$gameSlug' is not registered.")

    private fun publicStateForClient(game: GameRecord): JsonNode =
        requireHandler(game.gameSlug).publicState(game)

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

    private fun unregisterPlayerGamesEmitter(
        currentUserId: String,
        emitters: CopyOnWriteArrayList<SseEmitter>,
        emitter: SseEmitter
    ) {
        emitters.remove(emitter)
        if (emitters.isEmpty()) {
            emittersByUser.remove(currentUserId, emitters)
        }
    }

    private fun hasActiveEmitters(gameId: String): Boolean =
        emittersByGame[gameId]?.isNotEmpty() == true

    private fun pruneUndeliveredEmitters(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>, publicState: JsonNode) {
        emitters.forEach { emitter ->
            if (!sendSnapshot(emitter, publicState)) {
                emitters.remove(emitter)
                completeEmitter(emitter)
            }
        }
        cleanupEmitters(gameId, emitters)
    }

    private fun pruneUndeliveredPlayerGamesEmitters(currentUserId: String, emitters: CopyOnWriteArrayList<SseEmitter>) {
        emitters.forEach { emitter ->
            if (!sendPlayerGames(currentUserId, emitter)) {
                emitters.remove(emitter)
                completeEmitter(emitter)
            }
        }
        if (emitters.isEmpty()) {
            emittersByUser.remove(currentUserId, emitters)
        }
    }

    private fun cleanupEmitters(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>): Boolean {
        if (emitters.isEmpty()) {
            emittersByGame.remove(gameId, emitters)
            return true
        }
        return false
    }

    private fun completeEmitter(emitter: SseEmitter) {
        try {
            emitter.complete()
        } catch (_: Exception) {
            // The client may already have disconnected; completing is best-effort cleanup.
        }
    }

}
