package com.ravensanddragons.game

internal object FreePlayRuleEngine : RuleSet {
    override fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece) = Unit

    override fun getLegalMoves(snapshot: GameSnapshot): List<LegalMove> =
        snapshot.board.entries
            .asSequence()
            .filter { (_, piece) -> GameRules.sideOwnsPiece(snapshot.activeSide, piece) }
            .flatMap { (origin, _) ->
                BoardCoordinates.allSquares(snapshot.boardSize)
                    .asSequence()
                    .filter { destination -> destination != origin && !snapshot.board.containsKey(destination) }
                    .map { destination -> LegalMove(origin, destination) }
            }
            .sortedWith(compareBy(LegalMove::origin, LegalMove::destination))
            .toList()

    override fun countLegalMoves(snapshot: GameSnapshot): Int {
        val emptySquares = (snapshot.boardSize * snapshot.boardSize) - snapshot.board.size
        return snapshot.board.values.count { piece -> GameRules.sideOwnsPiece(snapshot.activeSide, piece) } * emptySquares
    }

    override fun getCapturableSquares(snapshot: GameSnapshot): List<String> =
        snapshot.board.entries
            .filter { (_, piece) -> RuleEngineSupport.canCapturePiece(snapshot.activeSide, piece) }
            .map { (square, _) -> square }

    override fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot {
        val movedSnapshot = RuleEngineSupport.createMovedSnapshot(snapshot, origin, destination, piece)
        return if (getCapturableSquares(movedSnapshot).isNotEmpty()) {
            movedSnapshot.copy(phase = Phase.capture)
        } else {
            commitPendingTurn(movedSnapshot)
        }
    }

    override fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot {
        val piece = snapshot.board[square] ?: throw IllegalArgumentException("No piece exists at $square.")
        require(RuleEngineSupport.canCapturePiece(snapshot.activeSide, piece)) {
            "The active side cannot capture the piece at $square."
        }

        val board = LinkedHashMap(snapshot.board)
        board.remove(square)
        return commitPendingTurn(snapshot.copy(board = board, pendingMove = snapshot.pendingMove), listOf(square))
    }

    override fun commitPendingTurn(snapshot: GameSnapshot): GameSnapshot {
        val pendingMove = snapshot.pendingMove ?: return snapshot
        return snapshot.copy(
            phase = Phase.move,
            activeSide = RuleEngineSupport.oppositeSide(snapshot.activeSide),
            pendingMove = null,
            turns = snapshot.turns + pendingMove
        )
    }

    private fun commitPendingTurn(snapshot: GameSnapshot, capturedSquares: List<String>): GameSnapshot {
        val pendingMove = snapshot.pendingMove ?: return snapshot
        val completedMove = pendingMove.copy(capturedSquares = capturedSquares)
        return snapshot.copy(
            phase = Phase.move,
            activeSide = RuleEngineSupport.oppositeSide(snapshot.activeSide),
            pendingMove = null,
            turns = snapshot.turns + completedMove
        )
    }
}
