package com.ravensanddragons.lunarbase

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.annotation.JsonInclude
import com.ravensanddragons.lunarbase.cards.LunarBaseCardColor
import com.ravensanddragons.lunarbase.cards.LunarBaseCardDefinition
import com.ravensanddragons.lunarbase.cards.LunarBaseAchievement
import com.ravensanddragons.lunarbase.cards.LunarBaseConnectors
import com.ravensanddragons.lunarbase.cards.LunarBaseStandardDeck
import com.ravensanddragons.platform.game.runtime.GameHandler
import com.ravensanddragons.platform.game.runtime.GameRecord
import com.ravensanddragons.platform.game.runtime.InvalidCommandException
import com.ravensanddragons.platform.game.runtime.PlayerGameDetails
import com.ravensanddragons.platform.game.runtime.PublicGameDetails
import com.ravensanddragons.platform.game.runtime.VersionConflictException
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import kotlin.random.Random

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
    val stationBackName: String? = null,
    val stationBackOrbs: List<String> = emptyList()
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
    val createdByUserId: String? = null,
    val message: String? = null
)

data class LunarBasePrivateState(
    val hands: List<List<LunarBaseCard>>,
    val stock: List<LunarBaseCard>,
    val discard: List<LunarBaseCard>,
    val unseenStations: List<LunarBaseCard> = emptyList()
)

