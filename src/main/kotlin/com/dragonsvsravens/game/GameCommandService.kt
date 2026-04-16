package com.dragonsvsravens.game

import com.dragonsvsravens.auth.ForbiddenActionException
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant

@Service
class GameCommandService(
    private val clock: Clock
) {
    fun claimSide(current: StoredGame, side: Side, userId: String): StoredGame {
        val session = current.session
        val currentHolder = when (side) {
            Side.dragons -> session.dragonsPlayerUserId
            Side.ravens -> session.ravensPlayerUserId
        }
        if (currentHolder == userId) {
            return current
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
        return current.next(
            snapshot = session.snapshot,
            undoSnapshots = current.undoSnapshots,
            dragonsPlayerUserId = if (side == Side.dragons) userId else session.dragonsPlayerUserId,
            ravensPlayerUserId = if (side == Side.ravens) userId else session.ravensPlayerUserId
        )
    }

    fun applyCommand(current: StoredGame, command: GameCommandRequest, actingUserId: String?): StoredGame {
        actingUserId?.let { requireAuthorizedPlayer(current, it, command.type) }
        if (command.expectedVersion != current.session.version) {
            throw VersionConflictException(current.session)
        }

        return when (command.type) {
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
}
