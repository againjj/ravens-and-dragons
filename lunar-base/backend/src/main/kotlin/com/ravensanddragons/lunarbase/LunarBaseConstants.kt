package com.ravensanddragons.lunarbase

import kotlin.random.Random

internal const val activeLifecycle = "active"
internal const val finishedLifecycle = "finished"
internal const val minPlayers = 2
internal const val maxPlayers = 6
internal const val initialHandSize = 3
internal const val stationType = "station"
internal const val moduleType = "module"
internal const val agentType = "agent"
internal const val influenceType = "influence"
internal const val grayColor = "gray"
internal const val lunarCreditWinThreshold = 20
internal const val colonistWinThreshold = 10
internal const val achievementWinThreshold = 5
internal const val influenceWinThreshold = 4
internal const val choosingMainActionPhase = "choosingMainAction"
internal const val resolvingActionPhase = "resolvingAction"

internal fun randomFor(gameId: String, salt: String): Random =
    Random("$gameId:$salt".hashCode())

internal fun supplySize(playerCount: Int): Int = 3 + playerCount

internal fun nextPlayerIndex(current: Int, playerCount: Int): Int = (current + 1) % playerCount
