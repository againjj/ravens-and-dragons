package com.dragonsvsravens.game

import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

@Service
class GameSessionService(
    private val gameStore: GameStore
) {
    companion object {
        const val defaultGameId = "default"
    }

    private val emittersByGame = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()
    private val gameLocks = ConcurrentHashMap<String, Any>()

    init {
        ensureDefaultGameExists()
    }

    fun createGame(request: CreateGameRequest = CreateGameRequest()): GameSession {
        val selectedRuleConfigurationId = request.ruleConfigurationId ?: GameRules.freePlayRuleConfigurationId
        GameRules.getRuleConfigurationSummary(selectedRuleConfigurationId)
        val selectedStartingSide = request.startingSide ?: Side.dragons

        while (true) {
            val game = GameSessionFactory.createFreshStoredGame(
                gameId = UUID.randomUUID().toString(),
                snapshot = createIdleSnapshot(selectedRuleConfigurationId, selectedStartingSide),
                selectedRuleConfigurationId = selectedRuleConfigurationId,
                selectedStartingSide = selectedStartingSide
            )
            if (gameStore.putIfAbsent(game)) {
                return game.session
            }
        }
    }

    fun getGame(): GameSession = getGame(defaultGameId)

    fun getGame(gameId: String): GameSession = getStoredGame(gameId).session

    fun applyCommand(command: GameCommandRequest): GameSession = applyCommand(defaultGameId, command)

    fun applyCommand(gameId: String, command: GameCommandRequest): GameSession = synchronized(lockFor(gameId)) {
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

    fun createEmitter(): SseEmitter = createEmitter(defaultGameId)

    fun createEmitter(gameId: String): SseEmitter = createEmitter(gameId, SseEmitter(0L))

    internal fun createEmitter(gameId: String, emitter: SseEmitter): SseEmitter {
        val emitters = emittersFor(gameId)
        emitters.add(emitter)

        val removeEmitter = {
            emitters.remove(emitter)
            cleanupEmitters(gameId, emitters)
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

    private fun broadcast(gameId: String, session: GameSession) {
        val emitters = emittersByGame[gameId] ?: return
        emitters.forEach { emitter ->
            val delivered = sendSnapshot(emitter, session)
            if (!delivered) {
                emitters.remove(emitter)
            }
        }
        cleanupEmitters(gameId, emitters)
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

    private fun ensureDefaultGameExists() {
        if (gameStore.get(defaultGameId) != null) {
            return
        }
        gameStore.put(
            createInitialStoredGame(defaultGameId)
        )
    }

    private fun createInitialStoredGame(gameId: String): StoredGame =
        GameSessionFactory.createFreshStoredGame(
            gameId = gameId,
            snapshot = createIdleSnapshot(
                ruleConfigurationId = GameRules.freePlayRuleConfigurationId,
                selectedStartingSide = Side.dragons
            ),
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons
        )

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
        updatedAt = java.time.Instant.now(),
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide
    )

    private fun getStoredGame(gameId: String): StoredGame =
        gameStore.get(gameId) ?: throw GameNotFoundException(gameId)

    private fun lockFor(gameId: String): Any =
        gameLocks.computeIfAbsent(gameId) { Any() }

    private fun emittersFor(gameId: String): CopyOnWriteArrayList<SseEmitter> {
        getStoredGame(gameId)
        return emittersByGame.computeIfAbsent(gameId) { CopyOnWriteArrayList() }
    }

    private fun cleanupEmitters(gameId: String, emitters: CopyOnWriteArrayList<SseEmitter>) {
        if (emitters.isEmpty()) {
            emittersByGame.remove(gameId, emitters)
        }
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
