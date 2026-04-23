package com.ravensanddragons.game

internal data class RuleConfiguration(
    val summary: RuleConfigurationSummary,
    val boardSize: Int,
    val specialSquare: String,
    val presetBoard: Map<String, Piece>,
    val startingSide: Side,
    val ruleSet: RuleSet
)

internal interface RuleSet {
    fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece)

    fun getLegalMoves(snapshot: GameSnapshot): List<LegalMove> =
        RuleEngineSupport.getLegalMovesByValidation(snapshot, this)

    fun countLegalMoves(snapshot: GameSnapshot): Int =
        RuleEngineSupport.countLegalMovesByValidation(snapshot, this)

    fun getCapturableSquares(snapshot: GameSnapshot): List<String> = emptyList()

    fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot

    fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot =
        throw InvalidCommandException("This rule configuration resolves captures automatically.")

    fun commitPendingTurn(snapshot: GameSnapshot): GameSnapshot =
        throw InvalidCommandException("This rule configuration resolves captures automatically.")

    fun finishCommittedTurn(snapshot: GameSnapshot): GameSnapshot = snapshot

    fun positionKey(snapshot: GameSnapshot): String? = null
}

internal object RuleEngineSupport {
    fun getLegalMovesByValidation(snapshot: GameSnapshot, ruleSet: RuleSet): List<LegalMove> =
        legalMoveSequenceByValidation(snapshot, ruleSet)
            .sortedWith(compareBy(LegalMove::origin, LegalMove::destination))
            .toList()

    fun countLegalMovesByValidation(snapshot: GameSnapshot, ruleSet: RuleSet): Int =
        legalMoveSequenceByValidation(snapshot, ruleSet).count()

    fun createMovedSnapshot(
        snapshot: GameSnapshot,
        origin: String,
        destination: String,
        piece: Piece
    ): GameSnapshot {
        val board = LinkedHashMap(snapshot.board)
        board.remove(origin)
        board[destination] = piece

        return snapshot.copy(
            board = board,
            pendingMove = TurnRecord(type = TurnType.move, from = origin, to = destination)
        )
    }

    fun completeAutomaticTurn(
        snapshot: GameSnapshot,
        capturedSquares: List<String> = emptyList()
    ): GameSnapshot {
        val committed = commitAutomaticTurn(snapshot, capturedSquares)
        val configuration = RuleCatalog.getRuleConfiguration(committed.ruleConfigurationId)
        return configuration.ruleSet.finishCommittedTurn(committed)
    }

    fun commitAutomaticTurn(
        snapshot: GameSnapshot,
        capturedSquares: List<String> = emptyList()
    ): GameSnapshot {
        val pendingMove = snapshot.pendingMove ?: return snapshot
        val completedMove = pendingMove.copy(capturedSquares = capturedSquares)
        return snapshot.copy(
            phase = Phase.move,
            activeSide = oppositeSide(snapshot.activeSide),
            pendingMove = null,
            turns = snapshot.turns + completedMove
        )
    }

    fun applyAutomaticMove(
        snapshot: GameSnapshot,
        origin: String,
        destination: String,
        piece: Piece,
        capturedSquares: (GameSnapshot) -> List<String>,
        resolveOutcome: (GameSnapshot, String) -> String? = { _, _ -> null }
    ): GameSnapshot {
        val movedSnapshot = createMovedSnapshot(snapshot, origin, destination, piece)
        val autoCapturedSquares = capturedSquares(movedSnapshot)
        val boardAfterCapture = LinkedHashMap(movedSnapshot.board)
        autoCapturedSquares.forEach(boardAfterCapture::remove)
        val resolvedSnapshot = movedSnapshot.copy(board = boardAfterCapture)
        val outcome = resolveOutcome(resolvedSnapshot, destination)
        val completedSnapshot = commitAutomaticTurn(resolvedSnapshot, autoCapturedSquares)
        return if (outcome != null) {
            GameRules.endGame(completedSnapshot, outcome)
        } else {
            RuleCatalog.getRuleConfiguration(completedSnapshot.ruleConfigurationId).ruleSet.finishCommittedTurn(completedSnapshot)
        }
    }

    fun oppositeSide(side: Side): Side =
        if (side == Side.dragons) Side.ravens else Side.dragons

    fun canCapturePiece(side: Side, piece: Piece): Boolean =
        when (side) {
            Side.dragons -> piece == Piece.raven
            Side.ravens -> piece == Piece.dragon || piece == Piece.gold
        }

    private fun legalMoveSequenceByValidation(snapshot: GameSnapshot, ruleSet: RuleSet): Sequence<LegalMove> =
        snapshot.board.entries
            .asSequence()
            .filter { (_, piece) -> GameRules.sideOwnsPiece(snapshot.activeSide, piece) }
            .flatMap { (origin, piece) ->
                BoardCoordinates.allSquares(snapshot.boardSize)
                    .asSequence()
                    .filter { destination -> destination != origin && !snapshot.board.containsKey(destination) }
                    .mapNotNull { destination ->
                        try {
                            ruleSet.validateMove(snapshot, origin, destination, piece)
                            LegalMove(origin = origin, destination = destination)
                        } catch (_: IllegalArgumentException) {
                            null
                        } catch (_: IllegalStateException) {
                            null
                        }
                    }
            }
}
