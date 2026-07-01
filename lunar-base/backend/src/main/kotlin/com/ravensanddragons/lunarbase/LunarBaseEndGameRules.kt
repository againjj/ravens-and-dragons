package com.ravensanddragons.lunarbase

internal fun LunarBasePublicState.withEndGameResultIfWon(): LunarBasePublicState {
    val result = lunarBaseEndGameResult(this) ?: return this
    return copy(
        lifecycle = finishedLifecycle,
        endGameResult = result
    )
}

internal fun lunarBaseEndGameResult(publicState: LunarBasePublicState): LunarBaseEndGameResult? {
    val playerConditions = publicState.players.mapIndexedNotNull { index, player ->
        val conditions = buildList {
            if (player.credits >= lunarCreditWinThreshold) add("${player.credits}/$lunarCreditWinThreshold lunar credits")
            if (player.colonists >= colonistWinThreshold) add("${player.colonists}/$colonistWinThreshold colonists housed")
            if (player.achievements >= achievementWinThreshold) add("${player.achievements}/$achievementWinThreshold scientific achievements")
            if (player.influenceHandCount >= influenceWinThreshold) add("${player.influenceHandCount}/$influenceWinThreshold influences in hand")
        }
        if (conditions.isEmpty()) null else LunarBaseEndGameCondition(index, conditions)
    }
    if (playerConditions.isEmpty()) return null

    val winningPlayerIndexes = playerConditions.map { it.playerIndex }
    val label = when {
        winningPlayerIndexes.size > 1 -> "Draw"
        playerConditions.single().conditions.size > 1 -> "Epic Victory"
        else -> "Victory"
    }
    return LunarBaseEndGameResult(
        label = label,
        winningPlayerIndexes = winningPlayerIndexes,
        playerConditions = playerConditions
    )
}
