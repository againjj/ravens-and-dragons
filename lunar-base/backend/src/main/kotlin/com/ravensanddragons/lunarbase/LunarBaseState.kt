package com.ravensanddragons.lunarbase

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant

data class LunarBaseConfig(
    val playerCount: Int,
    val useInfluences: Boolean
)

data class LunarBaseSeat(
    val userId: String? = null,
    val displayName: String? = null
)

data class LunarBaseResources(
    val red: Int = 0,
    val blue: Int = 0,
    val yellow: Int = 0,
    val gray: Int = 0
)

@JsonInclude(JsonInclude.Include.NON_DEFAULT)
data class LunarBaseCard(
    val id: String,
    val type: String,
    val name: String,
    val color: String? = null,
    val cardCost: List<String> = emptyList(),
    val orbs: List<String> = emptyList(),
    val connectors: LunarBaseCardConnectors? = null,
    val colonists: Int = 0,
    val achievements: List<Int> = emptyList(),
    val flipped: Boolean = false,
    val stationFrontName: String? = null,
    val stationFrontOrbs: List<String> = emptyList(),
    val stationFrontColonists: Int = 0,
    val stationFrontAchievements: List<Int> = emptyList(),
    val stationFrontMainActionText: String? = null,
    val stationBackName: String? = null,
    val stationBackOrbs: List<String> = emptyList(),
    val stationBackColonists: Int = 0,
    val stationBackAchievements: List<Int> = emptyList(),
    val stationBackMainActionText: String? = null,
    val mainActionText: String? = null,
    val onPlayingText: String? = null,
    val effectText: String? = null
)

@JsonInclude(JsonInclude.Include.NON_DEFAULT)
data class LunarBaseCardConnectors(
    val top: String? = null,
    val topLeft: String? = null,
    val topRight: String? = null,
    val bottomLeft: String? = null,
    val bottomRight: String? = null,
    val bottom: String? = null
) {
    fun hasAnySpecified(): Boolean =
        listOf(top, topLeft, topRight, bottomLeft, bottomRight, bottom).any { it != null }
}

data class LunarBaseBoardCard(
    val card: LunarBaseCard,
    val x: Int,
    val y: Int,
    val rotation: Int
)

data class LunarBasePlayerPublic(
    val orbs: LunarBaseResources = LunarBaseResources(),
    val credits: Int = 3,
    val colonists: Int = 0,
    val achievements: Int = 0,
    val handCount: Int = 0,
    val influenceHandCount: Int = 0,
    val board: List<LunarBaseBoardCard> = emptyList()
)

data class LunarBaseActionButton(
    val label: String,
    val value: String
)

data class LunarBaseInteractionPrompt(
    val text: String
)

data class LunarBaseActionInteraction(
    val kind: String,
    val actorIndex: Int,
    val interactionPrompt: LunarBaseInteractionPrompt? = null,
    val buttons: List<LunarBaseActionButton> = emptyList(),
    val remaining: Int = 0,
    val action: LunarBaseActionNode? = null,
    val targetPlayerIndex: Int? = null,
    val flippedStationIds: List<String> = emptyList(),
    val defendedAction: LunarBaseActionFrame? = null
)

data class LunarBaseActionNode(
    val kind: String,
    val amount: Int? = null,
    val amountKind: String? = null,
    val flipAmount: Int? = null,
    val flipAmountKind: String? = null,
    val side: String? = null,
    val moduleName: String? = null,
    val playerRef: String? = null,
    val scope: String? = null,
    val actions: List<LunarBaseActionNode> = emptyList()
)

data class LunarBaseActionFrame(
    val actorIndex: Int,
    val action: LunarBaseActionNode,
    val remaining: Int? = null,
    val sourceCardName: String? = null,
    val sourceActorIndex: Int? = null,
    val influenceNegation: Boolean = false,
    val targetPlayerIndex: Int? = null,
    val targetCardId: String? = null,
    val targetX: Int? = null,
    val targetY: Int? = null,
    val targetRotation: Int? = null
)

