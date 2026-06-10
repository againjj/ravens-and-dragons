package com.ravensanddragons.lunarbase

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.ravensanddragons.platform.game.runtime.GameHandler
import com.ravensanddragons.platform.game.runtime.GameRecord
import com.ravensanddragons.platform.game.runtime.InvalidCommandException
import com.ravensanddragons.platform.game.runtime.PlayerGameDetails
import com.ravensanddragons.platform.game.runtime.PublicGameDetails
import com.ravensanddragons.platform.game.runtime.VersionConflictException
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

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
            "flipStation" -> flipStation(publicState, privateState, actingUserId)
            "passTurn" -> {
                publicState.requireCurrentPlayer(actingUserId)
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
        val viewerSeat = currentUserId?.let { userId ->
            publicState.seats.indexOfFirst { it.userId == userId }.takeIf { it >= 0 }
        }
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
        val hand = privateState.hands[seat]
        val card = hand.firstOrNull { it.id == cardId } ?: throw InvalidCommandException("That card is not in your hand.")
        if (card.type != moduleType) {
            throw InvalidCommandException("Only module cards can be played on the board.")
        }
        val board = publicState.players[seat].board
        val candidate = LunarBaseBoardCard(card, x, y, rotation)
        when (validateModulePlacement(board, candidate)) {
            PlacementValidationResult.VALID -> Unit
            PlacementValidationResult.INVALID_ROTATION -> throw InvalidCommandException("Module rotation must be 0, 90, 180, or 270.")
            PlacementValidationResult.OVERLAPS_CARD -> throw InvalidCommandException("That board position overlaps another card.")
            PlacementValidationResult.DOES_NOT_TOUCH_BOARD -> throw InvalidCommandException("A played card must touch another card.")
            PlacementValidationResult.CONNECTORS_DO_NOT_MATCH -> throw InvalidCommandException("A played card's connectors must match adjacent cards.")
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

    private fun flipStation(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        val player = publicState.players[seat]
        val nextBoard = player.board.mapIndexed { index, boardCard ->
            if (index == 0 && boardCard.card.type == stationType) {
                boardCard.copy(card = boardCard.card.copy(flipped = !boardCard.card.flipped))
            } else {
                boardCard
            }
        }
        return publicState.copy(
            players = publicState.players.replaceAt(seat, player.copy(board = nextBoard)),
            message = "Flipped station."
        ) to privateState
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

    private fun GameRecord.toPublicState(): LunarBasePublicState =
        objectMapper.treeToValue(publicState, LunarBasePublicState::class.java).normalizeCatalogCards().withBoardSummaries()

    private fun GameRecord.toPrivateState(): LunarBasePrivateState =
        objectMapper.treeToValue(privateState, LunarBasePrivateState::class.java).normalizeCatalogCards()

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

}
