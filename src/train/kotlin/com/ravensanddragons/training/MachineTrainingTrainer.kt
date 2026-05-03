package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import java.time.Clock

class MachineTrainedTrainer(
    private val clock: Clock = Clock.systemUTC(),
    private val progressListener: TrainingProgressListener = TrainingProgressListener { _, _ -> }
) {
    companion object {
        private const val trainingEpochs = 12
        private const val learningRate = 0.1f
        private const val margin = 0.1f
        private const val minScale = 1e-6f
    }

    fun train(dataset: MachineTrainedDataset): MachineTrainedModel {
        require(dataset.examples.isNotEmpty()) {
            "Machine training requires at least one example."
        }
        require(dataset.examples.all { it.ruleConfigurationId == dataset.ruleConfigurationId }) {
            "Machine training dataset mixed rule configurations."
        }
        require(dataset.examples.all { it.featureSchemaVersion == dataset.featureSchemaVersion }) {
            "Machine training dataset mixed feature schema versions."
        }

        val positiveExamples = dataset.examples.filter { it.label > 0.5f }
        val negativeExamples = dataset.examples.filter { it.label <= 0.5f }
        require(positiveExamples.isNotEmpty()) {
            "Machine training requires at least one positive example."
        }
        require(negativeExamples.isNotEmpty()) {
            "Machine training requires at least one negative example."
        }

        val examplesByPosition = dataset.examples.groupBy(TrainingExample::positionKey)
        require(examplesByPosition.values.all { positionExamples -> positionExamples.count { it.label > 0.5f } == 1 }) {
            "Machine training requires exactly one positive example per position."
        }

        val featureScales = featureScales(dataset.examples)
        val sideWeights = trainRankingWeights(examplesByPosition, featureScales)

        return MachineTrainedModel(
            metadata = MachineTrainedModelMetadata(
                botId = MachineTrainedRegistry.botId,
                displayName = MachineTrainedRegistry.displayName,
                ruleConfigurationId = dataset.ruleConfigurationId,
                featureSchemaVersion = dataset.featureSchemaVersion,
                modelFormatVersion = MachineTrainedModel.supportedModelFormatVersion,
                trainedAt = clock.instant()
            ),
            modelType = MachineTrainedMoveScorer.supportedModelType,
            bias = 0f,
            dragonWeights = sideWeights.dragonWeights,
            ravenWeights = sideWeights.ravenWeights,
            trainingSummary = MachineTrainingSummary(
                expertBotId = dataset.expertBotId,
                positions = positiveExamples.size,
                selfPlayGames = dataset.selfPlayGames
            )
        )
    }

    private fun trainRankingWeights(
        examplesByPosition: Map<String, List<TrainingExample>>,
        featureScales: FloatArray
    ): SideTrainedWeights {
        val dragon = TrainableWeights()
        val raven = TrainableWeights()

        repeat(trainingEpochs) { epochIndex ->
            examplesByPosition.entries
                .sortedBy { (positionKey) -> positionKey }
                .forEach { (_, positionExamples) ->
                    val activeSide = positionExamples.first().activeSide
                    require(positionExamples.all { it.activeSide == activeSide }) {
                        "Machine training requires each position to contain one active side."
                    }
                    val trainableWeights = when (activeSide) {
                        Side.dragons -> dragon
                        Side.ravens -> raven
                    }
                    val positive = positionExamples.first { it.label > 0.5f }
                    val negatives = positionExamples.filter { it.label <= 0.5f }
                    negatives.forEach { negative ->
                        val positiveScaled = scaledFeatures(positive, featureScales)
                        val negativeScaled = scaledFeatures(negative, featureScales)
                        val positiveScore = dotProduct(trainableWeights.scaled, positiveScaled)
                        val negativeScore = dotProduct(trainableWeights.scaled, negativeScaled)
                        if (positiveScore <= negativeScore + margin) {
                            for (index in trainableWeights.scaled.indices) {
                                trainableWeights.scaled[index] += learningRate * (positiveScaled[index] - negativeScaled[index])
                                trainableWeights.averaged[index] += trainableWeights.scaled[index]
                            }
                            trainableWeights.updateCount += 1
                        }
                    }
                }
            progressListener.report(epochIndex + 1, trainingEpochs)
        }

        return SideTrainedWeights(
            dragonWeights = unscale(dragon, featureScales),
            ravenWeights = unscale(raven, featureScales)
        )
    }

    private fun unscale(trainableWeights: TrainableWeights, featureScales: FloatArray): List<Float> {
        val finalScaledWeights = if (trainableWeights.updateCount == 0) {
            trainableWeights.scaled
        } else {
            trainableWeights.averaged.map { it / trainableWeights.updateCount }.toFloatArray()
        }
        return finalScaledWeights.indices.map { index -> finalScaledWeights[index] / featureScales[index] }
    }

    private fun featureScales(examples: List<TrainingExample>): FloatArray {
        val means = FloatArray(MachineTrainedFeatureEncoder.featureCount)
        val variances = FloatArray(MachineTrainedFeatureEncoder.featureCount)

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
        require(example.features.size == MachineTrainedFeatureEncoder.featureCount) {
            "Training example feature count ${example.features.size} does not match encoder feature count ${MachineTrainedFeatureEncoder.featureCount}."
        }
    }

    private class TrainableWeights {
        val scaled = FloatArray(MachineTrainedFeatureEncoder.featureCount)
        val averaged = FloatArray(MachineTrainedFeatureEncoder.featureCount)
        var updateCount = 0
    }

    private data class SideTrainedWeights(
        val dragonWeights: List<Float>,
        val ravenWeights: List<Float>
    )
}
