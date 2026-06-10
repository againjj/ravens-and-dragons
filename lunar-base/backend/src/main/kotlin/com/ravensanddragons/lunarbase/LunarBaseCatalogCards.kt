package com.ravensanddragons.lunarbase

import com.ravensanddragons.lunarbase.cards.LunarBaseAchievement
import com.ravensanddragons.lunarbase.cards.LunarBaseCardColor
import com.ravensanddragons.lunarbase.cards.LunarBaseCardDefinition
import com.ravensanddragons.lunarbase.cards.LunarBaseConnectors
import com.ravensanddragons.lunarbase.cards.LunarBaseStandardDeck

internal fun LunarBasePublicState.normalizeCatalogCards(): LunarBasePublicState =
    copy(
        players = players.map { player ->
            player.copy(board = player.board.map { boardCard -> boardCard.copy(card = boardCard.card.withCatalogMetadata()) })
        },
        supply = supply.map { card -> card?.withCatalogMetadata() },
        discardTop = discardTop?.withCatalogMetadata()
    )

internal fun LunarBasePrivateState.normalizeCatalogCards(): LunarBasePrivateState =
    copy(
        hands = hands.map { hand -> hand.map { it.withCatalogMetadata() } },
        stock = stock.map { it.withCatalogMetadata() },
        discard = discard.map { it.withCatalogMetadata() },
        unseenStations = unseenStations.map { it.withCatalogMetadata() }
    )

private fun LunarBaseCard.withCatalogMetadata(): LunarBaseCard {
    val definition = catalogDefinition(this) ?: return this
    return when (definition) {
        is com.ravensanddragons.lunarbase.cards.LunarBaseStationCardDefinition -> {
            val stationFront = LunarBaseStandardDeck.definition.stationFront
            copy(
                name = if (flipped) definition.name else stationFront.name,
                cardCost = emptyList(),
                orbs = if (flipped) definition.orbs.map { it.toCardColorName() } else stationFront.orbs.map { it.toCardColorName() },
                connectors = stationFront.connectors.toCardConnectors(),
                colonists = if (flipped) definition.colonists else stationFront.colonists,
                achievements = if (flipped) definition.achievements.toCardAchievementOrdinals() else stationFront.achievements.toCardAchievementOrdinals(),
                stationFrontName = stationFront.name,
                stationFrontOrbs = stationFront.orbs.map { it.toCardColorName() },
                stationFrontColonists = stationFront.colonists,
                stationFrontAchievements = stationFront.achievements.toCardAchievementOrdinals(),
                stationFrontMainActionText = stationFront.mainAction.toActionText(),
                stationBackName = stationBackName ?: definition.name,
                stationBackOrbs = if (stationBackOrbs.isNotEmpty()) stationBackOrbs else definition.orbs.map { it.toCardColorName() },
                stationBackColonists = if (stationBackColonists > 0) stationBackColonists else definition.colonists,
                stationBackAchievements = if (stationBackAchievements.isNotEmpty()) stationBackAchievements else definition.achievements.toCardAchievementOrdinals(),
                stationBackMainActionText = definition.mainAction.toActionText(),
                mainActionText = if (flipped) definition.mainAction.toActionText() else stationFront.mainAction.toActionText()
            )
        }
        is com.ravensanddragons.lunarbase.cards.LunarBaseModuleCardDefinition -> copy(
            name = definition.name,
            color = color ?: definition.cardColor.toCardColorName(),
            cardCost = definition.cardCost.map { it.toCardColorName() },
            orbs = if (orbs.isNotEmpty()) orbs else definition.orbs.map { it.toCardColorName() },
            connectors = if (connectors?.hasAnySpecified() == true) connectors else definition.connectors.toCardConnectors(),
            colonists = definition.colonists,
            achievements = definition.achievements.toCardAchievementOrdinals(),
            onPlayingText = definition.onPlaying.toActionText(),
            mainActionText = definition.mainAction.toActionText(),
            effectText = definition.effect?.toEffectText()
        )
        is com.ravensanddragons.lunarbase.cards.LunarBaseAgentCardDefinition -> copy(
            name = definition.name,
            cardCost = definition.cardCost.map { it.toCardColorName() },
            onPlayingText = definition.onPlaying.toActionText()
        )
        is com.ravensanddragons.lunarbase.cards.LunarBaseInfluenceCardDefinition -> copy(
            name = definition.name,
            cardCost = emptyList(),
            effectText = definition.effect.toEffectText()
        )
        else -> this
    }
}

private fun catalogDefinition(card: LunarBaseCard): LunarBaseCardDefinition? {
    val deck = LunarBaseStandardDeck.definition
    if (card.type == stationType && card.stationBackName != null) {
        return deck.stations.singleOrNull { it.name == card.stationBackName }
    }
    return when (card.type) {
        stationType -> deck.stations.singleOrNull { it.name == card.name }
        moduleType -> deck.modules.singleOrNull { it.name == card.name }
        agentType -> deck.agents.singleOrNull { it.name == card.name }
        influenceType -> deck.influences.singleOrNull { it.name == card.name }
        else -> null
    }
}

private fun LunarBaseConnectors.toCardConnectors(): LunarBaseCardConnectors =
    LunarBaseCardConnectors(
        top = top?.toCardColorName(),
        topLeft = topLeft?.toCardColorName(),
        topRight = topRight?.toCardColorName(),
        bottomLeft = bottomLeft?.toCardColorName(),
        bottomRight = bottomRight?.toCardColorName(),
        bottom = bottom?.toCardColorName()
    )

private fun LunarBaseCardColor.toCardColorName(): String =
    name.lowercase()

private fun List<LunarBaseAchievement>.toCardAchievementOrdinals(): List<Int> =
    map { it.ordinal + 1 }
