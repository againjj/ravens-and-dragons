package com.dragonsvsravens.game

import org.springframework.stereotype.Component
import java.util.concurrent.ThreadLocalRandom
import kotlin.math.abs

data class LegalMove(
    val origin: String,
    val destination: String
)

data class BotDefinition(
    val id: String,
    val displayName: String,
    val supportedRuleConfigurationIds: Set<String>,
    val strategy: GameBotStrategy
) {
    fun toSummary(): BotSummary = BotSummary(id = id, displayName = displayName)
}

interface GameBotStrategy {
    fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove
}

interface RandomIndexSource {
    fun nextInt(bound: Int): Int
}

@Component
class ThreadLocalRandomIndexSource : RandomIndexSource {
    override fun nextInt(bound: Int): Int = ThreadLocalRandom.current().nextInt(bound)
}

class RandomGameBotStrategy(
    private val randomIndexSource: RandomIndexSource
) : GameBotStrategy {
    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Random bot requires at least one legal move." }
        return legalMoves[randomIndexSource.nextInt(legalMoves.size)]
    }
}

class SimpleGameBotStrategy : GameBotStrategy {
    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Simple bot requires at least one legal move." }

        val winningMove = BotStrategySupport.findImmediateWinningMove(snapshot, legalMoves)
        if (winningMove != null) {
            return winningMove
        }

        var bestMove = legalMoves.first()
        var bestScore = scoreMove(snapshot, bestMove)

        legalMoves.drop(1).forEach { move ->
            val score = scoreMove(snapshot, move)
            if (score > bestScore) {
                bestMove = move
                bestScore = score
            }
        }

        return bestMove
    }

    private fun scoreMove(snapshot: GameSnapshot, move: LegalMove): Int {
        val nextSnapshot = BotStrategySupport.applyMove(snapshot, move)
        val mover = snapshot.activeSide
        val opponent = BotStrategySupport.oppositeSide(mover)

        var score = 0
        score += BotStrategySupport.capturedOpponentCount(snapshot, nextSnapshot, mover) * 100
        score += BotStrategySupport.evaluateForSide(nextSnapshot, mover)
        if (BotStrategySupport.hasImmediateWinningMove(nextSnapshot, opponent)) {
            score -= 150
        }
        return score
    }
}

class MinimaxGameBotStrategy(
    private val searchDepth: Int = 2
) : GameBotStrategy {
    init {
        require(searchDepth >= 1) { "Minimax bot requires a search depth of at least 1." }
    }

    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Minimax bot requires at least one legal move." }

        val maximizingSide = snapshot.activeSide
        var bestMove = legalMoves.first()
        var bestScore = minimax(
            snapshot = BotStrategySupport.applyMove(snapshot, bestMove),
            depthRemaining = searchDepth - 1,
            maximizingSide = maximizingSide
        )

        legalMoves.drop(1).forEach { move ->
            val score = minimax(
                snapshot = BotStrategySupport.applyMove(snapshot, move),
                depthRemaining = searchDepth - 1,
                maximizingSide = maximizingSide
            )
            if (score > bestScore) {
                bestMove = move
                bestScore = score
            }
        }

        return bestMove
    }

    private fun minimax(
        snapshot: GameSnapshot,
        depthRemaining: Int,
        maximizingSide: Side
    ): Int {
        BotStrategySupport.terminalScore(snapshot, maximizingSide)?.let { return it }

        if (depthRemaining == 0 || snapshot.phase != Phase.move) {
            return BotStrategySupport.evaluateForSide(snapshot, maximizingSide)
        }

        val legalMoves = GameRules.getLegalMoves(snapshot)
        if (legalMoves.isEmpty()) {
            return BotStrategySupport.evaluateForSide(snapshot, maximizingSide)
        }

        return if (snapshot.activeSide == maximizingSide) {
            var bestScore = Int.MIN_VALUE
            legalMoves.forEach { move ->
                val score = minimax(
                    snapshot = BotStrategySupport.applyMove(snapshot, move),
                    depthRemaining = depthRemaining - 1,
                    maximizingSide = maximizingSide
                )
                if (score > bestScore) {
                    bestScore = score
                }
            }
            bestScore
        } else {
            var bestScore = Int.MAX_VALUE
            legalMoves.forEach { move ->
                val score = minimax(
                    snapshot = BotStrategySupport.applyMove(snapshot, move),
                    depthRemaining = depthRemaining - 1,
                    maximizingSide = maximizingSide
                )
                if (score < bestScore) {
                    bestScore = score
                }
            }
            bestScore
        }
    }
}

private object BotStrategySupport {
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
        terminalScore(snapshot, perspectiveSide)?.let { return it }

        val weights = evaluationWeights(snapshot.ruleConfigurationId)
        val opponent = oppositeSide(perspectiveSide)

        var score = 0
        score += (countPiecesForSide(snapshot, perspectiveSide) - countPiecesForSide(snapshot, opponent)) * weights.material
        score += (mobilityScore(snapshot, perspectiveSide) - mobilityScore(snapshot, opponent)) * weights.mobility

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

    fun applyMove(snapshot: GameSnapshot, move: LegalMove): GameSnapshot =
        GameRules.movePiece(snapshot, move.origin, move.destination)

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

    private fun mobilityScore(snapshot: GameSnapshot, side: Side): Int =
        GameRules.getLegalMoves(snapshotForSide(snapshot, side)).size

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

    private fun goldCornerDistance(snapshot: GameSnapshot): Int {
        val goldSquare = goldSquare(snapshot) ?: return 0
        return cornerSquares(snapshot.boardSize).minOf { corner -> manhattanDistance(goldSquare, corner) }
    }

    private fun ravenPressure(snapshot: GameSnapshot): Int {
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

@Component
class BotRegistry(
    randomIndexSource: RandomIndexSource
) {
    companion object {
        const val randomBotId = "random"
        const val simpleBotId = "simple"
        const val minimaxBotId = "minimax"
        val releaseTwoSupportedRuleConfigurationIds = setOf(
            "original-game",
            "sherwood-rules",
            "square-one",
            "sherwood-x-9",
            "square-one-x-9"
        )
    }

    private val definitions = linkedMapOf(
        randomBotId to BotDefinition(
            id = randomBotId,
            displayName = "Randall",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = RandomGameBotStrategy(randomIndexSource)
        ),
        simpleBotId to BotDefinition(
            id = simpleBotId,
            displayName = "Simon",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = SimpleGameBotStrategy()
        ),
        minimaxBotId to BotDefinition(
            id = minimaxBotId,
            displayName = "Maxine",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = MinimaxGameBotStrategy()
        )
    )

    fun availableBotsFor(ruleConfigurationId: String): List<BotSummary> =
        definitions.values
            .filter { ruleConfigurationId in it.supportedRuleConfigurationIds }
            .map(BotDefinition::toSummary)

    fun summaryFor(botId: String?): BotSummary? =
        botId?.let { requireDefinition(it).toSummary() }

    fun requireSupportedDefinition(botId: String, ruleConfigurationId: String): BotDefinition {
        val definition = requireDefinition(botId)
        if (ruleConfigurationId !in definition.supportedRuleConfigurationIds) {
            throw InvalidCommandException("${definition.displayName} is not available for this rule configuration.")
        }
        return definition
    }

    private fun requireDefinition(botId: String): BotDefinition =
        definitions[botId] ?: throw InvalidCommandException("Unknown bot: $botId")
}
