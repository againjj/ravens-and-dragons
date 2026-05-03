package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import kotlin.math.abs

object MachineTrainedFeatureEncoder {
    const val schemaVersion = 5

    val moveLocalFeatureNames = listOf(
        "moved-piece-gold",
        "captured-opponent-count",
        "move-wins-immediately",
        "gold-corner-distance-delta",
        "raven-pressure-delta",
        "moved-piece-to-structurally-uncapturable-square"
    )

    val positionDerivedFeatureNames = listOf(
        "after-gold-corner-distance",
        "after-gold-legal-move-count",
        "after-gold-on-structurally-uncapturable-square",
        "after-nearest-raven-distance-to-gold",
        "after-ravens-adjacent-to-gold",
        "after-mover-legal-move-count",
        "after-opponent-legal-move-count",
        "after-mover-piece-count",
        "after-opponent-piece-count",
        "after-opponent-immediate-win",
        "after-opponent-capture-threat-count",
        "after-opponent-can-capture-gold",
        "after-mover-structurally-uncapturable-piece-count",
        "after-opponent-structurally-uncapturable-piece-count",
        "after-position-repeat-risk"
    )

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

        return (
            moveLocalFeatures(beforeSnapshot, move, afterSnapshot, movedPiece, mover) +
                positionDerivedFeatures(
                    afterSnapshot = afterSnapshot,
                    mover = mover,
                    opponent = opponent
                )
        ).toFloatArray()
    }

    private fun moveLocalFeatures(
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
            (BotStrategySupport.goldCornerDistance(beforeSnapshot) - BotStrategySupport.goldCornerDistance(afterSnapshot)).toFloat(),
            (BotStrategySupport.ravenPressure(afterSnapshot) - BotStrategySupport.ravenPressure(beforeSnapshot)).toFloat(),
            if (isStructurallyUncapturableSquare(move.destination, movedPiece, beforeSnapshot)) 1f else 0f
        )

    private fun positionDerivedFeatures(
        afterSnapshot: GameSnapshot,
        mover: Side,
        opponent: Side
    ): List<Float> {
        val goldSquare = goldSquare(afterSnapshot)
        return listOf(
            BotStrategySupport.goldCornerDistance(afterSnapshot).toFloat(),
            goldLegalMoveCount(afterSnapshot, goldSquare).toFloat(),
            if (goldSquare != null && BoardCoordinates.isStructurallyUncapturableGoldSquare(goldSquare, afterSnapshot.boardSize, afterSnapshot.specialSquare)) 1f else 0f,
            nearestRavenDistanceToGold(afterSnapshot, goldSquare).toFloat(),
            ravensAdjacentToGold(afterSnapshot, goldSquare).toFloat(),
            mobilityForSide(afterSnapshot, mover).toFloat(),
            mobilityForSide(afterSnapshot, opponent).toFloat(),
            pieceCountForSide(afterSnapshot, mover).toFloat(),
            pieceCountForSide(afterSnapshot, opponent).toFloat(),
            if (BotStrategySupport.hasImmediateWinningMove(afterSnapshot, opponent)) 1f else 0f,
            opponentCaptureThreatCount(afterSnapshot, mover, opponent).toFloat(),
            if (opponentCanCaptureGold(afterSnapshot, opponent)) 1f else 0f,
            structurallyUncapturablePieceCount(afterSnapshot, mover).toFloat(),
            structurallyUncapturablePieceCount(afterSnapshot, opponent).toFloat(),
            if (isRepeatedPosition(afterSnapshot)) 1f else 0f
        )
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

    private fun goldLegalMoveCount(snapshot: GameSnapshot, goldSquare: String?): Int {
        if (goldSquare == null) {
            return 0
        }

        return GameRules.getLegalMoves(snapshotForSide(snapshot, Side.dragons))
            .count { move -> move.origin == goldSquare }
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

    private fun opponentCanCaptureGold(afterSnapshot: GameSnapshot, opponent: Side): Boolean {
        val goldSquare = goldSquare(afterSnapshot) ?: return false
        val opponentSnapshot = snapshotForSide(afterSnapshot, opponent)
        return GameRules.getLegalMoves(opponentSnapshot)
            .any { move ->
                val nextSnapshot = GameRules.movePiece(opponentSnapshot, move.origin, move.destination)
                goldSquare !in nextSnapshot.board
            }
    }

    private fun pieceCountForSide(snapshot: GameSnapshot, side: Side): Int =
        snapshot.board.values.count { piece -> GameRules.sideOwnsPiece(side, piece) }

    private fun structurallyUncapturablePieceCount(snapshot: GameSnapshot, side: Side): Int =
        snapshot.board.entries.count { (square, piece) ->
            GameRules.sideOwnsPiece(side, piece) &&
                isStructurallyUncapturableSquare(square, piece, snapshot)
        }

    private fun isStructurallyUncapturableSquare(square: String, piece: Piece, snapshot: GameSnapshot): Boolean =
        when (piece) {
            Piece.gold -> BoardCoordinates.isStructurallyUncapturableGoldSquare(
                square,
                snapshot.boardSize,
                snapshot.specialSquare
            )
            Piece.dragon, Piece.raven -> BoardCoordinates.isStructurallyUncapturableRegularSquare(
                square,
                snapshot.boardSize,
                snapshot.specialSquare
            )
        }

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
