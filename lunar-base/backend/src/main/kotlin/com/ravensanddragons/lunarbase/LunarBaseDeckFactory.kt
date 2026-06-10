package com.ravensanddragons.lunarbase

import com.ravensanddragons.lunarbase.cards.LunarBaseCardDefinition
import com.ravensanddragons.lunarbase.cards.LunarBaseStandardDeck

internal fun buildStationCards(): List<LunarBaseCard> =
    LunarBaseStandardDeck.definition.stations.flatMapIndexed { definitionIndex, definition ->
        List(definition.count) { copyIndex ->
            LunarBaseCard(
                id = "$stationType-${definitionIndex + 1}-${copyIndex + 1}",
                type = stationType,
                name = definition.name
            )
        }
    }

internal fun buildNonStationCards(useInfluences: Boolean): List<LunarBaseCard> {
    val standardDeck = LunarBaseStandardDeck.definition
    return expandDefinitions(moduleType, standardDeck.modules) +
        expandDefinitions(agentType, standardDeck.agents) +
        if (useInfluences) expandDefinitions(influenceType, standardDeck.influences) else emptyList()
}

private fun expandDefinitions(
    type: String,
    definitions: List<LunarBaseCardDefinition>
): List<LunarBaseCard> =
    definitions.flatMapIndexed { definitionIndex, definition ->
        List(definition.count) { copyIndex ->
            LunarBaseCard(
                id = "$type-${definitionIndex + 1}-${copyIndex + 1}",
                type = type,
                name = definition.name
            )
        }
    }
