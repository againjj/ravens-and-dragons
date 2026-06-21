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
        val privateState = current.toPrivateState()
        val publicState = current.toPublicState(privateState, includeEndGameResult = false)
        requireExpectedVersion(publicState, command)
        val type = command.get("type")?.asText() ?: throw InvalidCommandException("Command type is required.")
        val now = Instant.now(clock)
        val next = when (type) {
            "claimSeat" -> claimSeat(publicState, privateState, command, actingUserId)
            "chooseMainAction" -> chooseMainAction(publicState, privateState, command, actingUserId)
            "chooseActionOption" -> chooseActionOption(publicState, privateState, command, actingUserId)
            "choosePlayer" -> choosePlayer(publicState, privateState, command, actingUserId)
            "drawStock" -> drawStockForAction(publicState, privateState, actingUserId)
            "draftSupply" -> draftSupply(publicState, privateState, command, actingUserId)
            "resellSupply" -> resellSupply(publicState, privateState, command, actingUserId)
            "discardHandCard" -> discardHandCard(publicState, privateState, command, actingUserId)
            "startInfluenceNegation" -> startInfluenceNegation(publicState, privateState, actingUserId)
            "playAgent" -> playAgent(publicState, privateState, command, actingUserId)
            "buildModule" -> buildModule(publicState, privateState, command, actingUserId)
            "stealModule" -> stealModule(publicState, privateState, command, actingUserId)
            "flipStation" -> flipStationForAction(publicState, privateState, command, actingUserId)
            "finishInteraction" -> finishInteraction(publicState, privateState, actingUserId)
            else -> throw InvalidCommandException("Unsupported Lunar Base command: $type.")
        }
        val normalized = next.first.withPrivateCounts(next.second).withBoardSummaries().withEndGameResultIfWon() to next.second
        return toRecord(
            normalized.first.copy(version = publicState.version + 1, updatedAt = now),
            normalized.second,
            lastAccessedAt = current.lastAccessedAt,
            publiclyListed = current.publiclyListed
        )
    }

    override fun gameView(current: GameRecord, currentUserId: String?): JsonNode {
        val privateState = current.toPrivateState()
        val publicState = current.toPublicState(privateState)
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
        if (publicState.lifecycle == finishedLifecycle) {
            viewerNode.set<JsonNode>("revealedHands", objectMapper.valueToTree(privateState.hands))
        } else if (viewerSeat != null) {
            val interaction = publicState.actionState.interaction
            if (interaction?.kind == "viewHand" && interaction.actorIndex == viewerSeat) {
                val revealedHands = privateState.hands.mapIndexed { index, hand ->
                    if (index == interaction.targetPlayerIndex) hand else emptyList()
                }
                viewerNode.set<JsonNode>("revealedHands", objectMapper.valueToTree(revealedHands))
            }
        }
        return (objectMapper.valueToTree<ObjectNode>(publicState)).set<JsonNode>("viewer", viewerNode)
    }

    override fun commandResponseState(commandResult: GameRecord, persisted: GameRecord, actingUserId: String?): JsonNode =
        gameView(persisted, actingUserId)

    override fun publicState(current: GameRecord): JsonNode =
        objectMapper.valueToTree(current.toPublicState(current.toPrivateState()))

    override fun publicGameDetails(current: GameRecord): PublicGameDetails {
        val state = current.toPublicState(current.toPrivateState())
        return PublicGameDetails(
            gameName = LunarBaseGameModuleDefinition.identity.displayName,
            openSeats = state.seats.count { it.userId == null }
        )
    }

    override fun playerGameDetails(current: GameRecord, currentUserId: String): PlayerGameDetails? {
        val state = current.toPublicState(current.toPrivateState())
        if (state.seats.none { it.userId == currentUserId }) {
            return null
        }
        return PlayerGameDetails(
            gameName = LunarBaseGameModuleDefinition.identity.displayName,
            isCurrentUserTurn = state.lifecycle == activeLifecycle && state.seats.getOrNull(state.currentPlayerIndex)?.userId == currentUserId
        )
    }

    override fun playerUserIds(current: GameRecord): Set<String> =
        current.toPublicState(current.toPrivateState()).seats.mapNotNull { it.userId }.toSet()

    override fun clearUserReferences(current: GameRecord, userId: String): GameRecord? {
        val state = current.toPublicState(current.toPrivateState())
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

    private fun chooseMainAction(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        if (publicState.actionState.phase != choosingMainActionPhase || publicState.actionState.mainActionChosen) {
            throw InvalidCommandException("A main action has already been chosen.")
        }
        val cardId = command.requiredText("cardId")
        val boardCard = publicState.players[seat].board.firstOrNull { it.card.id == cardId }
            ?: throw InvalidCommandException("That card is not in your base.")
        val actions = boardCard.card.mainActions()
        if (actions.isEmpty()) {
            throw InvalidCommandException("That card has no main action.")
        }
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .startActions(publicState, privateState, seat, actions, mainActionChosen = true, sourceCardName = boardCard.card.name)
    }

    private fun chooseActionOption(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .chooseOption(LunarBaseMutableGame(publicState, privateState), command.requiredInt("optionIndex"))
    }

    private fun choosePlayer(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .choosePlayer(LunarBaseMutableGame(publicState, privateState), command.requiredInt("playerIndex"))
    }

    private fun drawStockForAction(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .drawStock(LunarBaseMutableGame(publicState, privateState))
    }

    private fun draftSupply(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .draftSupply(LunarBaseMutableGame(publicState, privateState), command.requiredInt("slotIndex"))
    }

    private fun resellSupply(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .resellSupply(LunarBaseMutableGame(publicState, privateState), command.requiredInt("slotIndex"))
    }

    private fun discardHandCard(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .discardHandCard(LunarBaseMutableGame(publicState, privateState), command.requiredText("cardId"))
    }

    private fun startInfluenceNegation(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .startInfluenceNegation(LunarBaseMutableGame(publicState, privateState))
    }

    private fun playAgent(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        if (publicState.actionState.phase != choosingMainActionPhase || publicState.actionState.mainActionChosen || publicState.actionState.interaction != null) {
            throw InvalidCommandException("Agents cannot be played after choosing a main action.")
        }
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
        val nextPublic = publicState.copy(players = nextPlayers, message = "Played an agent.").withPrivateCounts(nextPrivate)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .startActions(nextPublic, nextPrivate, seat, card.onPlayingActions(), mainActionChosen = false, sourceCardName = card.name, allowInfluenceNegation = true)
    }

    private fun buildModule(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .buildModule(
                LunarBaseMutableGame(publicState, privateState),
                command.requiredText("cardId"),
                command.requiredInt("x"),
                command.requiredInt("y"),
                command.requiredInt("rotation")
            )
    }

    private fun stealModule(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .stealModule(
                LunarBaseMutableGame(publicState, privateState),
                command.requiredText("cardId"),
                command.requiredInt("x"),
                command.requiredInt("y"),
                command.requiredInt("rotation")
            )
    }

    private fun flipStationForAction(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        val playerIndex = command.get("playerIndex")?.takeIf { it.canConvertToInt() }?.asInt()
            ?: publicState.actionState.interaction?.actorIndex
            ?: publicState.currentPlayerIndex
        val cardId = command.get("cardId")?.asText()?.takeIf { it.isNotBlank() }
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .flipStation(LunarBaseMutableGame(publicState, privateState), playerIndex, cardId)
    }

    private fun finishInteraction(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .finishInteraction(LunarBaseMutableGame(publicState, privateState))
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

    private fun LunarBasePublicState.requireActor(actingUserId: String?): Int {
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
        val actor = actionState.interaction?.actorIndex ?: throw InvalidCommandException("No action is waiting for a player.")
        if (seat != actor) {
            throw InvalidCommandException("That action is waiting for another player.")
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

    private fun GameRecord.toPublicState(
        privateState: LunarBasePrivateState,
        includeEndGameResult: Boolean = true
    ): LunarBasePublicState {
        val state = objectMapper.treeToValue(publicState, LunarBasePublicState::class.java)
            .normalizeCatalogCards()
            .withPrivateCounts(privateState)
            .withBoardSummaries()
        return if (includeEndGameResult) state.withEndGameResultIfWon() else state
    }

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
