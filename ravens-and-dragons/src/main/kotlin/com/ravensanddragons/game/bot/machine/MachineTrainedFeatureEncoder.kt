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

    data class ScoringContext(
        val mover: Side,
        val opponent: Side,
        val bias: Float,
        val weights: List<Float>,
        val beforeGoldCornerDistance: Int,
        val beforeRavenPressure: Int
    )

    fun createScoringContext(beforeSnapshot: GameSnapshot, model: MachineTrainedModel): ScoringContext {
        require(model.modelType == MachineTrainedMoveScorer.supportedModelType) {
            "Unsupported machine-trained model type: ${model.modelType}"
        }
        val weights = when (beforeSnapshot.activeSide) {
            Side.dragons -> model.dragonWeights
            Side.ravens -> model.ravenWeights
        }
        require(weights.size == featureCount) {
            "Feature vector size $featureCount does not match weight count ${weights.size}."
        }

        return ScoringContext(
            mover = beforeSnapshot.activeSide,
            opponent = BotStrategySupport.oppositeSide(beforeSnapshot.activeSide),
            bias = model.bias,
            weights = weights,
            beforeGoldCornerDistance = BotStrategySupport.goldCornerDistance(beforeSnapshot),
            beforeRavenPressure = BotStrategySupport.ravenPressure(beforeSnapshot)
        )
    }

    fun encode(
        beforeSnapshot: GameSnapshot,
        move: LegalMove,
        afterSnapshot: GameSnapshot
    ): FloatArray =
        encode(beforeSnapshot, move, afterSnapshot, createEncodingContext(beforeSnapshot))

    fun encode(
        beforeSnapshot: GameSnapshot,
        move: LegalMove,
        afterSnapshot: GameSnapshot,
        context: ScoringContext
    ): FloatArray {
        val movedPiece = beforeSnapshot.board.getValue(move.origin)
        val afterMetrics = AfterSnapshotMetrics(afterSnapshot, context)
        val features = FloatArray(featureCount)
        var index = 0

        features[index++] = if (movedPiece == Piece.gold) 1f else 0f
        features[index++] = BotStrategySupport.capturedOpponentCount(beforeSnapshot, afterSnapshot, context.mover).toFloat()
        features[index++] = if (BotStrategySupport.isWinningSnapshotFor(afterSnapshot, context.mover)) 1f else 0f
        features[index++] = (context.beforeGoldCornerDistance - afterMetrics.goldCornerDistance).toFloat()
        features[index++] = (afterMetrics.ravenPressure - context.beforeRavenPressure).toFloat()
        features[index++] = if (isStructurallyUncapturableSquare(move.destination, movedPiece, beforeSnapshot)) 1f else 0f

        val goldSquare = afterMetrics.goldSquare
        features[index++] = afterMetrics.goldCornerDistance.toFloat()
        features[index++] = goldLegalMoveCount(afterMetrics, goldSquare).toFloat()
        features[index++] = if (goldSquare != null && BoardCoordinates.isStructurallyUncapturableGoldSquare(goldSquare, afterSnapshot.boardSize, afterSnapshot.specialSquare)) 1f else 0f
        features[index++] = nearestRavenDistanceToGold(afterSnapshot, goldSquare).toFloat()
        features[index++] = ravensAdjacentToGold(afterSnapshot, goldSquare).toFloat()
        features[index++] = afterMetrics.legalMoveCountFor(context.mover).toFloat()
        features[index++] = afterMetrics.legalMoveCountFor(context.opponent).toFloat()
        features[index++] = pieceCountForSide(afterSnapshot, context.mover).toFloat()
        features[index++] = pieceCountForSide(afterSnapshot, context.opponent).toFloat()
        features[index++] = if (opponentHasImmediateWinningMove(afterMetrics)) 1f else 0f
        features[index++] = opponentCaptureThreatCount(afterMetrics).toFloat()
        features[index++] = if (opponentCanCaptureGold(afterMetrics, goldSquare)) 1f else 0f
        features[index++] = structurallyUncapturablePieceCount(afterSnapshot, context.mover).toFloat()
        features[index++] = structurallyUncapturablePieceCount(afterSnapshot, context.opponent).toFloat()
        features[index] = if (isRepeatedPosition(afterSnapshot)) 1f else 0f

        return features
    }

    private fun createEncodingContext(beforeSnapshot: GameSnapshot): ScoringContext =
        ScoringContext(
            mover = beforeSnapshot.activeSide,
            opponent = BotStrategySupport.oppositeSide(beforeSnapshot.activeSide),
            bias = 0f,
            weights = emptyList(),
            beforeGoldCornerDistance = BotStrategySupport.goldCornerDistance(beforeSnapshot),
            beforeRavenPressure = BotStrategySupport.ravenPressure(beforeSnapshot)
        )

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

    private fun goldLegalMoveCount(afterMetrics: AfterSnapshotMetrics, goldSquare: String?): Int {
        if (goldSquare == null) {
            return 0
        }

        return afterMetrics.legalMovesFor(Side.dragons)
            .count { move -> move.origin == goldSquare }
    }

    private fun opponentCaptureThreatCount(afterMetrics: AfterSnapshotMetrics): Int {
        val afterSnapshot = afterMetrics.snapshot
        if (afterSnapshot.phase != Phase.move) {
            return 0
        }

        return afterMetrics.legalMovesFor(afterMetrics.context.opponent)
            .asSequence()
            .flatMap { move ->
                val nextSnapshot = GameRules.movePiece(afterMetrics.opponentSnapshot, move.origin, move.destination)
                afterSnapshot.board.entries
                    .asSequence()
                    .filter { (_, piece) -> GameRules.sideOwnsPiece(afterMetrics.context.mover, piece) }
                    .filter { (square) -> !nextSnapshot.board.containsKey(square) }
                    .map { (square) -> square }
            }
            .toSet()
            .size
    }

    private fun opponentCanCaptureGold(afterMetrics: AfterSnapshotMetrics, goldSquare: String?): Boolean {
        goldSquare ?: return false
        return afterMetrics.legalMovesFor(afterMetrics.context.opponent)
            .any { move ->
                val nextSnapshot = GameRules.movePiece(afterMetrics.opponentSnapshot, move.origin, move.destination)
                goldSquare !in nextSnapshot.board
            }
    }

    private fun opponentHasImmediateWinningMove(afterMetrics: AfterSnapshotMetrics): Boolean =
        afterMetrics.legalMovesFor(afterMetrics.context.opponent)
            .any { move ->
                BotStrategySupport.isWinningSnapshotFor(
                    GameRules.movePiece(afterMetrics.opponentSnapshot, move.origin, move.destination),
                    afterMetrics.context.opponent
                )
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

    private class AfterSnapshotMetrics(
        val snapshot: GameSnapshot,
        val context: ScoringContext
    ) {
        val goldSquare: String? by lazy { goldSquare(snapshot) }
        val goldCornerDistance: Int by lazy { BotStrategySupport.goldCornerDistance(snapshot) }
        val ravenPressure: Int by lazy { BotStrategySupport.ravenPressure(snapshot) }
        val opponentSnapshot: GameSnapshot by lazy { snapshotForSide(snapshot, context.opponent) }
        private val legalMovesBySide = mutableMapOf<Side, List<LegalMove>>()

        fun legalMovesFor(side: Side): List<LegalMove> =
            legalMovesBySide.getOrPut(side) { GameRules.getLegalMoves(snapshotForSide(snapshot, side)) }

        fun legalMoveCountFor(side: Side): Int =
            legalMovesBySide[side]?.size
                ?: if (side == context.opponent) {
                    legalMovesFor(side).size
                } else {
                    GameRules.countLegalMoves(snapshotForSide(snapshot, side))
                }
    }
}
