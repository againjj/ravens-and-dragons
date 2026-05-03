package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


object MachineTrainedMoveScorer {
    const val supportedModelType = "linear-move-ranker"

    fun score(model: MachineTrainedModel, features: FloatArray): Float {
        require(model.modelType == supportedModelType) {
            "Unsupported machine-trained model type: ${model.modelType}"
        }
        require(features.size == model.weights.size) {
            "Feature vector size ${features.size} does not match weight count ${model.weights.size}."
        }

        var total = model.bias
        for (index in features.indices) {
            total += model.weights[index] * features[index]
        }
        return total
    }
}
