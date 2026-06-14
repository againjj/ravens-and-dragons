package com.ravensanddragons.lunarbase

internal fun LunarBasePublicState.withEndGameResultIfWon(): LunarBasePublicState {
    if (lifecycle == finishedLifecycle || endGameResult != null) return this
    val result = lunarBaseEndGameResult(this) ?: return this
    return copy(
        lifecycle = finishedLifecycle,
        endGameResult = result,
        actionState = actionState.copy(interaction = null, stack = emptyList()),
        message = result.label
    )
}

internal fun lunarBaseEndGameResult(publicState: LunarBasePublicState): LunarBaseEndGameResult? {
    val conditions = publicState.players.mapIndexedNotNull { index, player ->
        val met = buildList {
            if (player.credits >= 20) add("${player.credits}/20 lunar credits")
            if (player.colonists >= 10) add("${player.colonists}/10 colonists housed")
            if (player.achievements >= 5) add("${player.achievements}/5 scientific achievements")
            if (player.influenceHandCount >= 4) add("${player.influenceHandCount}/4 influences in hand")
        }
        if (met.isEmpty()) null else LunarBaseEndGameCondition(index, met)
    }
    if (conditions.isEmpty()) return null
    val winners = conditions.map { it.playerIndex }
    val label = when {
        winners.size > 1 -> "Draw"
        conditions.single().conditions.size > 1 -> "Epic Victory"
        else -> "Victory"
    }
    return LunarBaseEndGameResult(label, winners, conditions)
}
