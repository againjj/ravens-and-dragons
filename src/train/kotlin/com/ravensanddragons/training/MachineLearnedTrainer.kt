package com.ravensanddragons.training

import com.ravensanddragons.game.MachineLearnedFeatureEncoder
import com.ravensanddragons.game.MachineLearnedModel
import com.ravensanddragons.game.MachineLearnedModelMetadata
import com.ravensanddragons.game.MachineLearnedMoveScorer
import com.ravensanddragons.game.MachineLearnedRegistry
import com.ravensanddragons.game.MachineLearnedTrainingSummary
import java.time.Clock

class MachineLearnedTrainer(
    private val clock: Clock = Clock.systemUTC(),
    private val progressListener: TrainingProgressListener = TrainingProgressListener { _, _ -> }
) {
    companion object {
        private const val trainingEpochs = 12
        private const val learningRate = 0.1f
        private const val margin = 0.1f
        private const val minScale = 1e-6f
    }

    fun train(dataset: MachineLearnedDataset): MachineLearnedModel {
        require(dataset.examples.isNotEmpty()) {
            "Machine-learned training requires at least one example."
        }
        require(dataset.examples.all { it.ruleConfigurationId == dataset.ruleConfigurationId }) {
            "Machine-learned training dataset mixed rule configurations."
        }
        require(dataset.examples.all { it.featureSchemaVersion == dataset.featureSchemaVersion }) {
            "Machine-learned training dataset mixed feature schema versions."
        }

        val positiveExamples = dataset.examples.filter { it.label > 0.5f }
        val negativeExamples = dataset.examples.filter { it.label <= 0.5f }
        require(positiveExamples.isNotEmpty()) {
            "Machine-learned training requires at least one positive example."
        }
        require(negativeExamples.isNotEmpty()) {
            "Machine-learned training requires at least one negative example."
        }

        val examplesByPosition = dataset.examples.groupBy(TrainingExample::positionKey)
        require(examplesByPosition.values.all { positionExamples -> positionExamples.count { it.label > 0.5f } == 1 }) {
            "Machine-learned training requires exactly one positive example per position."
        }

        val featureScales = featureScales(dataset.examples)
        val weights = trainRankingWeights(examplesByPosition, featureScales)

        return MachineLearnedModel(
            metadata = MachineLearnedModelMetadata(
                botId = MachineLearnedRegistry.botId,
                displayName = MachineLearnedRegistry.displayName,
                ruleConfigurationId = dataset.ruleConfigurationId,
                featureSchemaVersion = dataset.featureSchemaVersion,
                modelFormatVersion = MachineLearnedModel.supportedModelFormatVersion,
                trainedAt = clock.instant()
            ),
            modelType = MachineLearnedMoveScorer.supportedModelType,
            bias = 0f,
            weights = weights,
            trainingSummary = MachineLearnedTrainingSummary(
                expertBotId = dataset.expertBotId,
                positions = positiveExamples.size,
                selfPlayGames = dataset.selfPlayGames
            )
        )
    }

    private fun trainRankingWeights(
        examplesByPosition: Map<String, List<TrainingExample>>,
        featureScales: FloatArray
    ): List<Float> {
        val scaledWeights = FloatArray(MachineLearnedFeatureEncoder.featureCount)
        val averagedWeights = FloatArray(MachineLearnedFeatureEncoder.featureCount)
        var updateCount = 0

        repeat(trainingEpochs) { epochIndex ->
            examplesByPosition.entries
                .sortedBy { (positionKey) -> positionKey }
                .forEach { (_, positionExamples) ->
                    val positive = positionExamples.first { it.label > 0.5f }
                    val negatives = positionExamples.filter { it.label <= 0.5f }
                    negatives.forEach { negative ->
                        val positiveScaled = scaledFeatures(positive, featureScales)
                        val negativeScaled = scaledFeatures(negative, featureScales)
                        val positiveScore = dotProduct(scaledWeights, positiveScaled)
                        val negativeScore = dotProduct(scaledWeights, negativeScaled)
                        if (positiveScore <= negativeScore + margin) {
                            for (index in scaledWeights.indices) {
                                scaledWeights[index] += learningRate * (positiveScaled[index] - negativeScaled[index])
                                averagedWeights[index] += scaledWeights[index]
                            }
                            updateCount += 1
                        }
                    }
                }
            progressListener.report(epochIndex + 1, trainingEpochs)
        }

        val finalScaledWeights = if (updateCount == 0) scaledWeights else averagedWeights.map { it / updateCount }.toFloatArray()
        return finalScaledWeights.indices.map { index -> finalScaledWeights[index] / featureScales[index] }
    }

    private fun featureScales(examples: List<TrainingExample>): FloatArray {
        val means = FloatArray(MachineLearnedFeatureEncoder.featureCount)
        val variances = FloatArray(MachineLearnedFeatureEncoder.featureCount)

        examples.forEach { example ->
            validateFeatureCount(example)
            example.features.forEachIndexed { index, value ->
                means[index] += value
            }
        }
        means.indices.forEach { index ->
            means[index] /= examples.size
        }
        examples.forEach { example ->
            example.features.forEachIndexed { index, value ->
                val centered = value - means[index]
                variances[index] += centered * centered
            }
        }

        return variances.indices.map { index ->
            val stddev = kotlin.math.sqrt((variances[index] / examples.size).toDouble()).toFloat()
            maxOf(stddev, minScale)
        }.toFloatArray()
    }

    private fun scaledFeatures(example: TrainingExample, featureScales: FloatArray): FloatArray {
        validateFeatureCount(example)
        return example.features
            .mapIndexed { index, value -> value / featureScales[index] }
            .toFloatArray()
    }

    private fun dotProduct(weights: FloatArray, features: FloatArray): Float {
        var total = 0f
        for (index in weights.indices) {
            total += weights[index] * features[index]
        }
        return total
    }

    private fun validateFeatureCount(example: TrainingExample) {
        require(example.features.size == MachineLearnedFeatureEncoder.featureCount) {
            "Training example feature count ${example.features.size} does not match encoder feature count ${MachineLearnedFeatureEncoder.featureCount}."
        }
    }
}
