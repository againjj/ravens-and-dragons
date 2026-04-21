package com.dragonsvsravens.game

import org.springframework.stereotype.Component
import java.util.concurrent.ThreadLocalRandom

data class LegalMove(
    val origin: String,
    val destination: String
)

data class BotDefinition(
    val id: String,
    val displayName: String,
    val supportedRuleConfigurationIds: Set<String>,
    val strategy: GameBotStrategy
) {
    fun toSummary(): BotSummary = BotSummary(id = id, displayName = displayName)
}

interface GameBotStrategy {
    fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove
}

interface RandomIndexSource {
    fun nextInt(bound: Int): Int
}

@Component
class ThreadLocalRandomIndexSource : RandomIndexSource {
    override fun nextInt(bound: Int): Int = ThreadLocalRandom.current().nextInt(bound)
}

class RandomGameBotStrategy(
    private val randomIndexSource: RandomIndexSource
) : GameBotStrategy {
    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Random bot requires at least one legal move." }
        return legalMoves[randomIndexSource.nextInt(legalMoves.size)]
    }
}

@Component
class BotRegistry(
    randomIndexSource: RandomIndexSource
) {
    companion object {
        const val randomBotId = "random"
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
            displayName = "Random",
            supportedRuleConfigurationIds = releaseTwoSupportedRuleConfigurationIds,
            strategy = RandomGameBotStrategy(randomIndexSource)
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
