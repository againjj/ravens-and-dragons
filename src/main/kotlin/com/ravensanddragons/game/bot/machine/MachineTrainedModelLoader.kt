package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.core.io.Resource
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class MachineTrainedModelLoader(
    private val objectMapper: ObjectMapper
) {
    companion object {
        private const val resourcePattern = "classpath:/bots/machine-trained/*.json"
    }

    fun loadModels(): List<MachineTrainedModel> =
        loadModels(PathMatchingResourcePatternResolver().getResources(resourcePattern).toList())

    internal fun loadModels(resources: List<Resource>): List<MachineTrainedModel> {
        val models = resources
            .sortedBy { it.filename ?: it.description }
            .map { resource -> resource.inputStream.use { input -> objectMapper.readValue(input, MachineTrainedArtifactPayload::class.java) } }
            .map(MachineTrainedArtifactSupport::toModel)

        val duplicateRuleConfigurationId = models
            .groupBy { it.metadata.ruleConfigurationId }
            .entries
            .firstOrNull { (_, groupedModels) -> groupedModels.size > 1 }
            ?.key
        require(duplicateRuleConfigurationId == null) {
            "Duplicate machine-trained artifacts found for $duplicateRuleConfigurationId."
        }

        return models
    }
}
