package com.ravensanddragons.game.bot

import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


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
