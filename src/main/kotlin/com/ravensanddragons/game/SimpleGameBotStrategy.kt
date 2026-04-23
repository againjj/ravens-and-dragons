package com.ravensanddragons.game

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
