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
    private var storedGame = createStoredGame(
        snapshot = GameRules.createInitialSnapshot(),
        undoSnapshots = emptyList(),
        version = 0,
        createdAt = Instant.now(),
        updatedAt = Instant.now()
    )

    fun getGame(): GameSession = storedGame.session

    fun applyCommand(command: GameCommandRequest): GameSession = synchronized(this) {
        val current = storedGame
        if (command.expectedVersion != current.session.version) {
            throw VersionConflictException(current.session)
        }

        val nextState = when (command.type) {
            "start-game" -> applyInPhase(current, command, Phase.none) {
                current.next(
                    snapshot = GameRules.startGame(),
                    undoSnapshots = emptyList()
                )
            }

            "cycle-setup" -> applyInPhase(current, command, Phase.setup) { snapshot ->
                current.next(snapshot = GameRules.cycleSetupPiece(snapshot, requireSquare(command)))
            }

            "end-setup" -> applyInPhase(current, command, Phase.setup) { snapshot ->
                current.next(snapshot = GameRules.endSetup(snapshot))
            }

            "move-piece" -> applyInPhase(current, command, Phase.move) { snapshot ->
                current.nextWithUndo(
                    snapshot = GameRules.movePiece(snapshot, requireOrigin(command), requireDestination(command))
                )
            }

            "capture-piece" -> applyInPhase(current, command, Phase.capture) { snapshot ->
                current.next(snapshot = GameRules.capturePiece(snapshot, requireSquare(command)))
            }

            "skip-capture" -> applyInPhase(current, command, Phase.capture) { snapshot ->
                current.next(snapshot = GameRules.commitTurn(snapshot))
            }

            "undo" -> current.undo()

            "end-game" -> applyWhenGameActive(current, command) { snapshot ->
                current.next(
                    snapshot = GameRules.endGame(snapshot),
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
        updatedAt: Instant
    ): StoredGame = StoredGame(
        session = GameSession(
            id = "default",
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            snapshot = snapshot,
            canUndo = undoSnapshots.isNotEmpty()
        ),
        undoSnapshots = undoSnapshots
    )

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
        command.square ?: throw InvalidCommandException("Command ${command.type} requires square.")

    private fun requireOrigin(command: GameCommandRequest): String =
        command.origin ?: throw InvalidCommandException("Command ${command.type} requires origin.")

    private fun requireDestination(command: GameCommandRequest): String =
        command.destination ?: throw InvalidCommandException("Command ${command.type} requires destination.")

    private fun StoredGame.next(
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot> = this.undoSnapshots
    ): StoredGame = createStoredGame(
        snapshot = snapshot,
        undoSnapshots = undoSnapshots,
        version = session.version + 1,
        createdAt = session.createdAt,
        updatedAt = Instant.now()
    )

    private fun StoredGame.nextWithUndo(snapshot: GameSnapshot): StoredGame =
        next(
            snapshot = snapshot,
            undoSnapshots = undoSnapshots + session.snapshot
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
