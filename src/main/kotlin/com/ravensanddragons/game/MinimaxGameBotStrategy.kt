package com.ravensanddragons.game

fun interface MinimaxSearchObserver {
    fun onNodeEvaluated()
}

private object NoOpMinimaxSearchObserver : MinimaxSearchObserver {
    override fun onNodeEvaluated() = Unit
}

class MinimaxGameBotStrategy(
    private val searchDepth: Int = 2,
    private val searchObserver: MinimaxSearchObserver = NoOpMinimaxSearchObserver
) : GameBotStrategy {
    private data class SearchState(
        val legalMovesBySnapshot: MutableMap<GameSnapshot, List<LegalMove>> = mutableMapOf(),
        val legalMoveCountsBySnapshot: MutableMap<GameSnapshot, Int> = mutableMapOf()
    )

    private data class OrderedMove(
        val move: LegalMove,
        val index: Int,
        val priority: Int,
        val score: Int
    )

    init {
        require(searchDepth >= 1) { "Minimax bot requires a search depth of at least 1." }
    }

    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Minimax bot requires at least one legal move." }

        BotStrategySupport.findImmediateWinningMove(snapshot, legalMoves)?.let { return it }

        val maximizingSide = snapshot.activeSide
        val searchState = SearchState()
        val orderedMoves = orderMoves(snapshot, legalMoves, maximizingSide, searchState)
        var bestMove = orderedMoves.first()
        var bestScore = minimax(
            snapshot = BotStrategySupport.applyMove(snapshot, bestMove),
            depthRemaining = searchDepth - 1,
            maximizingSide = maximizingSide,
            alpha = Int.MIN_VALUE,
            beta = Int.MAX_VALUE,
            searchState = searchState
        )
        var alpha = bestScore

        for (move in orderedMoves.drop(1)) {
            val score = minimax(
                snapshot = BotStrategySupport.applyMove(snapshot, move),
                depthRemaining = searchDepth - 1,
                maximizingSide = maximizingSide,
                alpha = alpha,
                beta = Int.MAX_VALUE,
                searchState = searchState
            )
            if (score > bestScore) {
                bestMove = move
                bestScore = score
            }
            if (score > alpha) {
                alpha = score
            }
        }

        return bestMove
    }

    private fun minimax(
        snapshot: GameSnapshot,
        depthRemaining: Int,
        maximizingSide: Side,
        alpha: Int,
        beta: Int,
        searchState: SearchState
    ): Int {
        searchObserver.onNodeEvaluated()

        BotStrategySupport.terminalScore(snapshot, maximizingSide)?.let { return it }

        if (depthRemaining == 0 || snapshot.phase != Phase.move) {
            return evaluateForSide(snapshot, maximizingSide, searchState)
        }

        val legalMoves = legalMoves(snapshot, searchState)
        if (legalMoves.isEmpty()) {
            return evaluateForSide(snapshot, maximizingSide, searchState)
        }

        return if (snapshot.activeSide == maximizingSide) {
            var bestScore = Int.MIN_VALUE
            var currentAlpha = alpha
            for (move in orderMoves(snapshot, legalMoves, maximizingSide, searchState)) {
                val score = minimax(
                    snapshot = BotStrategySupport.applyMove(snapshot, move),
                    depthRemaining = depthRemaining - 1,
                    maximizingSide = maximizingSide,
                    alpha = currentAlpha,
                    beta = beta,
                    searchState = searchState
                )
                if (score > bestScore) {
                    bestScore = score
                }
                if (score > currentAlpha) {
                    currentAlpha = score
                }
                if (currentAlpha >= beta) {
                    break
                }
            }
            bestScore
        } else {
            var bestScore = Int.MAX_VALUE
            var currentBeta = beta
            for (move in orderMoves(snapshot, legalMoves, maximizingSide, searchState)) {
                val score = minimax(
                    snapshot = BotStrategySupport.applyMove(snapshot, move),
                    depthRemaining = depthRemaining - 1,
                    maximizingSide = maximizingSide,
                    alpha = alpha,
                    beta = currentBeta,
                    searchState = searchState
                )
                if (score < bestScore) {
                    bestScore = score
                }
                if (score < currentBeta) {
                    currentBeta = score
                }
                if (alpha >= currentBeta) {
                    break
                }
            }
            bestScore
        }
    }

    private fun orderMoves(
        snapshot: GameSnapshot,
        legalMoves: List<LegalMove>,
        maximizingSide: Side,
        searchState: SearchState
    ): List<LegalMove> = legalMoves
        .mapIndexed { index, move ->
            val nextSnapshot = BotStrategySupport.applyMove(snapshot, move)
            OrderedMove(
                move = move,
                index = index,
                priority = when {
                    BotStrategySupport.isWinningSnapshotFor(nextSnapshot, snapshot.activeSide) -> 3
                    BotStrategySupport.capturedOpponentCount(snapshot, nextSnapshot, snapshot.activeSide) > 0 -> 2
                    else -> 1
                },
                score = evaluateForSide(nextSnapshot, maximizingSide, searchState)
            )
        }
        .sortedWith(
            compareByDescending<OrderedMove> { it.priority }
                .thenByDescending { if (snapshot.activeSide == maximizingSide) it.score else -it.score }
                .thenBy { it.index }
        )
        .map(OrderedMove::move)

    private fun evaluateForSide(
        snapshot: GameSnapshot,
        maximizingSide: Side,
        searchState: SearchState
    ): Int = BotStrategySupport.evaluateForSide(snapshot, maximizingSide) { evaluatedSnapshot ->
        countLegalMoves(evaluatedSnapshot, searchState)
    }

    private fun legalMoves(snapshot: GameSnapshot, searchState: SearchState): List<LegalMove> =
        searchState.legalMovesBySnapshot.getOrPut(snapshot) { GameRules.getLegalMoves(snapshot) }

    private fun countLegalMoves(snapshot: GameSnapshot, searchState: SearchState): Int =
        searchState.legalMoveCountsBySnapshot.getOrPut(snapshot) { GameRules.countLegalMoves(snapshot) }
}
