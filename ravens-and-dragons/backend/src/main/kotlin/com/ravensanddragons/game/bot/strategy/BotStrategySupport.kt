package com.ravensanddragons.game.bot.strategy

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import kotlin.math.abs

internal object BotStrategySupport {
    private const val terminalWinScore = 1_000_000

    private data class EvaluationWeights(
        val material: Int,
        val mobility: Int,
        val goldProgress: Int,
        val ravenPressure: Int
    )

    private val originalStyleWeights = EvaluationWeights(
        material = 35,
        mobility = 3,
        goldProgress = 20,
        ravenPressure = 15
    )

    private val squareOneWeights = EvaluationWeights(
        material = 45,
        mobility = 4,
        goldProgress = 12,
        ravenPressure = 18
    )

    fun findImmediateWinningMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove? =
        legalMoves.firstOrNull { move -> moverWins(snapshot, applyMove(snapshot, move)) }

    fun hasImmediateWinningMove(snapshot: GameSnapshot, side: Side): Boolean {
        val sideSnapshot = snapshotForSide(snapshot, side)
        return GameRules.getLegalMoves(sideSnapshot)
            .any { move -> moverWins(sideSnapshot, applyMove(sideSnapshot, move)) }
    }

    fun capturedOpponentCount(previousSnapshot: GameSnapshot, nextSnapshot: GameSnapshot, mover: Side): Int =
        countPiecesForSide(previousSnapshot, oppositeSide(mover)) - countPiecesForSide(nextSnapshot, oppositeSide(mover))

    fun evaluateForSide(snapshot: GameSnapshot, perspectiveSide: Side): Int {
        return evaluateForSide(snapshot, perspectiveSide) { evaluatedSnapshot ->
            GameRules.countLegalMoves(evaluatedSnapshot)
        }
    }

    fun evaluateForSide(
        snapshot: GameSnapshot,
        perspectiveSide: Side,
        legalMoveCounter: (GameSnapshot) -> Int
    ): Int {
        terminalScore(snapshot, perspectiveSide)?.let { return it }

        val weights = evaluationWeights(snapshot.ruleConfigurationId)
        val opponent = oppositeSide(perspectiveSide)

        var score = 0
        score += (countPiecesForSide(snapshot, perspectiveSide) - countPiecesForSide(snapshot, opponent)) * weights.material
        score += (mobilityScore(snapshot, perspectiveSide, legalMoveCounter) - mobilityScore(snapshot, opponent, legalMoveCounter)) * weights.mobility

        val goldDistance = goldCornerDistance(snapshot)
        score += when (perspectiveSide) {
            Side.dragons -> -goldDistance * weights.goldProgress
            Side.ravens -> goldDistance * weights.goldProgress
        }

        val ravenPressure = ravenPressure(snapshot)
        score += when (perspectiveSide) {
            Side.dragons -> -ravenPressure * weights.ravenPressure
            Side.ravens -> ravenPressure * weights.ravenPressure
        }

        return score
    }

    fun terminalScore(snapshot: GameSnapshot, perspectiveSide: Side): Int? {
        val outcome = snapshot.turns.lastOrNull()?.takeIf { it.type == TurnType.gameOver }?.outcome ?: return null
        return when (outcome) {
            "Dragons win" -> if (perspectiveSide == Side.dragons) terminalWinScore else -terminalWinScore
            "Ravens win" -> if (perspectiveSide == Side.ravens) terminalWinScore else -terminalWinScore
            else -> 0
        }
    }

    fun isWinningSnapshotFor(snapshot: GameSnapshot, side: Side): Boolean =
        terminalScore(snapshot, side) == terminalWinScore

    fun applyMove(snapshot: GameSnapshot, move: LegalMove): GameSnapshot =
        GameRules.movePiece(snapshot, move.origin, move.destination)

    fun goldCornerDistance(snapshot: GameSnapshot): Int {
        val goldSquare = goldSquare(snapshot) ?: return 0
        return cornerSquares(snapshot.boardSize).minOf { corner -> manhattanDistance(goldSquare, corner) }
    }

    fun ravenPressure(snapshot: GameSnapshot): Int {
        val goldSquare = goldSquare(snapshot) ?: return 100
        val ravens = snapshot.board.entries
            .filter { (_, piece) -> piece == Piece.raven }
            .map { (square) -> square }
        if (ravens.isEmpty()) {
            return 0
        }

        val nearestDistance = ravens.minOf { square -> manhattanDistance(square, goldSquare) }
        val adjacentRavens = ravens.count { square ->
            BoardCoordinates.isOrthogonallyAdjacent(square, goldSquare, snapshot.boardSize)
        }
        return (adjacentRavens * 4) - nearestDistance
    }

    fun oppositeSide(side: Side): Side =
        when (side) {
            Side.dragons -> Side.ravens
            Side.ravens -> Side.dragons
        }

    private fun evaluationWeights(ruleConfigurationId: String): EvaluationWeights =
        when (ruleConfigurationId) {
            "square-one", "square-one-x-9" -> squareOneWeights
            else -> originalStyleWeights
        }

    private fun mobilityScore(
        snapshot: GameSnapshot,
        side: Side,
        legalMoveCounter: (GameSnapshot) -> Int
    ): Int = legalMoveCounter(snapshotForSide(snapshot, side))

    private fun countPiecesForSide(snapshot: GameSnapshot, side: Side): Int =
        snapshot.board.values.count { GameRules.sideOwnsPiece(side, it) }

    private fun moverWins(previousSnapshot: GameSnapshot, nextSnapshot: GameSnapshot): Boolean {
        val terminalTurn = nextSnapshot.turns.lastOrNull() ?: return false
        if (terminalTurn.type != TurnType.gameOver) {
            return false
        }

        return when (previousSnapshot.activeSide) {
            Side.dragons -> terminalTurn.outcome == "Dragons win"
            Side.ravens -> terminalTurn.outcome == "Ravens win"
        }
    }

    private fun goldSquare(snapshot: GameSnapshot): String? =
        snapshot.board.entries.firstOrNull { (_, piece) -> piece == Piece.gold }?.key

    private fun snapshotForSide(snapshot: GameSnapshot, side: Side): GameSnapshot =
        snapshot.copy(phase = Phase.move, activeSide = side, pendingMove = null)

    private fun cornerSquares(boardSize: Int): List<String> = listOf(
        "a1",
        "a$boardSize",
        "${'a' + (boardSize - 1)}1",
        "${'a' + (boardSize - 1)}$boardSize"
    )

    private fun manhattanDistance(first: String, second: String): Int {
        val firstColumn = first[0] - 'a'
        val secondColumn = second[0] - 'a'
        val firstRow = first.drop(1).toInt() - 1
        val secondRow = second.drop(1).toInt() - 1
        return abs(firstColumn - secondColumn) + abs(firstRow - secondRow)
    }
}
