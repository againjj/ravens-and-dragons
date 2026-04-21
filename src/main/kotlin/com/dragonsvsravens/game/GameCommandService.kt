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
        val currentBotId = when (side) {
            Side.dragons -> session.dragonsBotId
            Side.ravens -> session.ravensBotId
        }
        if (currentHolder == userId) {
            return current
        }
        if (currentHolder != null || currentBotId != null) {
            throw ForbiddenActionException("${side.name.replaceFirstChar(Char::titlecase)} is already claimed.")
        }
        return current.next(
            snapshot = session.snapshot,
            undoSnapshots = current.undoSnapshots,
            dragonsPlayerUserId = if (side == Side.dragons) userId else session.dragonsPlayerUserId,
            ravensPlayerUserId = if (side == Side.ravens) userId else session.ravensPlayerUserId
        )
    }

    fun assignBotOpponent(current: StoredGame, userId: String, botDefinition: BotDefinition): StoredGame {
        val session = current.session
        if (session.dragonsBotId != null || session.ravensBotId != null) {
            throw ForbiddenActionException("A bot opponent is already assigned.")
        }
        if (session.lifecycle == GameLifecycle.finished) {
            throw InvalidCommandException("Bot assignment is unavailable after the game has finished.")
        }
        if (session.selectedRuleConfigurationId !in botDefinition.supportedRuleConfigurationIds) {
            throw InvalidCommandException("${botDefinition.displayName} is not available for this rule configuration.")
        }
        if (session.snapshot.turns.isNotEmpty()) {
            throw InvalidCommandException("Bot assignment is available only before the first move.")
        }

        val dragonsPlayerUserId = session.dragonsPlayerUserId
        val ravensPlayerUserId = session.ravensPlayerUserId
        val claimedSeatCount = listOf(dragonsPlayerUserId, ravensPlayerUserId).count { it != null }
        if (claimedSeatCount == 0) {
            throw ForbiddenActionException("You must claim exactly one human seat before assigning a bot opponent.")
        }
        if (claimedSeatCount == 2) {
            throw ForbiddenActionException("A bot opponent can be assigned only to an open seat.")
        }

        val targetSide = if (dragonsPlayerUserId == null) Side.dragons else Side.ravens
        val claimingUserId = dragonsPlayerUserId ?: ravensPlayerUserId
        if (claimingUserId != userId) {
            throw ForbiddenActionException("You must claim exactly one human seat before assigning a bot opponent.")
        }

        return current.next(
            snapshot = session.snapshot,
            undoSnapshots = current.undoSnapshots,
            dragonsBotId = if (targetSide == Side.dragons) botDefinition.id else session.dragonsBotId,
            ravensBotId = if (targetSide == Side.ravens) botDefinition.id else session.ravensBotId
        )
    }

    fun applyCommand(current: StoredGame, command: GameCommandRequest, actingUserId: String?): StoredGame {
        if (command.type == "undo" && (current.session.dragonsBotId != null || current.session.ravensBotId != null)) {
            throw InvalidCommandException("Undo is unavailable in games with a bot opponent.")
        }
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
                        current.session.selectedBoardSize,
                        current.session.snapshot.board
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
        dragonsBotId: String? = this.session.dragonsBotId,
        ravensBotId: String? = this.session.ravensBotId,
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
        dragonsBotId = dragonsBotId,
        ravensBotId = ravensBotId,
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
