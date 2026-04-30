package com.ravensanddragons.training

import com.ravensanddragons.game.MachineLearnedFeatureEncoder
import com.ravensanddragons.game.MachineLearnedModel
import com.ravensanddragons.game.MachineLearnedModelMetadata
import com.ravensanddragons.game.MachineLearnedMoveScorer
import com.ravensanddragons.game.MachineLearnedRegistry
import com.ravensanddragons.game.MachineLearnedTrainingSummary
import java.time.Clock

class MachineLearnedTrainer(
    private val clock: Clock = Clock.systemUTC()
) {
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

        val positiveAverage = averageFeatures(positiveExamples)
        val negativeAverage = averageFeatures(negativeExamples)
        val weights = positiveAverage.indices.map { index -> positiveAverage[index] - negativeAverage[index] }

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

    private fun averageFeatures(examples: List<TrainingExample>): FloatArray {
        val totals = FloatArray(MachineLearnedFeatureEncoder.featureCount)
        examples.forEach { example ->
            require(example.features.size == MachineLearnedFeatureEncoder.featureCount) {
                "Training example feature count ${example.features.size} does not match encoder feature count ${MachineLearnedFeatureEncoder.featureCount}."
            }
            example.features.forEachIndexed { index, value ->
                totals[index] += value
            }
        }
        return totals.map { it / examples.size }.toFloatArray()
    }
}