data class LunarBaseActionState(
    val phase: String = choosingMainActionPhase,
    val mainActionChosen: Boolean = false,
    val stack: List<LunarBaseActionFrame> = emptyList(),
    val interaction: LunarBaseActionInteraction? = null,
    val chosenPlayerIndex: Int? = null,
    val activeActions: List<LunarBaseActionNode> = emptyList(),
    val sourceCardName: String? = null
)

data class LunarBaseEndGameCondition(
    val playerIndex: Int,
    val conditions: List<String>
)

data class LunarBaseEndGameResult(
    val label: String,
    val winningPlayerIndexes: List<Int>,
    val playerConditions: List<LunarBaseEndGameCondition>
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LunarBasePublicState(
    val id: String,
    val gameSlug: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val lifecycle: String,
    val config: LunarBaseConfig,
    val seats: List<LunarBaseSeat>,
    val currentPlayerIndex: Int,
    val players: List<LunarBasePlayerPublic>,
    val supply: List<LunarBaseCard?>,
    val stockCount: Int,
    val discardTop: LunarBaseCard? = null,
    val discardCount: Int = 0,
    val actionState: LunarBaseActionState = LunarBaseActionState(),
    val endGameResult: LunarBaseEndGameResult? = null,
    val createdByUserId: String? = null,
    val message: String? = null
)

data class LunarBasePrivateState(
    val hands: List<List<LunarBaseCard>>,
    val stock: List<LunarBaseCard>,
    val discard: List<LunarBaseCard>,
    val unseenStations: List<LunarBaseCard> = emptyList()
)

internal fun <T> List<T>.replaceAt(index: Int, value: T): List<T> =
    mapIndexed { currentIndex, current -> if (currentIndex == index) value else current }

internal fun LunarBasePublicState.withPrivateCounts(privateState: LunarBasePrivateState): LunarBasePublicState =
    copy(
        players = players.mapIndexed { index, player ->
            player.copy(
                handCount = privateState.hands.getOrElse(index) { emptyList() }.size,
                influenceHandCount = privateState.hands.getOrElse(index) { emptyList() }.count { it.type == influenceType }
            )
        },
        stockCount = privateState.stock.size,
        discardTop = privateState.discard.firstOrNull(),
        discardCount = privateState.discard.size
    )

internal fun LunarBasePublicState.toPersistedState(): LunarBasePublicState =
    copy(
        players = players.map { player ->
            player.copy(
                orbs = LunarBaseResources(),
                colonists = 0,
                achievements = 0,
                handCount = 0,
                influenceHandCount = 0,
                board = player.board.map { boardCard -> boardCard.copy(card = boardCard.card.toPersistedCard()) }
            )
        },
        supply = supply.map { it?.toPersistedCard() },
        stockCount = 0,
        discardTop = null,
        discardCount = 0,
        endGameResult = null
    )

internal fun LunarBasePrivateState.toPersistedState(): LunarBasePrivateState =
    copy(
        hands = hands.map { hand -> hand.map { it.toPersistedCard() } },
        stock = stock.map { it.toPersistedCard() },
        discard = discard.map { it.toPersistedCard() },
        unseenStations = unseenStations.map { it.toPersistedCard() }
    )

internal fun LunarBaseCard.creditCost(orbs: LunarBaseResources): Int {
    val costCounts = cardCost.groupingBy { it }.eachCount()
    val coloredRemainder =
        maxOf(0, costCounts.getOrDefault("red", 0) - orbs.red) +
            maxOf(0, costCounts.getOrDefault("blue", 0) - orbs.blue) +
            maxOf(0, costCounts.getOrDefault("yellow", 0) - orbs.yellow) +
            costCounts.getOrDefault("gray", 0)
    return maxOf(0, coloredRemainder - orbs.gray)
}

private fun LunarBaseCard.toPersistedCard(): LunarBaseCard =
    LunarBaseCard(
        id = id,
        type = type,
        name = persistedCatalogName(),
        flipped = flipped
    )

private fun LunarBaseCard.persistedCatalogName(): String =
    if (type == stationType) {
        stationBackName ?: name
    } else {
        name
    }
