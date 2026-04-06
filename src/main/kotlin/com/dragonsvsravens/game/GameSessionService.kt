package com.dragonsvsravens.game

import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

@Service
class GameSessionService {
    private val emitters = CopyOnWriteArrayList<SseEmitter>()

    @Volatile
    private var gameSession = createSession(
        snapshot = GameRules.createInitialSnapshot(),
        version = 0,
        createdAt = Instant.now(),
        updatedAt = Instant.now()
    )

    fun getGame(): GameSession = gameSession

    fun applyCommand(command: GameCommandRequest): GameSession = synchronized(this) {
        val current = gameSession
        if (command.expectedVersion != current.version) {
            throw VersionConflictException(current)
        }

        val nextSnapshot = when (command.type) {
            "cycle-setup" -> {
                validatePhase(current.snapshot, Phase.setup, command.type)
                GameRules.cycleSetupPiece(current.snapshot, requireSquare(command))
            }

            "begin-game" -> {
                validatePhase(current.snapshot, Phase.setup, command.type)
                GameRules.beginGame(current.snapshot)
            }

            "move-piece" -> {
                validatePhase(current.snapshot, Phase.move, command.type)
                GameRules.movePiece(current.snapshot, requireOrigin(command), requireDestination(command))
            }

            "capture-piece" -> {
                validatePhase(current.snapshot, Phase.capture, command.type)
                GameRules.capturePiece(current.snapshot, requireSquare(command))
            }

            "skip-capture" -> {
                validatePhase(current.snapshot, Phase.capture, command.type)
                GameRules.commitTurn(current.snapshot)
            }

            "reset-game" -> GameRules.resetGame()
            else -> throw InvalidCommandException("Unknown command type: ${command.type}")
        }

        val updated = createSession(
            snapshot = nextSnapshot,
            version = current.version + 1,
            createdAt = current.createdAt,
            updatedAt = Instant.now()
        )

        gameSession = updated
        broadcast(updated)
        updated
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

        sendSnapshot(emitter, gameSession)
        return emitter
    }

    private fun createSession(
        snapshot: GameSnapshot,
        version: Long,
        createdAt: Instant,
        updatedAt: Instant
    ): GameSession = GameSession(
        id = "default",
        version = version,
        createdAt = createdAt,
        updatedAt = updatedAt,
        snapshot = snapshot
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

    private fun requireSquare(command: GameCommandRequest): String =
        command.square ?: throw InvalidCommandException("Command ${command.type} requires square.")

    private fun requireOrigin(command: GameCommandRequest): String =
        command.origin ?: throw InvalidCommandException("Command ${command.type} requires origin.")

    private fun requireDestination(command: GameCommandRequest): String =
        command.destination ?: throw InvalidCommandException("Command ${command.type} requires destination.")
}
