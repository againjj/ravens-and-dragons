package com.ravensanddragons.game.bot

import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component

@Component
class BotRegistry internal constructor(
    randomIndexSource: RandomIndexSource,
    machineTrainedRegistry: MachineTrainedRegistry
) {
    @Autowired
    constructor(
        randomIndexSource: RandomIndexSource,
        machineTrainedModelLoader: MachineTrainedModelLoader
    ) : this(randomIndexSource, MachineTrainedRegistry.from(machineTrainedModelLoader))

    constructor(randomIndexSource: RandomIndexSource) : this(randomIndexSource, MachineTrainedRegistry.empty())

    companion object {
        const val randomBotId = "random"
        const val simpleBotId = "simple"
        const val minimaxBotId = "minimax"
        const val deepMinimaxBotId = "deep-minimax"
        const val machineTrainedBotId = "machine-trained"
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
        putAll(machineTrainedRegistry.botDefinitions())
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
