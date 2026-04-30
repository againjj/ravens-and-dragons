package com.ravensanddragons.game

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.core.io.Resource
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class MachineLearnedModelLoader(
    private val objectMapper: ObjectMapper
) {
    companion object {
        private const val supportedModelFormatVersion = 1
        private const val resourcePattern = "classpath:/bots/machine-learned/*.json"
    }

    fun loadModels(): List<MachineLearnedModel> =
        loadModels(PathMatchingResourcePatternResolver().getResources(resourcePattern).toList())

    internal fun loadModels(resources: List<Resource>): List<MachineLearnedModel> {
        val models = resources
            .sortedBy { it.filename ?: it.description }
            .map { resource -> resource.inputStream.use { input -> objectMapper.readValue(input, ArtifactPayload::class.java) } }
            .map(::toModel)

        val duplicateRuleConfigurationId = models
            .groupBy { it.metadata.ruleConfigurationId }
            .entries
            .firstOrNull { (_, groupedModels) -> groupedModels.size > 1 }
            ?.key
        require(duplicateRuleConfigurationId == null) {
            "Duplicate machine-learned artifacts found for $duplicateRuleConfigurationId."
        }

        return models
    }

    private fun toModel(payload: ArtifactPayload): MachineLearnedModel {
        require(payload.botId == MachineLearnedRegistry.botId) {
            "Machine-learned artifact botId must be ${MachineLearnedRegistry.botId}."
        }
        require(payload.displayName == MachineLearnedRegistry.displayName) {
            "Machine-learned artifact displayName must be ${MachineLearnedRegistry.displayName}."
        }
        require(payload.ruleConfigurationId.isNotBlank()) {
            "Machine-learned artifact ruleConfigurationId must be non-empty."
        }
        require(payload.modelFormatVersion == supportedModelFormatVersion) {
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

    private data class ArtifactPayload(
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
}