@Component
class LunarBaseGameHandler(
    private val objectMapper: ObjectMapper,
    private val clock: Clock
) : GameHandler {
    override val gameSlug: String = LunarBaseGameModuleDefinition.identity.slug

    override fun createGame(gameId: String, request: JsonNode, createdByUserId: String?): GameRecord {
        val now = Instant.now(clock)
        val playerCount = request.get("playerCount")?.takeIf { it.canConvertToInt() }?.asInt() ?: 2
        if (playerCount !in minPlayers..maxPlayers) {
            throw InvalidCommandException("Lunar Base player count must be between 2 and 6.")
        }
        val useInfluences = request.get("useInfluences")?.asBoolean(false) ?: false
        val publiclyListed = request.get("publiclyListed")?.asBoolean(true) ?: true
        val shuffledStations = buildStationCards().shuffled(randomFor(gameId, "stations"))
        val stationBoards = shuffledStations.take(playerCount).map { card ->
            listOf(LunarBaseBoardCard(card = card, x = 0, y = 0, rotation = 0))
        }
        val nonStationCards = buildNonStationCards(useInfluences).shuffled(randomFor(gameId, "deck"))
        val supplyCount = supplySize(playerCount)
        val supply = nonStationCards.take(supplyCount)
        val dealtHands = List(playerCount) { playerIndex ->
            nonStationCards.drop(supplyCount + playerIndex * initialHandSize).take(initialHandSize)
        }
        val stockStart = supplyCount + playerCount * initialHandSize
        val privateState = LunarBasePrivateState(
            hands = dealtHands,
            stock = nonStationCards.drop(stockStart),
            discard = emptyList(),
            unseenStations = shuffledStations.drop(playerCount)
        )
        val publicState = LunarBasePublicState(
            id = gameId,
            gameSlug = gameSlug,
            version = 1,
            createdAt = now,
            updatedAt = now,
            lifecycle = activeLifecycle,
            config = LunarBaseConfig(playerCount = playerCount, useInfluences = useInfluences),
            seats = List(playerCount) { LunarBaseSeat() },
            currentPlayerIndex = 0,
            players = List(playerCount) { playerIndex ->
                LunarBasePlayerPublic(
                    handCount = privateState.hands[playerIndex].size,
                    influenceHandCount = privateState.hands[playerIndex].count { it.type == influenceType },
                    board = stationBoards[playerIndex]
                )
            },
            supply = supply,
            stockCount = privateState.stock.size,
            discardTop = null,
            discardCount = 0,
            createdByUserId = createdByUserId
        )
        return toRecord(publicState, privateState, lastAccessedAt = now, publiclyListed = publiclyListed)
    }

    override fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord {
        val publicState = current.toPublicState()
        val privateState = current.toPrivateState()
        requireExpectedVersion(publicState, command)
        val type = command.get("type")?.asText() ?: throw InvalidCommandException("Command type is required.")
        val now = Instant.now(clock)
        val next = when (type) {
            "claimSeat" -> claimSeat(publicState, privateState, command, actingUserId)
            "drawStock" -> drawStock(publicState, privateState, actingUserId)
            "takeSupply" -> takeSupply(publicState, privateState, command, actingUserId)
            "discardHandCard" -> discardHandCard(publicState, privateState, command, actingUserId)
            "playAgent" -> playAgent(publicState, privateState, command, actingUserId)
            "playModule" -> playModule(publicState, privateState, command, actingUserId)
            "passTurn" -> publicState.requireCurrentPlayer(actingUserId).let {
                publicState.copy(
                    currentPlayerIndex = nextPlayerIndex(publicState.currentPlayerIndex, publicState.config.playerCount),
                    message = "Turn passed."
                ) to privateState
            }
            "endGame" -> publicState.copy(lifecycle = finishedLifecycle, message = "Game ended.") to privateState
            else -> throw InvalidCommandException("Unsupported Lunar Base command: $type.")
        }
        val normalized = normalizeAfterMove(next.first, next.second, current.id)
        return toRecord(
            normalized.first.copy(version = publicState.version + 1, updatedAt = now),
            normalized.second,
            lastAccessedAt = current.lastAccessedAt,
            publiclyListed = current.publiclyListed
        )
    }

    override fun gameView(current: GameRecord, currentUserId: String?): JsonNode {
        val publicState = current.toPublicState()
        val privateState = current.toPrivateState()
        val viewerSeat = publicState.seats.indexOfFirst { it.userId == currentUserId }.takeIf { it >= 0 }
        val viewerNode = objectMapper.createObjectNode()
        viewerNode.put("userId", currentUserId)
        if (viewerSeat != null) {
            viewerNode.put("seatIndex", viewerSeat)
            viewerNode.set<JsonNode>("hand", objectMapper.valueToTree(privateState.hands[viewerSeat]))
        } else {
            viewerNode.putNull("seatIndex")
            viewerNode.set<JsonNode>("hand", objectMapper.valueToTree(emptyList<LunarBaseCard>()))
        }
        return (objectMapper.valueToTree<ObjectNode>(publicState)).set<JsonNode>("viewer", viewerNode)
    }

    override fun publicState(current: GameRecord): JsonNode =
        objectMapper.valueToTree(current.toPublicState())

    override fun publicGameDetails(current: GameRecord): PublicGameDetails {
        val state = current.toPublicState()
        return PublicGameDetails(
            gameName = LunarBaseGameModuleDefinition.identity.displayName,
            openSeats = state.seats.count { it.userId == null }
        )
    }

    override fun playerGameDetails(current: GameRecord, currentUserId: String): PlayerGameDetails? {
        val state = current.toPublicState()
        if (state.seats.none { it.userId == currentUserId }) {
            return null
        }
        return PlayerGameDetails(
            gameName = LunarBaseGameModuleDefinition.identity.displayName,
            isCurrentUserTurn = state.lifecycle == activeLifecycle && state.seats.getOrNull(state.currentPlayerIndex)?.userId == currentUserId
        )
    }

    override fun playerUserIds(current: GameRecord): Set<String> =
        current.toPublicState().seats.mapNotNull { it.userId }.toSet()

    override fun clearUserReferences(current: GameRecord, userId: String): GameRecord? {
        val state = current.toPublicState()
        if (state.seats.none { it.userId == userId } && state.createdByUserId != userId) {
            return null
        }
        val updated = state.copy(
            version = state.version + 1,
            updatedAt = Instant.now(clock),
            seats = state.seats.map { seat -> if (seat.userId == userId) LunarBaseSeat() else seat },
            createdByUserId = state.createdByUserId.takeUnless { it == userId },
            message = "A seated player left. Claim open seats to continue."
        )
        return toRecord(updated, current.toPrivateState(), current.lastAccessedAt, current.publiclyListed)
    }

    private fun claimSeat(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        if (actingUserId == null) {
            throw InvalidCommandException("You must sign in before claiming a seat.")
        }
        val seatIndex = command.requiredInt("seatIndex")
        if (seatIndex !in 0 until publicState.config.playerCount) {
            throw InvalidCommandException("Seat must be inside the player count.")
        }
        if (publicState.seats[seatIndex].userId != null) {
            throw InvalidCommandException("That seat is already claimed.")
        }
        val playerUserId = command.textValue("playerUserId", actingUserId)
        if (publicState.seats.any { it.userId == playerUserId }) {
            throw InvalidCommandException("That player is already seated.")
        }
        val displayName = command.textValue("displayName", "Player")
        val nextSeats = publicState.seats.toMutableList()
        nextSeats[seatIndex] = LunarBaseSeat(userId = playerUserId, displayName = displayName)
        return publicState.copy(seats = nextSeats, message = "$displayName joined.") to privateState
    }

    private fun drawStock(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        val available = ensureStock(privateState, publicState.id, publicState.version)
        val card = available.stock.firstOrNull() ?: throw InvalidCommandException("The stock is empty.")
        val nextHands = available.hands.replaceAt(seat, available.hands[seat] + card)
        val nextPrivate = available.copy(hands = nextHands, stock = available.stock.drop(1))
        return publicState.copy(message = "Drew from stock.").withPrivateCounts(nextPrivate) to nextPrivate
    }

    private fun takeSupply(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        val slotIndex = command.requiredInt("slotIndex")
        if (slotIndex !in publicState.supply.indices) {
            throw InvalidCommandException("Supply slot is out of range.")
        }
        val card = publicState.supply[slotIndex] ?: throw InvalidCommandException("That supply slot is empty.")
        val nextSupply = publicState.supply.toMutableList()
        nextSupply[slotIndex] = null
        val nextHands = privateState.hands.replaceAt(seat, privateState.hands[seat] + card)
        val nextPrivate = privateState.copy(hands = nextHands)
        return publicState.copy(supply = nextSupply, message = "Took a supply card.").withPrivateCounts(nextPrivate) to nextPrivate
    }

    private fun discardHandCard(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        val cardId = command.requiredText("cardId")
        val hand = privateState.hands[seat]
        val card = hand.firstOrNull { it.id == cardId } ?: throw InvalidCommandException("That card is not in your hand.")
        if (card.type != influenceType) {
            throw InvalidCommandException("Only influence cards can be discarded from hand.")
        }
        val nextPrivate = privateState.copy(
            hands = privateState.hands.replaceAt(seat, hand.filterNot { it.id == cardId }),
            discard = listOf(card) + privateState.discard
        )
        return publicState.copy(message = "Discarded ${card.type}.").withPrivateCounts(nextPrivate) to nextPrivate
    }

    private fun playAgent(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        val cardId = command.requiredText("cardId")
        val hand = privateState.hands[seat]
        val card = hand.firstOrNull { it.id == cardId } ?: throw InvalidCommandException("That card is not in your hand.")
        if (card.type != agentType) {
            throw InvalidCommandException("Only agent cards can be played from hand.")
        }
        val player = publicState.players[seat]
        val creditCost = card.creditCost(player.orbs)
        if (creditCost > player.credits) {
            throw InvalidCommandException("You do not have enough credits to play that card.")
        }
        val nextPlayers = publicState.players.replaceAt(
            seat,
            player.copy(credits = player.credits - creditCost)
        )
        val nextPrivate = privateState.copy(
            hands = privateState.hands.replaceAt(seat, hand.filterNot { it.id == cardId }),
            discard = listOf(card) + privateState.discard
        )
        return publicState.copy(players = nextPlayers, message = "Played an agent.").withPrivateCounts(nextPrivate) to nextPrivate
    }

    private fun playModule(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        val cardId = command.requiredText("cardId")
        val x = command.requiredInt("x")
        val y = command.requiredInt("y")
        val rotation = command.requiredInt("rotation")
        if (rotation !in setOf(0, 90, 180, 270)) {
            throw InvalidCommandException("Module rotation must be 0, 90, 180, or 270.")
        }
        val hand = privateState.hands[seat]
        val card = hand.firstOrNull { it.id == cardId } ?: throw InvalidCommandException("That card is not in your hand.")
        if (card.type != moduleType) {
            throw InvalidCommandException("Only module cards can be played on the board.")
        }
        val board = publicState.players[seat].board
        val occupied = board.flatMap { it.coveredCells() }.toSet()
        val nextCells = LunarBaseBoardCard(card, x, y, rotation).coveredCells()
        if (nextCells.any { it in occupied }) {
            throw InvalidCommandException("That board position overlaps another card.")
        }
        if (board.isNotEmpty() && nextCells.none { cell -> cell.neighbors().any { it in occupied } }) {
            throw InvalidCommandException("A played card must touch another card.")
        }
        val candidate = LunarBaseBoardCard(card, x, y, rotation)
        if (!connectorsMatch(candidate, board)) {
            throw InvalidCommandException("A played card's connectors must match adjacent cards.")
        }
        val player = publicState.players[seat]
        val creditCost = card.creditCost(player.orbs)
        if (creditCost > player.credits) {
            throw InvalidCommandException("You do not have enough credits to play that card.")
        }
        val nextPlayers = publicState.players.replaceAt(
            seat,
            player.copy(
                credits = player.credits - creditCost,
                board = board + candidate
            )
        )
        val nextPrivate = privateState.copy(hands = privateState.hands.replaceAt(seat, hand.filterNot { it.id == cardId }))
        return publicState.copy(players = nextPlayers, message = "Played a module.").withPrivateCounts(nextPrivate) to nextPrivate
    }

    private fun normalizeAfterMove(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        gameId: String
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        var public = publicState.withPrivateCounts(privateState)
        var private = privateState
        private = ensureStock(private, gameId, public.version)
        if (public.supply.filterNotNull().all { it.type == influenceType }) {
            val keptInfluences = public.supply.filterNotNull()
            public = public.copy(
                supply = keptInfluences,
                players = public.players.map { player ->
                    player.copy(credits = player.credits + player.orbs.yellow + player.orbs.gray)
                }
            )
            val refillTarget = keptInfluences.size + supplySize(public.config.playerCount)
            while (public.supply.size < refillTarget) {
                private = ensureStock(private, gameId, public.version + public.supply.size)
                val nextCard = private.stock.firstOrNull() ?: break
                public = public.copy(supply = public.supply + nextCard)
                private = private.copy(stock = private.stock.drop(1))
            }
        }
        return public.withPrivateCounts(private).withBoardSummaries() to private
    }

    private fun ensureStock(privateState: LunarBasePrivateState, gameId: String, version: Long): LunarBasePrivateState {
        if (privateState.stock.isNotEmpty() || privateState.discard.isEmpty()) {
            return privateState
        }
        return privateState.copy(
            stock = privateState.discard.shuffled(randomFor(gameId, "discard-$version")),
            discard = emptyList()
        )
    }

    private fun LunarBasePublicState.requireCurrentPlayer(actingUserId: String?): Int {
        if (lifecycle == finishedLifecycle) {
            throw InvalidCommandException("This Lunar Base game is already over.")
        }
        if (actingUserId == null) {
            throw InvalidCommandException("You must sign in before acting.")
        }
        val seat = seats.indexOfFirst { it.userId == actingUserId }
        if (seat < 0) {
            throw InvalidCommandException("You are not seated in this game.")
        }
        if (seat != currentPlayerIndex) {
            throw InvalidCommandException("It is not your turn.")
        }
        return seat
    }

    private fun LunarBasePublicState.withPrivateCounts(privateState: LunarBasePrivateState): LunarBasePublicState =
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

    private fun LunarBasePublicState.withBoardSummaries(): LunarBasePublicState =
        copy(
            players = players.map { player ->
                player.copy(
                    orbs = player.board.completedOrbCounts(),
                    colonists = player.board.sumOf { it.card.colonists },
                    achievements = player.board.flatMap { it.card.achievements }.toSet().size
                )
            }
        )

    private fun List<LunarBaseBoardCard>.completedOrbCounts(): LunarBaseResources {
        val wholeOrbs = flatMap { it.card.orbs }
        val joinedOrbs = flatMap { it.connectorSlots().entries }
            .groupBy({ it.key }, { it.value })
            .values
            .mapNotNull { colors -> colors.takeIf { it.size == 2 }?.let { completedOrbColor(it[0], it[1]) } }
        return (wholeOrbs + joinedOrbs).fold(LunarBaseResources()) { resources, color ->
            when (color) {
                "red" -> resources.copy(red = resources.red + 1)
                "blue" -> resources.copy(blue = resources.blue + 1)
                "yellow" -> resources.copy(yellow = resources.yellow + 1)
                "gray" -> resources.copy(gray = resources.gray + 1)
                else -> resources
            }
        }
    }

    private fun completedOrbColor(first: String, second: String): String? =
        when {
            first == grayColor && second == grayColor -> grayColor
            first == grayColor -> second
            second == grayColor -> first
            first == second -> first
            else -> null
        }

    private fun LunarBaseBoardCard.coveredCells(): List<Pair<Int, Int>> =
        if (rotation.isHorizontal()) listOf(x to y, x + 1 to y) else listOf(x to y, x to y + 1)

    private fun Pair<Int, Int>.neighbors(): List<Pair<Int, Int>> =
        listOf(first - 1 to second, first + 1 to second, first to second - 1, first to second + 1)

    private fun connectorsMatch(candidate: LunarBaseBoardCard, board: List<LunarBaseBoardCard>): Boolean {
        val candidateCells = candidate.coveredCells().toSet()
        val candidateOrbs = candidate.connectorSlots()
        val existingOrbs = board.associateWith { it.coveredCells().toSet() }
        var hasMatchingConnectorPair = false
        val allTouchedEdgesMatch = existingOrbs.all { (existing, existingCells) ->
            val existingSlots = existing.connectorSlots()
            candidateCells.all { cell ->
                cell.neighbors().filter { it in existingCells }.all { neighbor ->
                    val slot = sharedOrbSlot(cell, neighbor)
                    val candidateColor = candidateOrbs[slot]
                    val existingColor = existingSlots[slot]
                    if (candidateColor != null && existingColor != null && orbColorsMatch(candidateColor, existingColor)) {
                        hasMatchingConnectorPair = true
                    }
                    orbColorsMatch(candidateColor, existingColor)
                }
            }
        }
        return allTouchedEdgesMatch && hasMatchingConnectorPair
    }

    private fun sharedOrbSlot(first: Pair<Int, Int>, second: Pair<Int, Int>): OrbSlot {
        val x = first.first
        val y = first.second
        val nx = second.first
        val ny = second.second
        return when {
            nx == x + 1 -> OrbSlot((x + 1) * 2, y * 2 + 1)
            nx == x - 1 -> OrbSlot(x * 2, y * 2 + 1)
            ny == y + 1 -> OrbSlot(x * 2 + 1, (y + 1) * 2)
            ny == y - 1 -> OrbSlot(x * 2 + 1, y * 2)
            else -> error("Cells do not share an edge: $first and $second.")
        }
    }

    private fun orbColorsMatch(first: String?, second: String?): Boolean =
        when {
            first == null || second == null -> first == second
            first == grayColor || second == grayColor -> true
            else -> first == second
        }

    private fun LunarBaseBoardCard.connectorSlots(): Map<OrbSlot, String> {
        val horizontal = rotation.isHorizontal()
        val centerX = if (horizontal) x + 1.0 else x + 0.5
        val centerY = if (horizontal) y + 0.5 else y + 1.0
        return (card.connectors?.entries() ?: emptyList()).mapNotNull { (position, color) ->
            color ?: return@mapNotNull null
            val local = position.localPoint()
            val rotated = local.rotate(rotation)
            OrbSlot(
                x2 = ((centerX + rotated.first) * 2).toInt(),
                y2 = ((centerY + rotated.second) * 2).toInt()
            ) to color
        }.toMap()
    }

    private fun requireExpectedVersion(state: LunarBasePublicState, command: JsonNode) {
        val expectedVersion = command.get("expectedVersion")?.asLong()
            ?: throw InvalidCommandException("Lunar Base commands require expectedVersion.")
        if (expectedVersion != state.version) {
            throw VersionConflictException(objectMapper.valueToTree(state))
        }
    }

    private fun JsonNode.requiredInt(name: String): Int =
        get(name)?.takeIf { it.canConvertToInt() }?.asInt()
            ?: throw InvalidCommandException("Command requires $name.")

    private fun JsonNode.requiredText(name: String): String =
        get(name)?.asText()?.takeIf { it.isNotBlank() }
            ?: throw InvalidCommandException("Command requires $name.")

    private fun JsonNode.textValue(name: String, fallback: String): String =
        get(name)?.asText()?.takeIf { it.isNotBlank() } ?: fallback

    private fun Int.isHorizontal(): Boolean =
        this == 90 || this == 270

    private fun GameRecord.toPublicState(): LunarBasePublicState =
        objectMapper.treeToValue(publicState, LunarBasePublicState::class.java).normalizeCatalogCards().withBoardSummaries()

    private fun GameRecord.toPrivateState(): LunarBasePrivateState =
        objectMapper.treeToValue(privateState, LunarBasePrivateState::class.java).normalizeCatalogCards()

    private fun LunarBasePublicState.normalizeCatalogCards(): LunarBasePublicState =
        copy(
            players = players.map { player ->
                player.copy(board = player.board.map { boardCard -> boardCard.copy(card = boardCard.card.withCatalogMetadata()) })
            },
            supply = supply.map { card -> card?.withCatalogMetadata() },
            discardTop = discardTop?.withCatalogMetadata()
        )

    private fun LunarBasePrivateState.normalizeCatalogCards(): LunarBasePrivateState =
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
                    stationBackName = stationBackName ?: definition.name,
                    stationBackOrbs = if (stationBackOrbs.isNotEmpty()) stationBackOrbs else definition.orbs.map { it.toCardColorName() }
                )
            }
            is com.ravensanddragons.lunarbase.cards.LunarBaseModuleCardDefinition -> copy(
                name = definition.name,
                color = color ?: definition.cardColor.toCardColorName(),
                cardCost = definition.cardCost.map { it.toCardColorName() },
                orbs = if (orbs.isNotEmpty()) orbs else definition.orbs.map { it.toCardColorName() },
                connectors = if (connectors?.hasAnySpecified() == true) connectors else definition.connectors.toCardConnectors(),
                colonists = definition.colonists,
                achievements = definition.achievements.toCardAchievementOrdinals()
            )
            is com.ravensanddragons.lunarbase.cards.LunarBaseAgentCardDefinition -> copy(
                name = definition.name,
                cardCost = definition.cardCost.map { it.toCardColorName() }
            )
            is com.ravensanddragons.lunarbase.cards.LunarBaseInfluenceCardDefinition -> copy(
                name = definition.name,
                cardCost = emptyList()
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

    private fun toRecord(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        lastAccessedAt: Instant,
        publiclyListed: Boolean
    ): GameRecord =
        GameRecord(
            id = publicState.id,
            gameSlug = publicState.gameSlug,
            version = publicState.version,
            createdAt = publicState.createdAt,
            updatedAt = publicState.updatedAt,
            lifecycle = publicState.lifecycle,
            publicState = objectMapper.valueToTree(publicState.toPersistedState()),
            privateState = objectMapper.valueToTree(privateState.toPersistedState()),
            createdByUserId = publicState.createdByUserId,
            lastAccessedAt = lastAccessedAt,
            publiclyListed = publiclyListed
        )

    private fun <T> List<T>.replaceAt(index: Int, value: T): List<T> =
        mapIndexed { currentIndex, current -> if (currentIndex == index) value else current }

    private fun buildNonStationCards(useInfluences: Boolean): List<LunarBaseCard> {
        val standardDeck = LunarBaseStandardDeck.definition
        return expandDefinitions(moduleType, standardDeck.modules) +
            expandDefinitions(agentType, standardDeck.agents) +
            if (useInfluences) expandDefinitions(influenceType, standardDeck.influences) else emptyList()
    }

    private fun LunarBasePublicState.toPersistedState(): LunarBasePublicState =
        copy(
            players = players.map { player ->
                player.copy(board = player.board.map { boardCard -> boardCard.copy(card = boardCard.card.toPersistedCard()) })
            },
            supply = supply.map { it?.toPersistedCard() },
            discardTop = discardTop?.toPersistedCard()
        )

    private fun LunarBasePrivateState.toPersistedState(): LunarBasePrivateState =
        copy(
            hands = hands.map { hand -> hand.map { it.toPersistedCard() } },
            stock = stock.map { it.toPersistedCard() },
            discard = discard.map { it.toPersistedCard() },
            unseenStations = unseenStations.map { it.toPersistedCard() }
        )

    private fun LunarBaseCard.toPersistedCard(): LunarBaseCard =
        LunarBaseCard(
            id = id,
            type = type,
            name = persistedCatalogName(),
            flipped = flipped
        )

    private fun LunarBaseCard.creditCost(orbs: LunarBaseResources): Int {
        val costCounts = cardCost.groupingBy { it }.eachCount()
        val coloredRemainder =
            maxOf(0, costCounts.getOrDefault("red", 0) - orbs.red) +
                maxOf(0, costCounts.getOrDefault("blue", 0) - orbs.blue) +
                maxOf(0, costCounts.getOrDefault("yellow", 0) - orbs.yellow) +
                costCounts.getOrDefault("gray", 0)
        return maxOf(0, coloredRemainder - orbs.gray)
    }

    private fun LunarBaseCard.persistedCatalogName(): String =
        if (type == stationType) {
            stationBackName ?: name
        } else {
            name
        }

    private fun buildStationCards(): List<LunarBaseCard> =
        LunarBaseStandardDeck.definition.stations.flatMapIndexed { definitionIndex, definition ->
            List(definition.count) { copyIndex ->
                LunarBaseCard(
                    id = "$stationType-${definitionIndex + 1}-${copyIndex + 1}",
                    type = stationType,
                    name = definition.name
                )
            }
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

    private fun randomFor(gameId: String, salt: String): Random =
        Random("$gameId:$salt".hashCode())

    private fun supplySize(playerCount: Int): Int = 3 + playerCount

    private fun nextPlayerIndex(current: Int, playerCount: Int): Int = (current + 1) % playerCount

    private companion object {
        const val activeLifecycle = "active"
        const val finishedLifecycle = "finished"
        const val minPlayers = 2
        const val maxPlayers = 6
        const val initialHandSize = 3
        const val stationType = "station"
        const val moduleType = "module"
        const val agentType = "agent"
        const val influenceType = "influence"
        const val grayColor = "gray"
    }
}

private data class OrbSlot(val x2: Int, val y2: Int)

private enum class LunarBaseConnectorPosition {
    TOP,
    TOP_LEFT,
    TOP_RIGHT,
    BOTTOM_LEFT,
    BOTTOM_RIGHT,
    BOTTOM
}

private fun LunarBaseCardConnectors.entries(): List<Pair<LunarBaseConnectorPosition, String?>> =
    listOf(
        LunarBaseConnectorPosition.TOP to top,
        LunarBaseConnectorPosition.TOP_LEFT to topLeft,
        LunarBaseConnectorPosition.TOP_RIGHT to topRight,
        LunarBaseConnectorPosition.BOTTOM_LEFT to bottomLeft,
        LunarBaseConnectorPosition.BOTTOM_RIGHT to bottomRight,
        LunarBaseConnectorPosition.BOTTOM to bottom
    )

private fun LunarBaseConnectorPosition.localPoint(): Pair<Double, Double> =
    when (this) {
        LunarBaseConnectorPosition.TOP -> 0.0 to -1.0
        LunarBaseConnectorPosition.TOP_LEFT -> -0.5 to -0.5
        LunarBaseConnectorPosition.TOP_RIGHT -> 0.5 to -0.5
        LunarBaseConnectorPosition.BOTTOM_LEFT -> -0.5 to 0.5
        LunarBaseConnectorPosition.BOTTOM_RIGHT -> 0.5 to 0.5
        LunarBaseConnectorPosition.BOTTOM -> 0.0 to 1.0
    }

private fun Pair<Double, Double>.rotate(rotation: Int): Pair<Double, Double> =
    when (rotation) {
        90 -> -second to first
        180 -> -first to -second
        270 -> second to -first
        else -> this
    }
