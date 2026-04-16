package com.dragonsvsravens.game

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
    @Value("\${dragons-vs-ravens.games.stale-threshold:1008h}")
    private val staleGameThreshold: Duration,
    private val gameCommandService: GameCommandService
) {
    companion object {
        val defaultStaleGameThreshold: Duration = Duration.ofDays(42)
    }

    private val emittersByGame = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()
    private val gameLocks = ConcurrentHashMap<String, Any>()

    fun createGame(request: CreateGameRequest = CreateGameRequest(), createdByUserId: String? = null): GameSession {
        val selectedRuleConfigurationId = request.ruleConfigurationId ?: GameRules.freePlayRuleConfigurationId
        GameRules.getRuleConfigurationSummary(selectedRuleConfigurationId)
        val selectedStartingSide = request.startingSide ?: Side.dragons
        val selectedBoardSize = request.boardSize ?: GameRules.defaultBoardSize
        GameRules.validateBoardSize(selectedBoardSize)

        while (true) {
            val game = GameSessionFactory.createFreshStoredGame(
                gameId = GameIdGenerator.nextId(),
                snapshot = createIdleSnapshot(selectedRuleConfigurationId, selectedStartingSide, selectedBoardSize),
                selectedRuleConfigurationId = selectedRuleConfigurationId,
                selectedStartingSide = selectedStartingSide,
                selectedBoardSize = selectedBoardSize,
                createdByUserId = createdByUserId,
                now = Instant.now(clock)
            )
            if (gameStore.putIfAbsent(game)) {
                return game.session
            }
        }
    }

    fun getGame(gameId: String): GameSession = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        touchGame(gameId)
        current.session
    }

    fun claimSide(gameId: String, side: Side, userId: String): GameSession = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        val nextState = gameCommandService.claimSide(current, side, userId)
        gameStore.put(nextState)
        broadcast(gameId, nextState.session)
        nextState.session
    }

    fun applyCommand(gameId: String, command: GameCommandRequest): GameSession =
        applyCommand(gameId, command, null)

    fun applyCommand(gameId: String, command: GameCommandRequest, actingUserId: String?): GameSession = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        val nextState = gameCommandService.applyCommand(current, command, actingUserId)

        try {
            gameStore.put(nextState)
        } catch (_: ConcurrentGameUpdateException) {
            val latest = gameStore.get(gameId) ?: throw GameNotFoundException(gameId)
            throw VersionConflictException(latest.session)
        }
        broadcast(gameId, nextState.session)
        nextState.session
    }

    fun clearUserReferences(userId: String) {
        gameStore.clearUserReferences(userId).forEach { updatedGame ->
            broadcast(updatedGame.session.id, updatedGame.session)
        }
    }

    fun createEmitter(gameId: String): SseEmitter = createEmitter(gameId, SseEmitter(0L))

    internal fun createEmitter(gameId: String, emitter: SseEmitter): SseEmitter {
        val emitters = registerEmitter(gameId, emitter)

        val removeEmitter = {
            unregisterEmitter(gameId, emitters, emitter)
            Unit
        }
        emitter.onCompletion(removeEmitter)
        emitter.onTimeout(removeEmitter)
        emitter.onError { removeEmitter() }

        val delivered = sendSnapshot(emitter, getStoredGame(gameId).session)
        if (!delivered) {
            removeEmitter()
        }
        return emitter
    }

    fun removeStaleGames(now: Instant = Instant.now(clock)) {
        val staleBefore = now.minus(staleGameThreshold)

        gameStore.entries().forEach { storedGame ->
            val gameId = storedGame.session.id
            val lock = lockFor(gameId)
            synchronized(lock) {
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

    private fun broadcast(gameId: String, session: GameSession) {
        emittersByGame[gameId]?.let { emitters ->
            pruneUndeliveredEmitters(gameId, emitters, session)
        }
    }

    private fun sendSnapshot(emitter: SseEmitter, session: GameSession): Boolean {
        try {
            emitter.send(
                SseEmitter.event()
                    .name("game")
                    .data(session)
            )
            return true
        } catch (_: Exception) {
            return false
        }
    }

    private fun createIdleSnapshot(
        ruleConfigurationId: String,
        selectedStartingSide: Side,
        selectedBoardSize: Int
    ): GameSnapshot =
        GameRules.createIdleSnapshot(ruleConfigurationId, selectedStartingSide, selectedBoardSize)

    private fun touchGame(gameId: String, accessedAt: Instant = Instant.now(clock)) {
        gameStore.touch(gameId, accessedAt) ?: throw GameNotFoundException(gameId)
    }

    private fun getStoredGame(gameId: String): StoredGame =
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

    private fun pruneUndeliveredEmitters(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>, session: GameSession) {
        emitters.forEach { emitter ->
            if (!sendSnapshot(emitter, session)) {
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
