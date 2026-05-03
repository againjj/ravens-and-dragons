package com.ravensanddragons.game.bot.strategy

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


internal object OriginalStyleBotSearch {
    private data class RuleProfile(
        val goldMovesOneSquareAtATime: Boolean
    )

    private val supportedRuleProfiles = mapOf(
        "original-game" to RuleProfile(goldMovesOneSquareAtATime = false),
        "sherwood-rules" to RuleProfile(goldMovesOneSquareAtATime = true),
        "square-one" to RuleProfile(goldMovesOneSquareAtATime = true),
        "sherwood-x-9" to RuleProfile(goldMovesOneSquareAtATime = true),
        "square-one-x-9" to RuleProfile(goldMovesOneSquareAtATime = true)
    )

    fun supports(snapshot: GameSnapshot): Boolean =
        snapshot.ruleConfigurationId in supportedRuleProfiles

    fun getLegalMoves(snapshot: GameSnapshot): List<LegalMove> {
        if (snapshot.phase != Phase.move || !supports(snapshot)) {
            return GameRules.getLegalMoves(snapshot)
        }

        return legalMoveSequence(snapshot)
            .sortedWith(compareBy(LegalMove::origin, LegalMove::destination))
            .toList()
    }

    fun countLegalMoves(snapshot: GameSnapshot): Int {
        if (snapshot.phase != Phase.move || !supports(snapshot)) {
            return GameRules.countLegalMoves(snapshot)
        }

        return legalMoveSequence(snapshot).count()
    }

    fun applyMove(snapshot: GameSnapshot, move: LegalMove): GameSnapshot {
        if (!supports(snapshot)) {
            return GameRules.movePiece(snapshot, move.origin, move.destination)
        }

        val piece = snapshot.board[move.origin] ?: throw IllegalArgumentException("No piece exists at ${move.origin}.")
        require(sideOwnsPiece(snapshot.activeSide, piece)) { "The active side cannot move the piece at ${move.origin}." }

        val movedSnapshot = RuleEngineSupport.createMovedSnapshot(snapshot, move.origin, move.destination, piece)
        val capturedSquares = getAutomaticallyCapturedSquares(movedSnapshot, snapshot.activeSide)
        val boardAfterCapture = LinkedHashMap(movedSnapshot.board)
        capturedSquares.forEach(boardAfterCapture::remove)
        val resolvedSnapshot = movedSnapshot.copy(board = boardAfterCapture)
        val outcome = determineOutcome(resolvedSnapshot, move.destination)
        val committedSnapshot = RuleEngineSupport.commitAutomaticTurn(resolvedSnapshot, capturedSquares)
        return if (outcome != null) {
            GameRules.endGame(committedSnapshot, outcome)
        } else {
            finishCommittedTurn(committedSnapshot)
        }
    }

    private fun finishCommittedTurn(snapshot: GameSnapshot): GameSnapshot {
        val positionKey = positionKey(snapshot)
        val repeated = snapshot.positionKeys.contains(positionKey)
        val snapshotWithHistory = snapshot.copy(positionKeys = snapshot.positionKeys + positionKey)

        if (repeated) {
            return GameRules.endGame(snapshotWithHistory, "Draw by repetition")
        }

        return if (countLegalMoves(snapshotWithHistory) == 0) {
            GameRules.endGame(snapshotWithHistory, "Draw by no legal move")
        } else {
            snapshotWithHistory
        }
    }

    private fun positionKey(snapshot: GameSnapshot): String {
        val boardKey = snapshot.board.entries
            .sortedBy { it.key }
            .joinToString(",") { "${it.key}:${it.value.name}" }
        return "${snapshot.ruleConfigurationId}|${snapshot.activeSide.name}|$boardKey"
    }

    private fun legalMoveSequence(snapshot: GameSnapshot): Sequence<LegalMove> {
        val ruleProfile = supportedRuleProfiles.getValue(snapshot.ruleConfigurationId)
        return snapshot.board.entries
            .asSequence()
            .filter { (_, piece) -> sideOwnsPiece(snapshot.activeSide, piece) }
            .flatMap { (origin, piece) ->
                candidateDestinations(snapshot, origin, piece, ruleProfile)
                    .mapNotNull { destination ->
                        if (isLegalMove(snapshot, origin, destination, piece, ruleProfile)) {
                            LegalMove(origin, destination)
                        } else {
                            null
                        }
                    }
            }
    }

    private fun candidateDestinations(
        snapshot: GameSnapshot,
        origin: String,
        piece: Piece,
        ruleProfile: RuleProfile
    ): Sequence<String> {
        return if (ruleProfile.goldMovesOneSquareAtATime && piece == Piece.gold) {
            BoardCoordinates.neighbors(origin, snapshot.boardSize)
                .asSequence()
                .filter { destination -> !snapshot.board.containsKey(destination) }
        } else {
            BoardCoordinates.orthogonalRays(origin, snapshot.boardSize)
                .asSequence()
                .flatMap { ray -> ray.asSequence().takeWhile { square -> !snapshot.board.containsKey(square) } }
        }
    }

