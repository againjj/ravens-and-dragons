package com.ravensanddragons.game

import kotlin.math.abs

object MachineLearnedFeatureEncoder {
    const val schemaVersion = 4

    val absoluteMoveLocalFeatureNames = listOf(
        "moved-piece-gold",
        "captured-opponent-count",
        "move-wins-immediately",
        "mover-origin-center-adjacent",
        "mover-origin-edge",
        "mover-origin-corner-adjacent",
        "mover-destination-center-adjacent",
        "mover-destination-edge",
        "mover-destination-corner-adjacent"
    )

    val relativeMoveLocalFeatureNames = listOf(
        "gold-origin-center-adjacent",
        "gold-origin-edge",
        "gold-origin-corner-adjacent",
        "gold-destination-center-adjacent",
        "gold-destination-edge",
        "gold-destination-corner-adjacent",
        "gold-corner-distance-delta",
        "raven-pressure-delta"
    )

    val absolutePositionDerivedFeatureNames = listOf(
        "after-opponent-immediate-win",
        "after-opponent-captures",
        "after-active-side-legal-move-delta",
        "after-evaluation-for-active-side"
    )

    val relativePositionDerivedFeatureNames = listOf(
        "after-gold-corner-distance",
        "after-nearest-raven-distance-to-gold",
        "after-ravens-adjacent-to-gold",
        "after-dragons-mobility",
        "after-ravens-mobility",
        "after-dragons-piece-count",
        "after-ravens-piece-count",
        "after-gold-movable",
        "after-position-repeat-risk"
    )

    val moveLocalFeatureNames = absoluteMoveLocalFeatureNames + relativeMoveLocalFeatureNames
    val positionDerivedFeatureNames = absolutePositionDerivedFeatureNames + relativePositionDerivedFeatureNames
    val featureNames = moveLocalFeatureNames + positionDerivedFeatureNames
    val featureCount: Int = featureNames.size

    fun encode(
        beforeSnapshot: GameSnapshot,
        move: LegalMove,
        afterSnapshot: GameSnapshot
    ): FloatArray {
        val movedPiece = beforeSnapshot.board.getValue(move.origin)
        val mover = beforeSnapshot.activeSide
        val opponent = BotStrategySupport.oppositeSide(mover)
        val beforeActiveMobility = mobilityForSide(beforeSnapshot, mover)
        val afterActiveMobility = mobilityForSide(afterSnapshot, mover)

        return (
            absoluteMoveLocalFeatures(beforeSnapshot, move, afterSnapshot, movedPiece, mover) +
                relativeMoveLocalFeatures(beforeSnapshot, move, afterSnapshot, movedPiece, mover) +
                absolutePositionDerivedFeatures(
                    afterSnapshot = afterSnapshot,
                    mover = mover,
                    opponent = opponent,
                    activeSideLegalMoveDelta = afterActiveMobility - beforeActiveMobility
                ) +
                relativePositionDerivedFeatures(
                    afterSnapshot = afterSnapshot,
                    mover = mover
                )
        ).toFloatArray()
    }

    private fun absoluteMoveLocalFeatures(
        beforeSnapshot: GameSnapshot,
        move: LegalMove,
        afterSnapshot: GameSnapshot,
        movedPiece: Piece,
        mover: Side
    ): List<Float> =
        listOf(
            if (movedPiece == Piece.gold) 1f else 0f,
            BotStrategySupport.capturedOpponentCount(beforeSnapshot, afterSnapshot, mover).toFloat(),
            if (BotStrategySupport.isWinningSnapshotFor(afterSnapshot, mover)) 1f else 0f,
            if (isCenterAdjacent(move.origin, beforeSnapshot)) 1f else 0f,
            if (isEdge(move.origin, beforeSnapshot.boardSize)) 1f else 0f,
            if (isCornerAdjacent(move.origin, beforeSnapshot.boardSize)) 1f else 0f,
            if (isCenterAdjacent(move.destination, beforeSnapshot)) 1f else 0f,
            if (isEdge(move.destination, beforeSnapshot.boardSize)) 1f else 0f,
            if (isCornerAdjacent(move.destination, beforeSnapshot.boardSize)) 1f else 0f
        )

    private fun relativeMoveLocalFeatures(
        beforeSnapshot: GameSnapshot,
        move: LegalMove,
        afterSnapshot: GameSnapshot,
        movedPiece: Piece,
        mover: Side
    ): List<Float> =
        relativeFeatures(
            mover,
            if (movedPiece == Piece.gold && isCenterAdjacent(move.origin, beforeSnapshot)) 1f else 0f,
            if (movedPiece == Piece.gold && isEdge(move.origin, beforeSnapshot.boardSize)) 1f else 0f,
            if (movedPiece == Piece.gold && isCornerAdjacent(move.origin, beforeSnapshot.boardSize)) 1f else 0f,
            if (movedPiece == Piece.gold && isCenterAdjacent(move.destination, beforeSnapshot)) 1f else 0f,
            if (movedPiece == Piece.gold && isEdge(move.destination, beforeSnapshot.boardSize)) 1f else 0f,
            if (movedPiece == Piece.gold && isCornerAdjacent(move.destination, beforeSnapshot.boardSize)) 1f else 0f,
            (BotStrategySupport.goldCornerDistance(beforeSnapshot) - BotStrategySupport.goldCornerDistance(afterSnapshot)).toFloat(),
            (BotStrategySupport.ravenPressure(afterSnapshot) - BotStrategySupport.ravenPressure(beforeSnapshot)).toFloat()
        )

