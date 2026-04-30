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
        private const val resourcePattern = "classpath:/bots/machine-learned/*.json"
    }

    fun loadModels(): List<MachineLearnedModel> =
        loadModels(PathMatchingResourcePatternResolver().getResources(resourcePattern).toList())

    internal fun loadModels(resources: List<Resource>): List<MachineLearnedModel> {
        val models = resources
            .sortedBy { it.filename ?: it.description }
            .map { resource -> resource.inputStream.use { input -> objectMapper.readValue(input, MachineLearnedArtifactPayload::class.java) } }
            .map(MachineLearnedArtifactSupport::toModel)

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
}
