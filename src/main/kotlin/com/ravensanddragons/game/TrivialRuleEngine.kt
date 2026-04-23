package com.ravensanddragons.game

internal object TrivialRuleEngine : RuleSet {
    override fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece) = Unit

    override fun getLegalMoves(snapshot: GameSnapshot): List<LegalMove> =
        FreePlayRuleEngine.getLegalMoves(snapshot)

    override fun countLegalMoves(snapshot: GameSnapshot): Int =
        FreePlayRuleEngine.countLegalMoves(snapshot)

    override fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot =
        RuleEngineSupport.applyAutomaticMove(
            snapshot,
            origin,
            destination,
            piece,
            capturedSquares = { movedSnapshot ->
                BoardCoordinates.neighbors(destination, snapshot.boardSize)
                    .filter { neighbor ->
                        val targetPiece = movedSnapshot.board[neighbor] ?: return@filter false
                        !GameRules.sideOwnsPiece(snapshot.activeSide, targetPiece)
                    }
                    .sorted()
            },
            resolveOutcome = ::determineTrivialOutcome
        )

    private fun determineTrivialOutcome(snapshot: GameSnapshot, destination: String): String? {
        val goldReachedCenter = snapshot.board[destination] == Piece.gold &&
            BoardCoordinates.isCenter(destination, snapshot.specialSquare)
        if (goldReachedCenter || snapshot.board.values.none { it == Piece.raven }) {
            return "Dragons win"
        }

        return if (snapshot.board.values.none { it == Piece.gold }) {
            "Ravens win"
        } else {
            null
        }
    }
}
