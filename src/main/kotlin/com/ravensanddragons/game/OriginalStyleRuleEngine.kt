package com.ravensanddragons.game

internal class OriginalStyleRuleEngine(
    private val goldMovesOneSquareAtATime: Boolean = false
) : RuleSet {
    override fun getLegalMoves(snapshot: GameSnapshot): List<LegalMove> =
        legalMoveSequence(snapshot)
            .sortedWith(compareBy(LegalMove::origin, LegalMove::destination))
            .toList()

    override fun countLegalMoves(snapshot: GameSnapshot): Int =
        legalMoveSequence(snapshot).count()

    override fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece) {
        val path = BoardCoordinates.pathBetween(origin, destination, snapshot.boardSize)
        require(path.isNotEmpty() || origin[0] == destination[0] || origin.drop(1) == destination.drop(1)) {
            "Pieces must move vertically or horizontally."
        }
        if (goldMovesOneSquareAtATime && piece == Piece.gold) {
            require(isSingleOrthogonalStep(origin, destination, snapshot.boardSize)) {
                "The gold may move only one square at a time."
            }
        }
        require(path.none { snapshot.board.containsKey(it) }) {
            "Pieces may not jump over other pieces."
        }
        require(!BoardCoordinates.isCenter(destination, snapshot.specialSquare)) {
            "No piece may land on the center square."
        }
        require(piece == Piece.gold || !BoardCoordinates.isCorner(destination, snapshot.boardSize)) {
            "Only the gold may land on a corner square."
        }
        require(!isIllegalEnemySandwich(snapshot, destination, piece)) {
            "It is illegal to move a piece between two enemy pieces."
        }
        require(!wouldExposeFriendlyPieceToCapture(snapshot, origin, destination, piece)) {
            "You may not move so that your piece is captured."
        }
    }

    override fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot =
        RuleEngineSupport.applyAutomaticMove(
            snapshot,
            origin,
            destination,
            piece,
            capturedSquares = { movedSnapshot ->
                getAutomaticallyCapturedSquares(movedSnapshot, snapshot.activeSide)
            },
            resolveOutcome = ::determineOriginalGameOutcome
        )

    override fun finishCommittedTurn(snapshot: GameSnapshot): GameSnapshot {
        val positionKey = positionKey(snapshot)
        val repeated = snapshot.positionKeys.contains(positionKey)
        val snapshotWithHistory = snapshot.copy(positionKeys = snapshot.positionKeys + positionKey)

        if (repeated) {
            return GameRules.endGame(snapshotWithHistory, "Draw by repetition")
        }

        return if (GameRules.getLegalMoves(snapshotWithHistory).isEmpty()) {
            GameRules.endGame(snapshotWithHistory, "Draw by no legal move")
        } else {
            snapshotWithHistory
        }
    }

    override fun positionKey(snapshot: GameSnapshot): String {
        val boardKey = snapshot.board.entries
            .sortedBy { it.key }
            .joinToString(",") { "${it.key}:${it.value.name}" }
        return "${snapshot.ruleConfigurationId}|${snapshot.activeSide.name}|$boardKey"
    }

    private fun isSingleOrthogonalStep(origin: String, destination: String, boardSize: Int): Boolean =
        BoardCoordinates.isOrthogonallyAdjacent(origin, destination, boardSize)

    private fun legalMoveSequence(snapshot: GameSnapshot): Sequence<LegalMove> =
        snapshot.board.entries
            .asSequence()
            .filter { (_, piece) -> GameRules.sideOwnsPiece(snapshot.activeSide, piece) }
            .flatMap { (origin, piece) ->
                val candidateDestinations = if (goldMovesOneSquareAtATime && piece == Piece.gold) {
                    BoardCoordinates.neighbors(origin, snapshot.boardSize)
                        .asSequence()
                        .filter { destination -> !snapshot.board.containsKey(destination) }
                } else {
                    BoardCoordinates.orthogonalRays(origin, snapshot.boardSize)
                        .asSequence()
                        .flatMap { ray -> ray.asSequence().takeWhile { square -> !snapshot.board.containsKey(square) } }
                }

                candidateDestinations.mapNotNull { destination ->
                    try {
                        validateMove(snapshot, origin, destination, piece)
                        LegalMove(origin, destination)
                    } catch (_: IllegalArgumentException) {
                        null
                    } catch (_: IllegalStateException) {
                        null
                    }
                }
            }

    private fun wouldExposeFriendlyPieceToCapture(
        snapshot: GameSnapshot,
        origin: String,
        destination: String,
        piece: Piece
    ): Boolean {
        val movedSnapshot = RuleEngineSupport.createMovedSnapshot(snapshot, origin, destination, piece)
        val opposingSide = RuleEngineSupport.oppositeSide(snapshot.activeSide)
        if (piece == Piece.gold) {
            if (isGoldCaptured(movedSnapshot, destination)) {
                return true
            }
        } else if (isRegularPieceCaptured(movedSnapshot, destination, opposingSide)) {
            return true
        }
        val capturedByMover = getAutomaticallyCapturedSquares(movedSnapshot, snapshot.activeSide)
        val boardAfterMoverCaptures = LinkedHashMap(movedSnapshot.board)
        capturedByMover.forEach(boardAfterMoverCaptures::remove)
        return boardAfterMoverCaptures.entries
            .filter { (_, remainingPiece) -> GameRules.sideOwnsPiece(snapshot.activeSide, remainingPiece) }
            .filter { (square, _) -> square != destination }
            .any { (square, remainingPiece) ->
                if (remainingPiece == Piece.gold) {
                    isGoldCaptured(movedSnapshot.copy(board = boardAfterMoverCaptures), square)
                } else {
                    isRegularPieceCaptured(movedSnapshot.copy(board = boardAfterMoverCaptures), square, opposingSide)
                }
            }
    }

    private fun determineOriginalGameOutcome(snapshot: GameSnapshot, destination: String): String? {
        if (snapshot.board[destination] == Piece.gold && BoardCoordinates.isCorner(destination, snapshot.boardSize)) {
            return "Dragons win"
        }

        if (snapshot.board.values.none { it == Piece.raven }) {
            return "Dragons win"
        }

        return if (snapshot.board.values.none { it == Piece.gold }) {
            "Ravens win"
        } else {
            null
        }
    }

    private fun isIllegalEnemySandwich(snapshot: GameSnapshot, destination: String, movedPiece: Piece): Boolean =
        BoardCoordinates.oppositePairs(destination, snapshot.boardSize).any { (first, second) ->
            isEnemy(snapshot.board[first], movedPiece) && isEnemy(snapshot.board[second], movedPiece)
        }

    private fun isEnemy(piece: Piece?, movedPiece: Piece): Boolean {
        if (piece == null) {
            return false
        }

        return when (movedPiece) {
            Piece.raven -> piece == Piece.dragon || piece == Piece.gold
            Piece.dragon, Piece.gold -> piece == Piece.raven
        }
    }

    private fun getAutomaticallyCapturedSquares(snapshot: GameSnapshot, capturingSide: Side): List<String> =
        snapshot.board.entries
            .filter { (_, piece) -> !GameRules.sideOwnsPiece(capturingSide, piece) }
            .filter { (square, piece) ->
                if (piece == Piece.gold) {
                    isGoldCaptured(snapshot, square)
                } else {
                    isRegularPieceCaptured(snapshot, square, capturingSide)
                }
            }
            .map { (square) -> square }
            .sorted()

    private fun isGoldCaptured(snapshot: GameSnapshot, square: String): Boolean {
        if (BoardCoordinates.isCenter(square, snapshot.specialSquare)) {
            return BoardCoordinates.neighbors(square, snapshot.boardSize).all { snapshot.board[it] == Piece.raven }
        }

        if (BoardCoordinates.isOrthogonallyAdjacent(square, snapshot.specialSquare, snapshot.boardSize)) {
            return BoardCoordinates.neighbors(square, snapshot.boardSize)
                .filter { it != snapshot.specialSquare }
                .all { snapshot.board[it] == Piece.raven }
        }

        return isRegularPieceCaptured(snapshot, square, Side.ravens)
    }

    private fun isRegularPieceCaptured(
        snapshot: GameSnapshot,
        square: String,
        capturingSide: Side
    ): Boolean = BoardCoordinates.oppositePairs(square, snapshot.boardSize).any { (first, second) ->
        isHostileSquare(snapshot, first, capturingSide) && isHostileSquare(snapshot, second, capturingSide)
    }

    private fun isHostileSquare(snapshot: GameSnapshot, square: String, capturingSide: Side): Boolean {
        val piece = snapshot.board[square]
        if (piece != null) {
            return GameRules.sideOwnsPiece(capturingSide, piece)
        }

        return BoardCoordinates.isCorner(square, snapshot.boardSize) ||
            BoardCoordinates.isCenter(square, snapshot.specialSquare)
    }
}
