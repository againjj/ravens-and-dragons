package com.ravensanddragons.game

import java.time.Instant

data class MachineLearnedArtifactPayload(
    val botId: String,
    val displayName: String,
    val modelFormatVersion: Int,
    val featureSchemaVersion: Int,
    val ruleConfigurationId: String,
    val trainedAt: Instant,
    val trainingSummary: MachineLearnedTrainingSummary? = null,
    val modelType: String,
    val bias: Float,
    val weights: List<Float>
)

object MachineLearnedArtifactSupport {
    fun validate(payload: MachineLearnedArtifactPayload) {
        require(payload.botId == MachineLearnedRegistry.botId) {
            "Machine-learned artifact botId must be ${MachineLearnedRegistry.botId}."
        }
        require(payload.displayName == MachineLearnedRegistry.displayName) {
            "Machine-learned artifact displayName must be ${MachineLearnedRegistry.displayName}."
        }
        require(payload.ruleConfigurationId.isNotBlank()) {
            "Machine-learned artifact ruleConfigurationId must be non-empty."
        }
        require(payload.modelFormatVersion == MachineLearnedModel.supportedModelFormatVersion) {
            "Unsupported machine-learned model format version: ${payload.modelFormatVersion}."
        }
        require(payload.featureSchemaVersion == MachineLearnedFeatureEncoder.schemaVersion) {
            "Unsupported machine-learned feature schema version: ${payload.featureSchemaVersion}."
        }
        require(payload.modelType == MachineLearnedMoveScorer.supportedModelType) {
            "Unsupported machine-learned model type: ${payload.modelType}."
        }
        require(payload.weights.size == MachineLearnedFeatureEncoder.featureCount) {
            "Machine-learned artifact weight count ${payload.weights.size} does not match feature count ${MachineLearnedFeatureEncoder.featureCount}."
        }
    }

    fun toModel(payload: MachineLearnedArtifactPayload): MachineLearnedModel {
        validate(payload)
        return MachineLearnedModel(
            metadata = MachineLearnedModelMetadata(
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

    fun toPayload(model: MachineLearnedModel): MachineLearnedArtifactPayload =
        MachineLearnedArtifactPayload(
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
