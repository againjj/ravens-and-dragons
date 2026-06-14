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
            "chooseMainAction" -> chooseMainAction(publicState, privateState, command, actingUserId)
            "chooseActionOption" -> chooseActionOption(publicState, privateState, command, actingUserId)
            "choosePlayer" -> choosePlayer(publicState, privateState, command, actingUserId)
            "completeAutomaticAction" -> completeAutomaticAction(publicState, privateState, actingUserId)
            "draftSupply" -> draftSupply(publicState, privateState, command, actingUserId)
            "resellSupply" -> resellSupply(publicState, privateState, command, actingUserId)
            "discardHandCard" -> discardHandCardForAction(publicState, privateState, command, actingUserId)
            "playAgent" -> playAgent(publicState, privateState, command, actingUserId)
            "buildModule" -> buildModule(publicState, privateState, command, actingUserId)
            "flipStation" -> flipStationForAction(publicState, privateState, command, actingUserId)
            "finishInteraction" -> finishInteraction(publicState, privateState, actingUserId)
            "stealModule" -> stealModule(publicState, privateState, command, actingUserId)
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
        if (publicState.lifecycle == finishedLifecycle) {
            viewerNode.set<JsonNode>("hands", objectMapper.valueToTree(privateState.hands))
        }
        val viewing = publicState.actionState.interaction?.takeIf {
            it.kind == "viewHand" && it.actorIndex == viewerSeat && it.targetPlayerIndex != null
        }?.targetPlayerIndex
        if (viewing != null) {
            viewerNode.set<JsonNode>("viewedHand", objectMapper.valueToTree(privateState.hands[viewing]))
        }
        return publicStateForClient(publicState).set<JsonNode>("viewer", viewerNode)
    }

    override fun publicState(current: GameRecord): JsonNode =
        publicStateForClient(current.toPublicState())

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
        val actions = when (boardCard.card.type) {
            stationType -> if (boardCard.card.flipped) {
                boardCard.card.stationBackDefinition()?.mainAction.orEmpty()
            } else {
                stationFrontDefinition().mainAction
            }
            moduleType -> boardCard.card.moduleDefinition()?.mainAction.orEmpty()
            else -> emptyList()
        }
        if (actions.isEmpty()) {
            throw InvalidCommandException("That card has no main action.")
        }
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .startActions(publicState, privateState, seat, actions, mainActionChosen = true)
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

    private fun completeAutomaticAction(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .completeAutomaticAction(LunarBaseMutableGame(publicState, privateState))
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

    private fun discardHandCardForAction(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        publicState.requireActor(actingUserId)
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .discardHandCard(LunarBaseMutableGame(publicState, privateState), command.requiredText("cardId"))
    }

    private fun playAgent(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val seat = publicState.requireCurrentPlayer(actingUserId)
        if (publicState.actionState.phase != choosingMainActionPhase || publicState.actionState.mainActionChosen) {
            throw InvalidCommandException("Agents can only be played before choosing a main action.")
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
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .startActions(
                publicState.copy(players = nextPlayers, message = "Played an agent.").withPrivateCounts(nextPrivate),
                nextPrivate,
                seat,
                card.agentDefinition()?.onPlaying.orEmpty(),
                mainActionChosen = false
            )
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
        return LunarBaseActionEngine(publicState.id, publicState.version)
            .flipStation(LunarBaseMutableGame(publicState, privateState), playerIndex, command.get("cardId")?.asText())
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
                command.requiredInt("sourcePlayerIndex"),
                command.requiredText("cardId"),
                command.requiredInt("x"),
                command.requiredInt("y"),
                command.requiredInt("rotation")
            )
    }

    private fun normalizeAfterMove(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        gameId: String
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        var public = publicState.withPrivateCounts(privateState)
        var private = privateState
        public = public.withBoardSummaries()
        if (public.lifecycle == activeLifecycle &&
            public.actionState.phase == resolvingActionPhase &&
            public.actionState.interaction == null &&
            public.actionState.stack.isEmpty()
        ) {
            public = finishCompletedAction(public)
            if (public.lifecycle == activeLifecycle && public.actionState.mainActionChosen) {
                val refilled = refillSupplyAtEndOfTurn(public, private, gameId)
                public = refilled.first.copy(
                    currentPlayerIndex = nextPlayerIndex(public.currentPlayerIndex, public.config.playerCount),
                    actionState = LunarBaseActionState(),
                    message = "Turn ended."
                )
                private = refilled.second
            } else if (public.lifecycle == activeLifecycle) {
                public = public.copy(actionState = LunarBaseActionState())
            }
        }
        return public.withPrivateCounts(private).withBoardSummaries() to private
    }

    private fun finishCompletedAction(publicState: LunarBasePublicState): LunarBasePublicState {
        return publicState.withEndGameResultIfWon()
    }

    private fun refillSupplyAtEndOfTurn(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        gameId: String
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        if (publicState.supply.filterNotNull().any { it.type != influenceType }) {
            return publicState to privateState
        }
        var public = publicState
        var private = privateState
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
        return public to private
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

    private fun LunarBasePublicState.requireActor(actingUserId: String?): Int {
        if (lifecycle == finishedLifecycle) {
            throw InvalidCommandException("This Lunar Base game is already over.")
        }
        if (actingUserId == null) {
            throw InvalidCommandException("You must sign in before acting.")
        }
        val actor = actionState.interaction?.actorIndex
            ?: throw InvalidCommandException("No action is waiting for input.")
        val seat = seats.indexOfFirst { it.userId == actingUserId }
        if (seat < 0) {
            throw InvalidCommandException("You are not seated in this game.")
        }
        if (seat != actor) {
            throw InvalidCommandException("It is not your action.")
        }
        return actor
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

    private fun publicStateForClient(publicState: LunarBasePublicState): ObjectNode {
        val node = objectMapper.valueToTree<ObjectNode>(publicState)
        val statusText = publicState.actionStatusText()
        if (statusText != null) {
            (node.get("actionState") as? ObjectNode)?.put("statusText", statusText)
        }
        val interaction = (node.get("actionState") as? ObjectNode)?.get("interaction") as? ObjectNode
        if (interaction != null) {
            val actionInteraction = publicState.actionState.interaction
            interaction.put("text", actionInteraction?.clientInteractionText(publicState).orEmpty())
            interaction.set<JsonNode>("buttons", objectMapper.valueToTree(actionInteraction?.clientButtons(publicState).orEmpty()))
        }
        return node
    }

    private data class ClientActionButton(val label: String, val value: String)

    private fun LunarBaseActionInteraction.clientInteractionText(publicState: LunarBasePublicState): String =
        when (kind) {
            "chooseOpponent" -> "Choose an opponent"
            "chooseScopeTarget" -> if (action?.scope == com.ravensanddragons.lunarbase.cards.LunarBaseActionScope.OPPONENT.name) {
                "Choose an opponent"
            } else {
                "Choose a target"
            }
            "stealCredits" -> "Select an opponent"
            "stealModule" -> if (canStealAnyModule(publicState, this)) "" else "No module to steal"
            else -> ""
        }

    private fun LunarBaseActionInteraction.clientButtons(publicState: LunarBasePublicState): List<ClientActionButton> =
        when (kind) {
            "chooseOne" -> action?.actions.orEmpty().mapIndexed { index, node ->
                ClientActionButton(node.toActionText(), index.toString())
            }
            "chooseOpponent",
            "stealCredits" -> playerButtons(publicState, actorIndex, opponents = true)
            "chooseScopeTarget" -> playerButtons(
                publicState,
                actorIndex,
                opponents = action?.scope == com.ravensanddragons.lunarbase.cards.LunarBaseActionScope.OPPONENT.name
            )
            "build" -> listOf(ClientActionButton("Skip Build", "skip"))
            "flipStation" -> if (action?.flipAmountKind == "anyNumber") {
                listOf(ClientActionButton("Done flipping stations", "done"))
            } else {
                emptyList()
            }
            "flipStationTo" -> if (isStationAlreadyFlipped(publicState, this)) {
                listOf(ClientActionButton("Station is already flipped", "done"))
            } else {
                emptyList()
            }
            "stealModule" -> if (canStealAnyModule(publicState, this)) {
                emptyList()
            } else {
                listOf(ClientActionButton("Skip steal", "skip"))
            }
            "viewHand" -> listOf(ClientActionButton("Done viewing", "done"))
            else -> emptyList()
        }

    private fun playerButtons(publicState: LunarBasePublicState, actorIndex: Int, opponents: Boolean): List<ClientActionButton> =
        publicState.players.indices
            .filter { !opponents || it != actorIndex }
            .map { ClientActionButton(publicState.seats[it].displayName ?: "Player ${it + 1}", it.toString()) }

    private fun isStationAlreadyFlipped(publicState: LunarBasePublicState, interaction: LunarBaseActionInteraction): Boolean {
        if (interaction.kind != "flipStationTo") return false
        val station = publicState.players.getOrNull(interaction.actorIndex)?.board?.firstOrNull { it.card.type == stationType }?.card
            ?: return false
        val desiredSide = interaction.action?.side ?: return false
        val desiredFlipped = desiredSide == com.ravensanddragons.lunarbase.cards.LunarBaseStationSide.AGENDA_SIDE.name
        return station.flipped == desiredFlipped
    }

    private fun canStealAnyModule(publicState: LunarBasePublicState, interaction: LunarBaseActionInteraction): Boolean {
        val name = interaction.action?.moduleName ?: return false
        val actorBoard = publicState.players.getOrNull(interaction.actorIndex)?.board ?: return false
        return publicState.players.withIndex()
            .filter { it.index != interaction.actorIndex }
            .flatMap { player -> player.value.board }
            .filter { boardCard -> boardCard.card.name == name && boardCard.card.type == moduleType }
            .any { boardCard -> findLegalPlacement(actorBoard, boardCard.card) != null }
    }

    private fun findLegalPlacement(board: List<LunarBaseBoardCard>, card: LunarBaseCard): LunarBaseBoardCard? {
        val occupied = board.map { it.x to it.y }.toSet()
        val candidates = board.flatMap { existing ->
            listOf(existing.x + 1 to existing.y, existing.x - 1 to existing.y, existing.x to existing.y + 1, existing.x to existing.y - 1)
        }.filterNot { it in occupied }.distinct()
        return candidates.asSequence()
            .flatMap { (x, y) -> sequenceOf(0, 90, 180, 270).map { rotation -> LunarBaseBoardCard(card, x, y, rotation) } }
            .firstOrNull { validateModulePlacement(board, it) == PlacementValidationResult.VALID }
    }

}
