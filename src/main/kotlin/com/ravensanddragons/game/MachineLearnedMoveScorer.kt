package com.ravensanddragons.game

object MachineLearnedMoveScorer {
    const val supportedModelType = "linear-move-ranker"

    fun score(model: MachineLearnedModel, features: FloatArray): Float {
        require(model.modelType == supportedModelType) {
            "Unsupported machine-learned model type: ${model.modelType}"
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