    private fun isLegalMove(
        snapshot: GameSnapshot,
        origin: String,
        destination: String,
        piece: Piece,
        ruleProfile: RuleProfile
    ): Boolean {
        val path = BoardCoordinates.pathBetween(origin, destination, snapshot.boardSize)
        if (path.isEmpty() && origin[0] != destination[0] && origin.drop(1) != destination.drop(1)) {
            return false
        }
        if (ruleProfile.goldMovesOneSquareAtATime &&
            piece == Piece.gold &&
            !BoardCoordinates.isOrthogonallyAdjacent(origin, destination, snapshot.boardSize)
        ) {
            return false
        }
        if (path.any(snapshot.board::containsKey)) {
            return false
        }
        if (BoardCoordinates.isCenter(destination, snapshot.specialSquare)) {
            return false
        }
        if (piece != Piece.gold && BoardCoordinates.isCorner(destination, snapshot.boardSize)) {
            return false
        }
        if (isIllegalEnemySandwich(snapshot, destination, piece)) {
            return false
        }
        if (wouldExposeFriendlyPieceToCapture(snapshot, origin, destination, piece)) {
            return false
        }

        return true
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
        val snapshotAfterMoverCaptures = if (capturedByMover.isEmpty()) {
            movedSnapshot
        } else {
            val boardAfterMoverCaptures = LinkedHashMap(movedSnapshot.board)
            capturedByMover.forEach(boardAfterMoverCaptures::remove)
            movedSnapshot.copy(board = boardAfterMoverCaptures)
        }

        val changedSquares = buildSet {
            add(origin)
            add(destination)
            addAll(capturedByMover)
        }
        return exposedFriendlySquares(
            snapshot = snapshotAfterMoverCaptures,
            changedSquares = changedSquares,
            movingSide = snapshot.activeSide,
            excludedSquare = destination
        ).any { square ->
            val remainingPiece = snapshotAfterMoverCaptures.board.getValue(square)
            if (remainingPiece == Piece.gold) {
                isGoldCaptured(snapshotAfterMoverCaptures, square)
            } else {
                isRegularPieceCaptured(snapshotAfterMoverCaptures, square, opposingSide)
            }
        }
    }

    private fun exposedFriendlySquares(
        snapshot: GameSnapshot,
        changedSquares: Set<String>,
        movingSide: Side,
        excludedSquare: String
    ): Set<String> = buildSet {
        changedSquares.forEach { changedSquare ->
            addFriendlyCandidate(snapshot, changedSquare, movingSide, excludedSquare)
            BoardCoordinates.neighbors(changedSquare, snapshot.boardSize).forEach { neighbor ->
                addFriendlyCandidate(snapshot, neighbor, movingSide, excludedSquare)
            }
        }
    }

    private fun MutableSet<String>.addFriendlyCandidate(
        snapshot: GameSnapshot,
        square: String,
        movingSide: Side,
        excludedSquare: String
    ) {
        if (square == excludedSquare) {
            return
        }
        val piece = snapshot.board[square] ?: return
        if (sideOwnsPiece(movingSide, piece)) {
            add(square)
        }
    }

    private fun determineOutcome(snapshot: GameSnapshot, destination: String): String? {
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

    private fun getAutomaticallyCapturedSquares(snapshot: GameSnapshot, capturingSide: Side): List<String> =
        snapshot.board.entries
            .asSequence()
            .filter { (_, piece) -> !sideOwnsPiece(capturingSide, piece) }
            .filter { (square, piece) ->
                if (piece == Piece.gold) {
                    isGoldCaptured(snapshot, square)
                } else {
                    isRegularPieceCaptured(snapshot, square, capturingSide)
                }
            }
            .map { (square) -> square }
            .sorted()
            .toList()

    private fun isGoldCaptured(snapshot: GameSnapshot, square: String): Boolean {
        if (BoardCoordinates.isCenter(square, snapshot.specialSquare)) {
            return BoardCoordinates.neighbors(square, snapshot.boardSize).all { snapshot.board[it] == Piece.raven }
        }

        if (BoardCoordinates.isOrthogonallyAdjacent(square, snapshot.specialSquare, snapshot.boardSize)) {
            return BoardCoordinates.neighbors(square, snapshot.boardSize)
                .asSequence()
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
            return sideOwnsPiece(capturingSide, piece)
        }

        return BoardCoordinates.isCorner(square, snapshot.boardSize) ||
            BoardCoordinates.isCenter(square, snapshot.specialSquare)
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

    private fun sideOwnsPiece(side: Side, piece: Piece): Boolean =
        GameRules.sideOwnsPiece(side, piece)
}
