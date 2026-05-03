package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


class MachineTrainedBotStrategy(
    private val modelsByRuleConfigurationId: Map<String, MachineTrainedModel>
) : GameBotStrategy {
    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Machine-trained bot requires at least one legal move." }
        val model = requireNotNull(modelsByRuleConfigurationId[snapshot.ruleConfigurationId]) {
            "Machine-trained bot does not support ${snapshot.ruleConfigurationId}."
        }

        BotStrategySupport.findImmediateWinningMove(snapshot, legalMoves)?.let { return it }

        var bestMove = legalMoves.first()
        var bestScore = scoreMove(snapshot, bestMove, model)

        for (index in 1 until legalMoves.size) {
            val move = legalMoves[index]
            val score = scoreMove(snapshot, move, model)
            if (score > bestScore) {
                bestMove = move
                bestScore = score
            }
        }

        return bestMove
    }

    private fun scoreMove(snapshot: GameSnapshot, move: LegalMove, model: MachineTrainedModel): Float {
        val nextSnapshot = BotStrategySupport.applyMove(snapshot, move)
        val features = MachineTrainedFeatureEncoder.encode(snapshot, move, nextSnapshot)
        return MachineTrainedMoveScorer.score(model, snapshot.activeSide, features)
    }
}