    private fun absolutePositionDerivedFeatures(
        afterSnapshot: GameSnapshot,
        mover: Side,
        opponent: Side,
        activeSideLegalMoveDelta: Int
    ): List<Float> =
        listOf(
            if (BotStrategySupport.hasImmediateWinningMove(afterSnapshot, opponent)) 1f else 0f,
            opponentCaptureThreatCount(afterSnapshot, mover, opponent).toFloat(),
            activeSideLegalMoveDelta.toFloat(),
            BotStrategySupport.evaluateForSide(afterSnapshot, mover).toFloat()
        )

    private fun relativePositionDerivedFeatures(
        afterSnapshot: GameSnapshot,
        mover: Side
    ): List<Float> {
        val goldSquare = goldSquare(afterSnapshot)
        return relativeFeatures(
            mover,
            BotStrategySupport.goldCornerDistance(afterSnapshot).toFloat(),
            nearestRavenDistanceToGold(afterSnapshot, goldSquare).toFloat(),
            ravensAdjacentToGold(afterSnapshot, goldSquare).toFloat(),
            mobilityForSide(afterSnapshot, Side.dragons).toFloat(),
            mobilityForSide(afterSnapshot, Side.ravens).toFloat(),
            pieceCountForSide(afterSnapshot, Side.dragons).toFloat(),
            pieceCountForSide(afterSnapshot, Side.ravens).toFloat(),
            if (goldRemainsMovable(afterSnapshot, goldSquare)) 1f else 0f,
            if (isRepeatedPosition(afterSnapshot)) 1f else 0f
        )
    }

    private fun relativeFeatures(mover: Side, vararg rawValues: Float): List<Float> {
        val multiplier = if (mover == Side.dragons) 1f else -1f
        return rawValues.map { value ->
            if (value == 0f) {
                0f
            } else {
                value * multiplier
            }
        }
    }

    private fun isCenterAdjacent(square: String, snapshot: GameSnapshot): Boolean =
        BoardCoordinates.isOrthogonallyAdjacent(square, snapshot.specialSquare, snapshot.boardSize)

    private fun isEdge(square: String, boardSize: Int): Boolean {
        val (fileIndex, rankIndex) = squareIndexes(square)
        return fileIndex == 0 || rankIndex == 0 || fileIndex == boardSize - 1 || rankIndex == boardSize - 1
    }

    private fun isCornerAdjacent(square: String, boardSize: Int): Boolean =
        BoardCoordinates.cornerSquares(boardSize).any { corner ->
            BoardCoordinates.isOrthogonallyAdjacent(square, corner, boardSize)
        }

    private fun nearestRavenDistanceToGold(snapshot: GameSnapshot, goldSquare: String?): Int {
        if (goldSquare == null) {
            return snapshot.boardSize * 2
        }

        val ravens = snapshot.board.entries
            .filter { (_, piece) -> piece == Piece.raven }
            .map { (square) -> square }
        if (ravens.isEmpty()) {
            return snapshot.boardSize * 2
        }

        return ravens.minOf { ravenSquare -> manhattanDistance(ravenSquare, goldSquare) }
    }

    private fun ravensAdjacentToGold(snapshot: GameSnapshot, goldSquare: String?): Int {
        if (goldSquare == null) {
            return 0
        }

        return snapshot.board.entries.count { (square, piece) ->
            piece == Piece.raven && BoardCoordinates.isOrthogonallyAdjacent(square, goldSquare, snapshot.boardSize)
        }
    }

    private fun goldRemainsMovable(snapshot: GameSnapshot, goldSquare: String?): Boolean {
        if (goldSquare == null) {
            return false
        }

        return GameRules.getLegalMoves(snapshotForSide(snapshot, Side.dragons))
            .any { move -> move.origin == goldSquare }
    }

    private fun mobilityForSide(snapshot: GameSnapshot, side: Side): Int =
        GameRules.countLegalMoves(snapshotForSide(snapshot, side))

    private fun opponentCaptureThreatCount(afterSnapshot: GameSnapshot, mover: Side, opponent: Side): Int {
        if (afterSnapshot.phase != Phase.move) {
            return 0
        }

        val opponentSnapshot = snapshotForSide(afterSnapshot, opponent)
        return GameRules.getLegalMoves(opponentSnapshot)
            .asSequence()
            .flatMap { move ->
                val nextSnapshot = GameRules.movePiece(opponentSnapshot, move.origin, move.destination)
                afterSnapshot.board.entries
                    .asSequence()
                    .filter { (_, piece) -> GameRules.sideOwnsPiece(mover, piece) }
                    .filter { (square) -> !nextSnapshot.board.containsKey(square) }
                    .map { (square) -> square }
            }
            .toSet()
            .size
    }

    private fun pieceCountForSide(snapshot: GameSnapshot, side: Side): Int =
        snapshot.board.values.count { piece -> GameRules.sideOwnsPiece(side, piece) }

    private fun isRepeatedPosition(snapshot: GameSnapshot): Boolean {
        val latestPositionKey = snapshot.positionKeys.lastOrNull() ?: return false
        return latestPositionKey in snapshot.positionKeys.dropLast(1)
    }

    private fun snapshotForSide(snapshot: GameSnapshot, side: Side): GameSnapshot =
        snapshot.copy(phase = Phase.move, activeSide = side, pendingMove = null)

    private fun goldSquare(snapshot: GameSnapshot): String? =
        snapshot.board.entries.firstOrNull { (_, piece) -> piece == Piece.gold }?.key

    private fun manhattanDistance(first: String, second: String): Int {
        val (firstFile, firstRank) = squareIndexes(first)
        val (secondFile, secondRank) = squareIndexes(second)
        return abs(firstFile - secondFile) + abs(firstRank - secondRank)
    }

    private fun squareIndexes(square: String): Pair<Int, Int> =
        (square[0] - 'a') to (square.drop(1).toInt() - 1)
}
