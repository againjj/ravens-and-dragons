package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


class MachineTrainedRegistry(
    models: Collection<MachineTrainedModel>
) {
    companion object {
        const val botId = "machine-trained"
        const val displayName = "Michelle"

        fun from(loader: MachineTrainedModelLoader): MachineTrainedRegistry =
            MachineTrainedRegistry(loader.loadModels())

        fun empty(): MachineTrainedRegistry = MachineTrainedRegistry(emptyList())
    }

    private val modelsByRuleConfigurationId = models.associateBy { it.metadata.ruleConfigurationId }

    fun botDefinitions(): Map<String, BotDefinition> =
        if (modelsByRuleConfigurationId.isEmpty()) {
            emptyMap()
        } else {
            mapOf(
                botId to BotDefinition(
                    id = botId,
                    displayName = displayName,
                    supportedRuleConfigurationIds = modelsByRuleConfigurationId.keys,
                    strategy = MachineTrainedBotStrategy(modelsByRuleConfigurationId)
                )
            )
        }
}
