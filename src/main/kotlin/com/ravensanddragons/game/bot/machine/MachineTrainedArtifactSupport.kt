package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import java.time.Instant

data class MachineTrainedArtifactPayload(
    val botId: String,
    val displayName: String,
    val modelFormatVersion: Int,
    val featureSchemaVersion: Int,
    val ruleConfigurationId: String,
    val trainedAt: Instant,
    val trainingSummary: MachineTrainingSummary,
    val modelType: String,
    val bias: Float,
    val weights: List<Float>
)

object MachineTrainedArtifactSupport {
    fun validate(payload: MachineTrainedArtifactPayload) {
        require(payload.botId == MachineTrainedRegistry.botId) {
            "Machine-trained artifact botId must be ${MachineTrainedRegistry.botId}."
        }
        require(payload.displayName == MachineTrainedRegistry.displayName) {
            "Machine-trained artifact displayName must be ${MachineTrainedRegistry.displayName}."
        }
        require(payload.ruleConfigurationId.isNotBlank()) {
            "Machine-trained artifact ruleConfigurationId must be non-empty."
        }
        require(payload.modelFormatVersion == MachineTrainedModel.supportedModelFormatVersion) {
            "Unsupported machine-trained model format version: ${payload.modelFormatVersion}."
        }
        require(payload.featureSchemaVersion == MachineTrainedFeatureEncoder.schemaVersion) {
            "Unsupported machine-trained feature schema version: ${payload.featureSchemaVersion}."
        }
        require(payload.modelType == MachineTrainedMoveScorer.supportedModelType) {
            "Unsupported machine-trained model type: ${payload.modelType}."
        }
        require(payload.weights.size == MachineTrainedFeatureEncoder.featureCount) {
            "Machine-trained artifact weight count ${payload.weights.size} does not match feature count ${MachineTrainedFeatureEncoder.featureCount}."
        }
    }

    fun toModel(payload: MachineTrainedArtifactPayload): MachineTrainedModel {
        validate(payload)
        return MachineTrainedModel(
            metadata = MachineTrainedModelMetadata(
                botId = payload.botId,
                displayName = payload.displayName,
                ruleConfigurationId = payload.ruleConfigurationId,
                featureSchemaVersion = payload.featureSchemaVersion,
                modelFormatVersion = payload.modelFormatVersion,
                trainedAt = payload.trainedAt
            ),
            modelType = payload.modelType,
            bias = payload.bias,
            weights = payload.weights,
            trainingSummary = payload.trainingSummary
        )
    }

    fun toPayload(model: MachineTrainedModel): MachineTrainedArtifactPayload =
        MachineTrainedArtifactPayload(
            botId = model.metadata.botId,
            displayName = model.metadata.displayName,
            modelFormatVersion = model.metadata.modelFormatVersion,
            featureSchemaVersion = model.metadata.featureSchemaVersion,
            ruleConfigurationId = model.metadata.ruleConfigurationId,
            trainedAt = model.metadata.trainedAt,
            trainingSummary = model.trainingSummary,
            modelType = model.modelType,
            bias = model.bias,
            weights = model.weights
        )
}
