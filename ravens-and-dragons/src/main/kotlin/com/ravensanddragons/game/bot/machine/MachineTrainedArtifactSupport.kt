package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant

@JsonInclude(JsonInclude.Include.NON_NULL)
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
    val featureNames: List<String>,
    val dragonWeights: List<Float>,
    val ravenWeights: List<Float>,
    val weights: List<Float>? = null
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
        require(payload.featureNames == MachineTrainedFeatureEncoder.featureNames) {
            "Machine-trained artifact feature names do not match schema ${MachineTrainedFeatureEncoder.schemaVersion}."
        }
        require(payload.dragonWeights.size == MachineTrainedFeatureEncoder.featureCount) {
            "Machine-trained artifact dragon weight count ${payload.dragonWeights.size} does not match feature count ${MachineTrainedFeatureEncoder.featureCount}."
        }
        require(payload.ravenWeights.size == MachineTrainedFeatureEncoder.featureCount) {
            "Machine-trained artifact raven weight count ${payload.ravenWeights.size} does not match feature count ${MachineTrainedFeatureEncoder.featureCount}."
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
            dragonWeights = payload.dragonWeights,
            ravenWeights = payload.ravenWeights,
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
            featureNames = MachineTrainedFeatureEncoder.featureNames,
            dragonWeights = model.dragonWeights,
            ravenWeights = model.ravenWeights
        )
}
