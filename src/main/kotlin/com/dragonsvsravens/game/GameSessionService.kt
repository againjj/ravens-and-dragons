package com.dragonsvsravens.game

import com.dragonsvsravens.auth.ForbiddenActionException
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
    private val staleGameThreshold: Duration
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
        val nextState = current.claimSide(side, userId)
        gameStore.put(nextState)
        broadcast(gameId, nextState.session)
        nextState.session
    }

    fun applyCommand(gameId: String, command: GameCommandRequest): GameSession =
        applyCommand(gameId, command, null)

    fun applyCommand(gameId: String, command: GameCommandRequest, actingUserId: String?): GameSession = withGameLock(gameId) {
        val current = getStoredGame(gameId)
        actingUserId?.let { requireAuthorizedPlayer(current, it, command.type) }
        if (command.expectedVersion != current.session.version) {
            throw VersionConflictException(current.session)
        }

        val nextState = when (command.type) {
            "start-game" -> applyInPhase(current, command, Phase.none) {
                current.next(
                    lifecycle = GameLifecycle.active,
                    snapshot = GameRules.startGame(
                        current.session.selectedRuleConfigurationId,
                        current.session.selectedStartingSide,
                        current.session.selectedBoardSize
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

            "select-board-size" -> applyInPhase(current, command, Phase.none) {
                current.withSelectedBoardSize(requireBoardSize(command))
            }

            "cycle-setup" -> applyInPhase(current, command, Phase.setup) { snapshot ->
                current.next(snapshot = GameRules.cycleSetupPiece(snapshot, requireSquare(command, snapshot.boardSize)))
            }

            "end-setup" -> applyInPhase(current, command, Phase.setup) { snapshot ->
                current.next(snapshot = GameRules.endSetup(snapshot, current.session.selectedStartingSide))
            }

            "move-piece" -> applyInPhase(current, command, Phase.move) { snapshot ->
                current.nextWithUndo(
                    snapshot = GameRules.movePiece(
                        snapshot,
                        requireOrigin(command, snapshot.boardSize),
                        requireDestination(command, snapshot.boardSize)
                    )
                )
            }

            "capture-piece" -> applyInPhase(current, command, Phase.capture) { snapshot ->
                if (!GameRules.isManualCapture(snapshot)) {
                    throw InvalidCommandException("This rule configuration resolves captures automatically.")
                }
                current.next(snapshot = GameRules.capturePiece(snapshot, requireSquare(command, snapshot.boardSize)))
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
                    lifecycle = GameLifecycle.finished,
                    snapshot = GameRules.endGame(snapshot, "Game ended"),
                    undoSnapshots = current.undoSnapshots + snapshot
                )
            }
            else -> throw InvalidCommandException("Unknown command type: ${command.type}")
        }

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

    private fun StoredGame.next(
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot> = this.undoSnapshots,
        lifecycle: GameLifecycle = this.session.lifecycle,
        selectedRuleConfigurationId: String = this.session.selectedRuleConfigurationId,
        selectedStartingSide: Side = this.session.selectedStartingSide,
        selectedBoardSize: Int = this.session.selectedBoardSize,
        dragonsPlayerUserId: String? = this.session.dragonsPlayerUserId,
        ravensPlayerUserId: String? = this.session.ravensPlayerUserId,
        createdByUserId: String? = this.session.createdByUserId
    ): StoredGame = GameSessionFactory.createStoredGame(
        gameId = session.id,
        snapshot = snapshot,
        undoSnapshots = undoSnapshots,
        version = session.version + 1,
        createdAt = session.createdAt,
        updatedAt = Instant.now(clock),
        lifecycle = resolveLifecycle(snapshot, lifecycle),
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide,
        selectedBoardSize = selectedBoardSize,
        dragonsPlayerUserId = dragonsPlayerUserId,
        ravensPlayerUserId = ravensPlayerUserId,
        createdByUserId = createdByUserId
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

    private fun validateLifecycle(current: StoredGame) {
        if (current.session.lifecycle == GameLifecycle.finished) {
            throw InvalidCommandException("Game ${current.session.id} is finished. Create a new game to play again.")
        }
    }

    private fun requireAuthorizedPlayer(current: StoredGame, actingUserId: String, commandType: String) {
        val dragonsPlayerUserId = current.session.dragonsPlayerUserId
       val ravensPlayerUserId = current.session.ravensPlayerUserId
        val assignedSide =
            when {
                dragonsPlayerUserId == actingUserId && ravensPlayerUserId == actingUserId ->
                    if (commandType == "undo") {
                        current.session.undoOwnerSide ?: current.session.snapshot.activeSide
                    } else {
                        current.session.snapshot.activeSide
                    }
                dragonsPlayerUserId == actingUserId -> Side.dragons
                ravensPlayerUserId == actingUserId -> Side.ravens
                else -> null
            } ?: throw ForbiddenActionException("You must claim a side before submitting commands.")

        val phase = current.session.snapshot.phase
        if (commandType == "undo") {
            current.session.undoOwnerSide?.let { undoOwnerSide ->
                if (assignedSide != undoOwnerSide) {
                    throw ForbiddenActionException("Only the player who made the last move may undo.")
                }
            }
            return
        }
        if (phase == Phase.none) {
            return
        }
        if (assignedSide != current.session.snapshot.activeSide) {
            throw ForbiddenActionException("It is not your turn.")
        }
        if (commandType == "end-game") {
            return
        }
    }

    private fun applyInPhase(
        current: StoredGame,
        command: GameCommandRequest,
        expectedPhase: Phase,
        update: (GameSnapshot) -> StoredGame
    ): StoredGame {
        validateLifecycle(current)
        validatePhase(current.session.snapshot, expectedPhase, command.type)
        return update(current.session.snapshot)
    }

    private fun applyWhenGameActive(
        current: StoredGame,
        command: GameCommandRequest,
        update: (GameSnapshot) -> StoredGame
    ): StoredGame {
        validateLifecycle(current)
        val phase = current.session.snapshot.phase
        if (phase != Phase.move && phase != Phase.capture) {
            throw InvalidCommandException("Command ${command.type} is not allowed during $phase.")
        }

        return update(current.session.snapshot)
    }

    private fun requireSquare(command: GameCommandRequest, boardSize: Int): String =
        requireBoardSquare(command.square, "square", command.type, boardSize)

    private fun requireOrigin(command: GameCommandRequest, boardSize: Int): String =
        requireBoardSquare(command.origin, "origin", command.type, boardSize)

    private fun requireDestination(command: GameCommandRequest, boardSize: Int): String =
        requireBoardSquare(command.destination, "destination", command.type, boardSize)

    private fun requireRuleConfigurationId(command: GameCommandRequest): String {
        val ruleConfigurationId = command.ruleConfigurationId
            ?: throw InvalidCommandException("Command ${command.type} requires ruleConfigurationId.")
        GameRules.getRuleConfigurationSummary(ruleConfigurationId)
        return ruleConfigurationId
    }

    private fun requireSide(command: GameCommandRequest): Side =
        command.side ?: throw InvalidCommandException("Command ${command.type} requires side.")

    private fun requireBoardSize(command: GameCommandRequest): Int {
        val boardSize = command.boardSize ?: throw InvalidCommandException("Command ${command.type} requires boardSize.")
        GameRules.validateBoardSize(boardSize)
        return boardSize
    }

    private fun requireBoardSquare(square: String?, fieldName: String, commandType: String, boardSize: Int): String {
        val value = square ?: throw InvalidCommandException("Command $commandType requires $fieldName.")
        if (!BoardCoordinates.isValidSquare(value, boardSize)) {
            throw InvalidCommandException("Square $value is outside the ${boardSize}x${boardSize} board.")
        }
        return value
    }

    private fun resolveLifecycle(snapshot: GameSnapshot, fallback: GameLifecycle): GameLifecycle =
        if (snapshot.turns.lastOrNull()?.type == TurnType.gameOver) {
            GameLifecycle.finished
        } else {
            fallback
        }

    private fun StoredGame.nextWithUndo(snapshot: GameSnapshot): StoredGame =
        next(
            snapshot = snapshot,
            undoSnapshots = undoSnapshots + session.snapshot
        )

    private fun StoredGame.withSelectedRuleConfiguration(ruleConfigurationId: String): StoredGame =
        next(
            snapshot = GameRules.createIdleSnapshot(ruleConfigurationId, session.selectedStartingSide, session.selectedBoardSize),
            selectedRuleConfigurationId = ruleConfigurationId
        )

    private fun StoredGame.withSelectedStartingSide(side: Side): StoredGame =
        next(
            snapshot = GameRules.createIdleSnapshot(session.selectedRuleConfigurationId, side, session.selectedBoardSize),
            selectedStartingSide = side
        )

    private fun StoredGame.withSelectedBoardSize(boardSize: Int): StoredGame =
        next(
            snapshot = GameRules.createIdleSnapshot(session.selectedRuleConfigurationId, session.selectedStartingSide, boardSize),
            selectedBoardSize = boardSize
        )

    private fun StoredGame.undo(): StoredGame {
        val previousSnapshot = undoSnapshots.lastOrNull()
            ?: throw InvalidCommandException("No move is available to undo.")
        return next(
            snapshot = previousSnapshot,
            undoSnapshots = undoSnapshots.dropLast(1),
            lifecycle = if (previousSnapshot.turns.lastOrNull()?.type == TurnType.gameOver) {
                GameLifecycle.finished
            } else {
                GameLifecycle.active
            }
        )
    }

    private fun StoredGame.claimSide(side: Side, userId: String): StoredGame {
        val session = session
        val currentHolder = when (side) {
            Side.dragons -> session.dragonsPlayerUserId
            Side.ravens -> session.ravensPlayerUserId
        }
        if (currentHolder == userId) {
            return this
        }
        if (currentHolder != null) {
            throw ForbiddenActionException("${side.name.replaceFirstChar(Char::titlecase)} is already claimed.")
        }
        val oppositeHolder = when (side) {
            Side.dragons -> session.ravensPlayerUserId
            Side.ravens -> session.dragonsPlayerUserId
        }
        if (oppositeHolder == userId) {
            throw ForbiddenActionException("One user cannot claim both sides.")
        }
        return next(
            snapshot = session.snapshot,
            undoSnapshots = undoSnapshots,
            dragonsPlayerUserId = if (side == Side.dragons) userId else session.dragonsPlayerUserId,
            ravensPlayerUserId = if (side == Side.ravens) userId else session.ravensPlayerUserId
        )
    }
}
