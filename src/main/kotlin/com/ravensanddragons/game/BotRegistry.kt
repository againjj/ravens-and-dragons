package com.ravensanddragons.game

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component

@Component
class BotRegistry internal constructor(
    randomIndexSource: RandomIndexSource,
    machineLearnedRegistry: MachineLearnedRegistry
) {
    @Autowired
    constructor(
        randomIndexSource: RandomIndexSource,
        machineLearnedModelLoader: MachineLearnedModelLoader
    ) : this(randomIndexSource, MachineLearnedRegistry.from(machineLearnedModelLoader))

    constructor(randomIndexSource: RandomIndexSource) : this(randomIndexSource, MachineLearnedRegistry.empty())

    companion object {
        const val randomBotId = "random"
        const val simpleBotId = "simple"
        const val minimaxBotId = "minimax"
        const val deepMinimaxBotId = "deep-minimax"
        const val machineLearnedBotId = "machine-learned"
        val releaseTwoSupportedRuleConfigurationIds = setOf(
            "original-game",
            "sherwood-rules",
            "square-one",
            "sherwood-x-9",
            "square-one-x-9"
        )
    }

    private val definitions = linkedMapOf(
        randomBotId to BotDefinition(
            id = randomBotId,
            displayName = "Randall",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = RandomGameBotStrategy(randomIndexSource)
        ),
        simpleBotId to BotDefinition(
            id = simpleBotId,
            displayName = "Simon",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = SimpleGameBotStrategy()
        ),
        minimaxBotId to BotDefinition(
            id = minimaxBotId,
            displayName = "Maxine",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = MinimaxGameBotStrategy()
        ),
        deepMinimaxBotId to BotDefinition(
            id = deepMinimaxBotId,
            displayName = "Alphie",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = AlphaBetaGameBotStrategy(searchDepth = 4)
        )
    ).apply {
        putAll(machineLearnedRegistry.botDefinitions())
    }

    fun availableBotsFor(ruleConfigurationId: String): List<BotSummary> =
        definitions.values
            .filter { ruleConfigurationId in it.supportedRuleConfigurationIds }
            .map(BotDefinition::toSummary)

    fun summaryFor(botId: String?): BotSummary? =
        botId?.let { requireDefinition(it).toSummary() }

    fun requireSupportedDefinition(botId: String, ruleConfigurationId: String): BotDefinition {
        val definition = requireDefinition(botId)
        if (ruleConfigurationId !in definition.supportedRuleConfigurationIds) {
            throw InvalidCommandException("${definition.displayName} is not available for this rule configuration.")
        }
        return definition
    }

    private fun requireDefinition(botId: String): BotDefinition =
        definitions[botId] ?: throw InvalidCommandException("Unknown bot: $botId")
}
