package com.dragonsvsravens.game

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
    private val clock: Clock
) {
    companion object {
        val staleGameThreshold: Duration = Duration.ofHours(1)
    }

    private val emittersByGame = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()
    private val gameLocks = ConcurrentHashMap<String, Any>()

    fun createGame(request: CreateGameRequest = CreateGameRequest()): GameSession {
        val selectedRuleConfigurationId = request.ruleConfigurationId ?: GameRules.freePlayRuleConfigurationId
        GameRules.getRuleConfigurationSummary(selectedRuleConfigurationId)
        val selectedStartingSide = request.startingSide ?: Side.dragons

        while (true) {
            val game = GameSessionFactory.createFreshStoredGame(
                gameId = GameIdGenerator.nextId(),
                snapshot = createIdleSnapshot(selectedRuleConfigurationId, selectedStartingSide),
                selectedRuleConfigurationId = selectedRuleConfigurationId,
                selectedStartingSide = selectedStartingSide,
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

    fun applyCommand(gameId: String, command: GameCommandRequest): GameSession = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        if (command.expectedVersion != current.session.version) {
            throw VersionConflictException(current.session)
        }

        val nextState = when (command.type) {
            "start-game" -> applyInPhase(current, command, Phase.none) {
                current.next(
                    snapshot = GameRules.startGame(
                        current.session.selectedRuleConfigurationId,
                        current.session.selectedStartingSide
                    ),
                    undoSnapshots = emptyList()
                )
            }

            "select-rule-configuration" -> applyInPhase(current, command, Phase.none) {
                current.withSelectedRuleConfiguration(requireRuleConfigurationId(command))
            }

            "select-starting-side" -> applyInPhase(current, command, Phase.none) {
                current.withSelectedStartingSide(requireSide(command))
            }

            "cycle-setup" -> applyInPhase(current, command, Phase.setup) { snapshot ->
                current.next(snapshot = GameRules.cycleSetupPiece(snapshot, requireSquare(command)))
            }

            "end-setup" -> applyInPhase(current, command, Phase.setup) { snapshot ->
                current.next(snapshot = GameRules.endSetup(snapshot, current.session.selectedStartingSide))
            }

            "move-piece" -> applyInPhase(current, command, Phase.move) { snapshot ->
                current.nextWithUndo(
                    snapshot = GameRules.movePiece(snapshot, requireOrigin(command), requireDestination(command))
                )
            }

            "capture-piece" -> applyInPhase(current, command, Phase.capture) { snapshot ->
                if (!GameRules.isManualCapture(snapshot)) {
                    throw InvalidCommandException("This rule configuration resolves captures automatically.")
                }
                current.next(snapshot = GameRules.capturePiece(snapshot, requireSquare(command)))
            }

            "skip-capture" -> applyInPhase(current, command, Phase.capture) { snapshot ->
                if (!GameRules.isManualCapture(snapshot)) {
                    throw InvalidCommandException("This rule configuration resolves captures automatically.")
                }
                current.next(snapshot = GameRules.commitTurn(snapshot))
            }

            "undo" -> current.undo()

            "end-game" -> applyWhenGameActive(current, command) { snapshot ->
                if (!GameRules.hasManualEndGame(snapshot)) {
                    throw InvalidCommandException("This rule configuration ends automatically.")
                }
                current.next(
                    snapshot = GameRules.endGame(snapshot, "Game ended"),
                    undoSnapshots = emptyList()
                )
            }
            else -> throw InvalidCommandException("Unknown command type: ${command.type}")
        }

        gameStore.put(nextState)
        broadcast(gameId, nextState.session)
        nextState.session
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

    private fun createIdleSnapshot(ruleConfigurationId: String, selectedStartingSide: Side): GameSnapshot =
        GameRules.createIdleSnapshot(ruleConfigurationId, selectedStartingSide)

    private fun StoredGame.next(
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot> = this.undoSnapshots,
        selectedRuleConfigurationId: String = this.session.selectedRuleConfigurationId,
        selectedStartingSide: Side = this.session.selectedStartingSide
    ): StoredGame = GameSessionFactory.createStoredGame(
        gameId = session.id,
        snapshot = snapshot,
        undoSnapshots = undoSnapshots,
        version = session.version + 1,
        createdAt = session.createdAt,
        updatedAt = Instant.now(clock),
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide
    )

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

    private fun validatePhase(snapshot: GameSnapshot, expected: Phase, commandType: String) {
        if (snapshot.phase != expected) {
            throw InvalidCommandException("Command $commandType is not allowed during ${snapshot.phase}.")
        }
    }

    private fun applyInPhase(
        current: StoredGame,
        command: GameCommandRequest,
        expectedPhase: Phase,
        update: (GameSnapshot) -> StoredGame
    ): StoredGame {
        validatePhase(current.session.snapshot, expectedPhase, command.type)
        return update(current.session.snapshot)
    }

    private fun applyWhenGameActive(
        current: StoredGame,
        command: GameCommandRequest,
        update: (GameSnapshot) -> StoredGame
    ): StoredGame {
        val phase = current.session.snapshot.phase
        if (phase != Phase.move && phase != Phase.capture) {
            throw InvalidCommandException("Command ${command.type} is not allowed during $phase.")
        }

        return update(current.session.snapshot)
    }

    private fun requireSquare(command: GameCommandRequest): String =
        requireBoardSquare(command.square, "square", command.type)

    private fun requireOrigin(command: GameCommandRequest): String =
        requireBoardSquare(command.origin, "origin", command.type)

    private fun requireDestination(command: GameCommandRequest): String =
        requireBoardSquare(command.destination, "destination", command.type)

    private fun requireRuleConfigurationId(command: GameCommandRequest): String {
        val ruleConfigurationId = command.ruleConfigurationId
            ?: throw InvalidCommandException("Command ${command.type} requires ruleConfigurationId.")
        GameRules.getRuleConfigurationSummary(ruleConfigurationId)
        return ruleConfigurationId
    }

    private fun requireSide(command: GameCommandRequest): Side =
        command.side ?: throw InvalidCommandException("Command ${command.type} requires side.")

    private fun requireBoardSquare(square: String?, fieldName: String, commandType: String): String {
        val value = square ?: throw InvalidCommandException("Command $commandType requires $fieldName.")
        if (!BoardCoordinates.isValidSquare(value)) {
            throw InvalidCommandException("Square $value is outside the 7x7 board.")
        }
        return value
    }

    private fun StoredGame.nextWithUndo(snapshot: GameSnapshot): StoredGame =
        next(
            snapshot = snapshot,
            undoSnapshots = undoSnapshots + session.snapshot
        )

    private fun StoredGame.withSelectedRuleConfiguration(ruleConfigurationId: String): StoredGame =
        next(
            snapshot = GameRules.createIdleSnapshot(ruleConfigurationId, session.selectedStartingSide),
            selectedRuleConfigurationId = ruleConfigurationId
        )

    private fun StoredGame.withSelectedStartingSide(side: Side): StoredGame =
        next(
            snapshot = GameRules.createIdleSnapshot(session.selectedRuleConfigurationId, side),
            selectedStartingSide = side
        )

    private fun StoredGame.undo(): StoredGame {
        val previousSnapshot = undoSnapshots.lastOrNull()
            ?: throw InvalidCommandException("No move is available to undo.")
        return next(
            snapshot = previousSnapshot,
            undoSnapshots = undoSnapshots.dropLast(1)
        )
    }
}
