package com.dragonsvsravens.game

import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

@Service
class GameSessionService {
    private data class StoredGame(
        val session: GameSession,
        val undoSnapshots: List<GameSnapshot>
    )

    private val emitters = CopyOnWriteArrayList<SseEmitter>()

    @Volatile
    private var storedGame = createFreshStoredGame(
        snapshot = GameRules.createInitialSnapshot(),
        selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
        selectedStartingSide = Side.dragons
    )

    fun getGame(): GameSession = storedGame.session

    internal fun resetForTests(
        selectedRuleConfigurationId: String = GameRules.freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons
    ) {
        storedGame = createFreshStoredGame(
            snapshot = GameRules.createIdleSnapshot(selectedRuleConfigurationId, selectedStartingSide),
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide
        )
    }

    internal fun resetForTests(
        snapshot: GameSnapshot,
        selectedRuleConfigurationId: String = snapshot.ruleConfigurationId,
        selectedStartingSide: Side = Side.dragons
    ) {
        storedGame = createFreshStoredGame(
            snapshot = snapshot,
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide
        )
    }

    fun applyCommand(command: GameCommandRequest): GameSession = synchronized(this) {
        val current = storedGame
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

        storedGame = nextState
        broadcast(nextState.session)
        nextState.session
    }

    fun createEmitter(): SseEmitter {
        val emitter = SseEmitter(0L)
        emitters.add(emitter)

        val removeEmitter = {
            emitters.remove(emitter)
            Unit
        }
        emitter.onCompletion(removeEmitter)
        emitter.onTimeout(removeEmitter)
        emitter.onError { removeEmitter() }

        sendSnapshot(emitter, storedGame.session)
        return emitter
    }

    private fun createStoredGame(
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot>,
        version: Long,
        createdAt: Instant,
        updatedAt: Instant,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side
    ): StoredGame = StoredGame(
        session = GameSession(
            id = "default",
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            snapshot = snapshot,
            canUndo = undoSnapshots.isNotEmpty(),
            availableRuleConfigurations = GameRules.availableRuleConfigurations(),
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide
        ),
        undoSnapshots = undoSnapshots
    )

    private fun createFreshStoredGame(
        snapshot: GameSnapshot,
        selectedRuleConfigurationId: String,
        selectedStartingSide: Side
    ): StoredGame {
        val now = Instant.now()
        return createStoredGame(
            snapshot = snapshot,
            undoSnapshots = emptyList(),
            version = 0,
            createdAt = now,
            updatedAt = now,
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide
        )
    }

    private fun broadcast(session: GameSession) {
        emitters.forEach { emitter ->
            val delivered = sendSnapshot(emitter, session)
            if (!delivered) {
                emitters.remove(emitter)
            }
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

    private fun StoredGame.next(
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot> = this.undoSnapshots,
        selectedRuleConfigurationId: String = this.session.selectedRuleConfigurationId,
        selectedStartingSide: Side = this.session.selectedStartingSide
    ): StoredGame = createStoredGame(
        snapshot = snapshot,
        undoSnapshots = undoSnapshots,
        version = session.version + 1,
        createdAt = session.createdAt,
        updatedAt = Instant.now(),
        selectedRuleConfigurationId = selectedRuleConfigurationId,
        selectedStartingSide = selectedStartingSide
    )

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
