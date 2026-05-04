package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


object MachineTrainedMoveScorer {
    const val supportedModelType = "side-specialized-linear-move-ranker"

    fun score(context: MachineTrainedFeatureEncoder.ScoringContext, features: FloatArray): Float =
        score(context.bias, context.weights, features)

    fun score(model: MachineTrainedModel, activeSide: Side, features: FloatArray): Float {
        require(model.modelType == supportedModelType) {
            "Unsupported machine-trained model type: ${model.modelType}"
        }
        val weights = when (activeSide) {
            Side.dragons -> model.dragonWeights
            Side.ravens -> model.ravenWeights
        }
        require(features.size == weights.size) {
            "Feature vector size ${features.size} does not match weight count ${weights.size}."
        }

        return score(model.bias, weights, features)
    }

    private fun score(bias: Float, weights: List<Float>, features: FloatArray): Float {
        var total = bias
        for (index in features.indices) {
            total += weights[index] * features[index]
        }
        return total
    }
}
