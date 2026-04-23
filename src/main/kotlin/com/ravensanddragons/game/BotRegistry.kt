package com.ravensanddragons.game

import org.springframework.stereotype.Component

@Component
class BotRegistry(
    randomIndexSource: RandomIndexSource
) {
    companion object {
        const val randomBotId = "random"
        const val simpleBotId = "simple"
        const val minimaxBotId = "minimax"
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
        )
    )

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
