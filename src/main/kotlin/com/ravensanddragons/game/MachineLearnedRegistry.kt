package com.ravensanddragons.game

class MachineLearnedRegistry(
    models: Collection<MachineLearnedModel>
) {
    companion object {
        const val botId = "machine-learned"
        const val displayName = "Michelle"

        fun from(loader: MachineLearnedModelLoader): MachineLearnedRegistry =
            MachineLearnedRegistry(loader.loadModels())

        fun empty(): MachineLearnedRegistry = MachineLearnedRegistry(emptyList())
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
                    strategy = MachineLearnedBotStrategy(modelsByRuleConfigurationId)
                )
            )
        }
}
