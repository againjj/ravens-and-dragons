package com.ravensanddragons.ginrummy

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
import java.util.Collections
import java.util.Random
import kotlin.math.abs

data class GinRummyConfig(
    val targetScore: Int = 100,
    val playMode: String = "singleGame",
    val bigGinAllowed: Boolean = false,
    val optionalDealRule: Boolean = true,
    val lineBonusEnabled: Boolean = false,
    val shutoutBonusEnabled: Boolean = true,
    val aceHighAllowed: Boolean = false
)

data class GinRummyCard(
    val id: String,
    val rank: String,
    val suit: String
)

data class GinRummySeat(
    val userId: String? = null,
    val displayName: String? = null
)

data class GinRummyScoreLine(
    val seat: Int,
    val points: Int,
    val reason: String,
    val gameNumber: Int,
    val roundNumber: Int
)

data class GinRummyScores(
    val gamePoints: List<Int> = listOf(0, 0),
    val totalPoints: List<Int> = listOf(0, 0),
    val gamesWon: List<Int> = listOf(0, 0),
    val handsWonThisGame: List<Int> = listOf(0, 0),
    val runningLines: List<GinRummyScoreLine> = emptyList()
)

data class GinRummyRoundResult(
    val winnerSeat: Int? = null,
    val points: Int = 0,
    val reason: String = "",
    val knockerSeat: Int? = null,
    val knockerDeadwood: Int? = null,
    val defenderDeadwood: Int? = null,
    val selectedMelds: List<List<String>> = emptyList(),
    val selectedDeadwood: List<String> = emptyList(),
    val defenderMelds: List<List<String>> = emptyList(),
    val defenderDeadwoodCards: List<String> = emptyList(),
    val layoffs: List<String> = emptyList()
)

data class GinRummyPublicState(
    val id: String,
    val gameSlug: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val lifecycle: String,
    val config: GinRummyConfig,
    val seats: List<GinRummySeat>,
    val dealerSeat: Int,
    val currentSeat: Int,
    val phase: String,
    val gameNumber: Int,
    val roundNumber: Int,
    val stockCount: Int,
    val discardTop: GinRummyCard? = null,
    val discardCount: Int = 0,
    val handCounts: List<Int> = listOf(0, 0),
    val scores: GinRummyScores = GinRummyScores(),
    val roundResult: GinRummyRoundResult? = null,
    val winnerSeat: Int? = null,
    val message: String? = null,
    val createdByUserId: String? = null
)

data class GinRummyPrivateState(
    val stock: List<GinRummyCard> = emptyList(),
    val discardPile: List<GinRummyCard> = emptyList(),
    val hands: List<List<GinRummyCard>> = listOf(emptyList(), emptyList()),
    val drewDiscardCardId: String? = null,
    val firstUpcardPasses: List<Int> = emptyList()
)

data class GinRummyMeldArrangement(
    val melds: List<List<String>>,
    val deadwood: List<String>,
    val deadwoodScore: Int
)

@Component
class GinRummyGameHandler(
    private val objectMapper: ObjectMapper,
    private val clock: Clock
) : GameHandler {
    override val gameSlug: String = GinRummyGameModuleDefinition.identity.slug

    override fun createGame(gameId: String, request: JsonNode, createdByUserId: String?): GameRecord {
        val now = Instant.now(clock)
        val config = GinRummyConfig(
            targetScore = request.intValue("targetScore", 100).coerceAtLeast(1),
            playMode = request.textValue("playMode", "singleGame").takeIf { it == "bestOfFiveMatch" } ?: "singleGame",
            bigGinAllowed = request.booleanValue("bigGinAllowed", false),
            optionalDealRule = request.booleanValue("optionalDealRule", true),
            lineBonusEnabled = request.booleanValue("lineBonusEnabled", false),
            shutoutBonusEnabled = request.booleanValue("shutoutBonusEnabled", true),
            aceHighAllowed = request.booleanValue("aceHighAllowed", true)
        )
        val publicState = GinRummyPublicState(
            id = gameId,
            gameSlug = gameSlug,
            version = 1,
            createdAt = now,
            updatedAt = now,
            lifecycle = activeLifecycle,
            config = config,
            seats = listOf(GinRummySeat(), GinRummySeat()),
            dealerSeat = 0,
            currentSeat = 1,
            phase = discardOnlyPhase,
            gameNumber = 1,
            roundNumber = 1,
            stockCount = 0,
            createdByUserId = createdByUserId,
            message = null
        )
        val dealt = dealHand(publicState)
        return toRecord(dealt.first, dealt.second, now)
    }

    override fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord {
        val publicState = current.toPublicState()
        val privateState = current.toPrivateState()
        requireExpectedVersion(publicState, command)

        val result = when (val type = command.get("type")?.asText()) {
            "claimSeat" -> claimSeat(publicState, privateState, command, actingUserId)
            "clearSeat" -> clearSeat(publicState, privateState, command, actingUserId)
            "passUpcard" -> passUpcard(publicState, privateState, actingUserId)
            "drawStock" -> drawStock(publicState, privateState, actingUserId)
            "drawDiscard" -> drawDiscard(publicState, privateState, actingUserId)
            "discard" -> discard(publicState, privateState, command, actingUserId, knockArrangement = null)
            "knock" -> discard(publicState, privateState, command, actingUserId, knockArrangement = parseArrangement(command))
            "gin" -> discard(publicState, privateState, command, actingUserId, knockArrangement = parseArrangement(command), forceGin = true)
            "bigGin" -> bigGin(publicState, privateState, command, actingUserId)
            "reorderHand" -> reorderHand(publicState, privateState, command, actingUserId)
            "nextHand" -> dealHand(nextDealerPublicState(publicState))
            "nextGame" -> dealHand(nextGamePublicState(publicState))
            else -> throw InvalidCommandException("Unsupported Gin Rummy command: ${type ?: "missing type"}.")
        }

        val now = Instant.now(clock)
        return toRecord(
            result.first.copy(version = publicState.version + 1, updatedAt = now),
            result.second,
            current.lastAccessedAt,
            current.publiclyListed
        )
    }

    override fun gameView(current: GameRecord, currentUserId: String?): JsonNode {
        val publicState = current.toPublicState()
        val privateState = current.toPrivateState()
        val viewerSeatIndexes = publicState.seats.mapIndexedNotNull { index, seat ->
            if (seat.userId != null && seat.userId == currentUserId) index else null
        }
        val viewerNode = objectMapper.createObjectNode()
        viewerNode.put("userId", currentUserId)
        viewerNode.set<ObjectNode>("hands", objectMapper.createObjectNode().also { handsNode ->
            viewerSeatIndexes.forEach { seat ->
                handsNode.set<JsonNode>(seat.toString(), objectMapper.valueToTree(privateState.hands[seat]))
            }
        })
        viewerNode.set<ObjectNode>("deadwood", objectMapper.createObjectNode().also { deadwoodNode ->
            viewerSeatIndexes.forEach { seat ->
                val best = GinRummyMeldSolver.arrangements(privateState.hands[seat], publicState.config.aceHighAllowed).minByOrNull { it.deadwoodScore }
                deadwoodNode.put(seat.toString(), best?.deadwoodScore ?: 0)
            }
        })
        viewerNode.set<ObjectNode>("knockOptions", objectMapper.createObjectNode().also { optionsNode ->
            viewerSeatIndexes.forEach { seat ->
                val options = GinRummyMeldSolver.arrangements(privateState.hands[seat], publicState.config.aceHighAllowed)
                    .filter { it.deadwoodScore <= knockLimit }
                optionsNode.set<JsonNode>(seat.toString(), objectMapper.valueToTree(options))
            }
        })
        viewerNode.put("drewDiscardCardId", privateState.drewDiscardCardId)
        return (objectMapper.valueToTree<ObjectNode>(publicState)).set<JsonNode>("viewer", viewerNode)
    }

    override fun publicState(current: GameRecord): JsonNode = objectMapper.valueToTree(current.toPublicState())

    override fun publicGameDetails(current: GameRecord): PublicGameDetails {
        val state = current.toPublicState()
        return PublicGameDetails(
            gameName = GinRummyGameModuleDefinition.identity.displayName,
            openSeats = state.seats.count { it.userId == null }
        )
    }

    override fun playerGameDetails(current: GameRecord, currentUserId: String): PlayerGameDetails? {
        val state = current.toPublicState()
        if (state.seats.none { it.userId == currentUserId }) {
            return null
        }
        return PlayerGameDetails(
            gameName = GinRummyGameModuleDefinition.identity.displayName,
            isCurrentUserTurn = state.seats.getOrNull(state.currentSeat)?.userId == currentUserId &&
                state.lifecycle == activeLifecycle &&
                state.phase !in setOf(roundOverPhase, gameOverPhase, matchOverPhase)
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
            seats = state.seats.map { seat -> if (seat.userId == userId) GinRummySeat() else seat },
            version = state.version + 1,
            updatedAt = Instant.now(clock),
            createdByUserId = state.createdByUserId.takeUnless { it == userId },
            message = "A seated player left. Claim open seats to continue."
        )
        return toRecord(updated, current.toPrivateState(), current.lastAccessedAt, current.publiclyListed)
    }

    private fun claimSeat(
        publicState: GinRummyPublicState,
        privateState: GinRummyPrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val seat = command.requiredSeat()
        if (actingUserId == null) {
            throw InvalidCommandException("You must sign in before claiming a seat.")
        }
        if (seat !in 0..1) {
            throw InvalidCommandException("Seat must be 0 or 1.")
        }
        if (publicState.seats[seat].userId != null) {
            throw InvalidCommandException("That seat is already claimed.")
        }
        val playerUserId = command.textValue("playerUserId", actingUserId)
        val displayName = command.textValue("displayName", "Player")
        val nextSeats = publicState.seats.toMutableList()
        nextSeats[seat] = GinRummySeat(playerUserId, displayName)
        val canStart = nextSeats.all { it.userId != null }
        return publicState.copy(
            seats = nextSeats,
            message = if (canStart) null else "Claim the other seat."
        ) to privateState
    }

    private fun clearSeat(
        publicState: GinRummyPublicState,
        privateState: GinRummyPrivateState,
        command: JsonNode,
        actingUserId: String?
    ): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val seat = command.requiredSeat()
        if (publicState.seats[seat].userId != actingUserId) {
            throw InvalidCommandException("Only the seated player can leave that seat.")
        }
        val nextSeats = publicState.seats.toMutableList()
        nextSeats[seat] = GinRummySeat()
        return publicState.copy(
            seats = nextSeats,
            message = "Claim open seats to continue Gin Rummy."
        ) to privateState
    }

    private fun dealHand(publicState: GinRummyPublicState): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val deck = standardDeck().toMutableList()
        Collections.shuffle(deck, Random(publicState.id.hashCode().toLong() + publicState.version + publicState.roundNumber * 37L))
        val hands = listOf(mutableListOf<GinRummyCard>(), mutableListOf())
        val startingSeat = 1 - publicState.dealerSeat
        val cardsForSeat = if (publicState.config.optionalDealRule) {
            listOf(if (startingSeat == 0) 11 else 10, if (startingSeat == 1) 11 else 10)
        } else {
            listOf(10, 10)
        }
        repeat(cardsForSeat.max()) { index ->
            listOf(startingSeat, 1 - startingSeat).forEach { seat ->
                if (index < cardsForSeat[seat]) {
                    hands[seat].add(deck.removeLast())
                }
            }
        }
        val discardPile = if (publicState.config.optionalDealRule) {
            emptyList()
        } else {
            listOf(deck.removeLast())
        }
        val privateState = GinRummyPrivateState(
            stock = deck,
            discardPile = discardPile,
            hands = hands.map { it.toList() }
        )
        return publicState.copy(
            lifecycle = activeLifecycle,
            phase = if (publicState.config.optionalDealRule) discardOnlyPhase else firstUpcardPhase,
            currentSeat = startingSeat,
            stockCount = privateState.stock.size,
            discardTop = privateState.discardPile.lastOrNull(),
            discardCount = privateState.discardPile.size,
            handCounts = privateState.hands.map { it.size },
            roundResult = null,
            winnerSeat = null,
            message = if (publicState.config.optionalDealRule) "Starting player discards first." else "Non-dealer may take the upcard or pass."
        ) to privateState
    }

    private fun passUpcard(
        publicState: GinRummyPublicState,
        privateState: GinRummyPrivateState,
        actingUserId: String?
    ): Pair<GinRummyPublicState, GinRummyPrivateState> {
        requireTurn(publicState, actingUserId)
        if (publicState.phase != firstUpcardPhase) {
            throw InvalidCommandException("There is no upcard pass decision right now.")
        }
        val passes = (privateState.firstUpcardPasses + publicState.currentSeat).distinct()
        if (passes.size == 2) {
            return publicState.copy(
                phase = drawPhase,
                currentSeat = 1 - publicState.dealerSeat,
                message = "Both players passed. Non-dealer must draw from stock."
            ) to privateState.copy(firstUpcardPasses = passes)
        }
        return publicState.copy(
            currentSeat = publicState.dealerSeat,
            message = "Dealer may take the upcard or pass."
        ) to privateState.copy(firstUpcardPasses = passes)
    }

    private fun drawStock(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, actingUserId: String?): Pair<GinRummyPublicState, GinRummyPrivateState> {
        requireTurn(publicState, actingUserId)
        if (publicState.phase !in setOf(drawPhase, firstUpcardPhase)) {
            throw InvalidCommandException("Draw from stock is not legal right now.")
        }
        if (privateState.stock.size <= 2) {
            return finishRoundDraw(publicState, privateState)
        }
        val hands = privateState.hands.mutableHands()
        val stock = privateState.stock.toMutableList()
        hands[publicState.currentSeat].add(stock.removeLast())
        val nextPrivate = privateState.copy(stock = stock, hands = hands.map { it.toList() }, drewDiscardCardId = null)
        return publicState.copy(
            phase = discardPhase,
            stockCount = stock.size,
            handCounts = nextPrivate.hands.map { it.size },
            message = "Discard a card, or knock if your deadwood is 10 or less."
        ) to nextPrivate
    }

    private fun drawDiscard(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, actingUserId: String?): Pair<GinRummyPublicState, GinRummyPrivateState> {
        requireTurn(publicState, actingUserId)
        if (publicState.phase !in setOf(drawPhase, firstUpcardPhase)) {
            throw InvalidCommandException("Draw from discard is not legal right now.")
        }
        val discard = privateState.discardPile.toMutableList()
        val card = discard.removeLastOrNull() ?: throw InvalidCommandException("The discard pile is empty.")
        val hands = privateState.hands.mutableHands()
        hands[publicState.currentSeat].add(card)
        val nextPrivate = privateState.copy(discardPile = discard, hands = hands.map { it.toList() }, drewDiscardCardId = card.id)
        return publicState.copy(
            phase = discardPhase,
            discardTop = discard.lastOrNull(),
            discardCount = discard.size,
            handCounts = nextPrivate.hands.map { it.size },
            message = "Discard a different card, or knock if legal."
        ) to nextPrivate
    }

    private fun discard(
        publicState: GinRummyPublicState,
        privateState: GinRummyPrivateState,
        command: JsonNode,
        actingUserId: String?,
        knockArrangement: GinRummyMeldArrangement?,
        forceGin: Boolean = false
    ): Pair<GinRummyPublicState, GinRummyPrivateState> {
        requireTurn(publicState, actingUserId)
        if (publicState.phase !in setOf(discardPhase, discardOnlyPhase)) {
            throw InvalidCommandException("Discard is not legal right now.")
        }
        val cardId = command.textValue("cardId", "")
        if (cardId.isBlank()) {
            throw InvalidCommandException("Discard requires cardId.")
        }
        if (privateState.drewDiscardCardId == cardId) {
            throw InvalidCommandException("You cannot discard the card just taken from the discard pile.")
        }
        val hands = privateState.hands.mutableHands()
        val card = hands[publicState.currentSeat].removeById(cardId)
            ?: throw InvalidCommandException("That card is not in your hand.")
        val discard = privateState.discardPile + card
        val nextPrivate = privateState.copy(discardPile = discard, hands = hands.map { it.toList() }, drewDiscardCardId = null)
        val afterDiscard = publicState.copy(
            discardTop = card,
            discardCount = discard.size,
            handCounts = nextPrivate.hands.map { it.size },
            stockCount = nextPrivate.stock.size
        )
        if (knockArrangement != null || forceGin) {
            val arrangement = knockArrangement ?: bestArrangement(nextPrivate.hands[publicState.currentSeat], publicState.config.aceHighAllowed)
            requireArrangementMatchesHand(arrangement, nextPrivate.hands[publicState.currentSeat], publicState.config.aceHighAllowed)
            val isGin = arrangement.deadwoodScore == 0
            if (forceGin && !isGin) {
                throw InvalidCommandException("Gin requires zero deadwood.")
            }
            if (!forceGin && arrangement.deadwoodScore > knockLimit) {
                throw InvalidCommandException("Knocking requires 10 or fewer deadwood points.")
            }
            return finishKnock(afterDiscard, nextPrivate, arrangement, isGin)
        }
        return afterDiscard.copy(
            phase = drawPhase,
            currentSeat = 1 - publicState.currentSeat,
            message = "Draw from stock or discard."
        ) to nextPrivate
    }

    private fun bigGin(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, command: JsonNode, actingUserId: String?): Pair<GinRummyPublicState, GinRummyPrivateState> {
        requireTurn(publicState, actingUserId)
        if (!publicState.config.bigGinAllowed) {
            throw InvalidCommandException("Big Gin is not enabled for this game.")
        }
        if (publicState.phase != discardPhase) {
            throw InvalidCommandException("Big Gin can only be declared after drawing.")
        }
        val arrangement = parseArrangement(command) ?: bestArrangement(privateState.hands[publicState.currentSeat], publicState.config.aceHighAllowed)
        requireArrangementMatchesHand(arrangement, privateState.hands[publicState.currentSeat], publicState.config.aceHighAllowed)
        if (arrangement.deadwoodScore != 0 || privateState.hands[publicState.currentSeat].size != 11) {
            throw InvalidCommandException("Big Gin requires all 11 cards in melds.")
        }
        return finishBigGin(publicState, privateState, arrangement)
    }

    private fun reorderHand(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, command: JsonNode, actingUserId: String?): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val seat = publicState.seats.indexOfFirst { it.userId == actingUserId }
        if (seat < 0) {
            throw InvalidCommandException("Only a seated player can reorder cards.")
        }
        val order = command.get("cardIds")?.map { it.asText() } ?: throw InvalidCommandException("Reorder requires cardIds.")
        val currentHand = privateState.hands[seat]
        if (order.toSet() != currentHand.map { it.id }.toSet()) {
            throw InvalidCommandException("Reorder must include every card in the hand.")
        }
        val byId = currentHand.associateBy { it.id }
        val hands = privateState.hands.mutableHands()
        hands[seat] = order.map { byId.getValue(it) }.toMutableList()
        return publicState to privateState.copy(hands = hands.map { it.toList() })
    }

    private fun finishKnock(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, arrangement: GinRummyMeldArrangement, isGin: Boolean): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val knocker = publicState.currentSeat
        val defender = 1 - knocker
        val defenderHand = privateState.hands[defender]
        val defenderBase = bestArrangement(defenderHand, publicState.config.aceHighAllowed)
        val defenderBest = if (isGin) {
            bestArrangement(defenderHand, publicState.config.aceHighAllowed)
        } else {
            bestDefenderAfterLayoff(defenderHand, arrangement, publicState.config.aceHighAllowed)
        }
        val layoffIds = defenderBase.deadwood - defenderBest.deadwood.toSet()
        val knockerDeadwood = arrangement.deadwoodScore
        val defenderDeadwood = defenderBest.deadwoodScore
        val winner: Int
        val points: Int
        val reason: String
        if (isGin) {
            winner = knocker
            points = ginBonus + defenderDeadwood
            reason = "Gin"
        } else if (knockerDeadwood < defenderDeadwood) {
            winner = knocker
            points = defenderDeadwood - knockerDeadwood
            reason = "Knock"
        } else {
            winner = defender
            points = undercutBonus + knockerDeadwood - defenderDeadwood
            reason = "Undercut"
        }
        return finishScoredRound(publicState, privateState, winner, points, GinRummyRoundResult(
            winnerSeat = winner,
            points = points,
            reason = reason,
            knockerSeat = knocker,
            knockerDeadwood = knockerDeadwood,
            defenderDeadwood = defenderDeadwood,
            selectedMelds = arrangement.melds,
            selectedDeadwood = arrangement.deadwood,
            defenderMelds = defenderBest.melds,
            defenderDeadwoodCards = defenderBest.deadwood,
            layoffs = layoffIds
        ))
    }

    private fun finishBigGin(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, arrangement: GinRummyMeldArrangement): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val winner = publicState.currentSeat
        val defender = 1 - winner
        val defenderDeadwood = bestArrangement(privateState.hands[defender], publicState.config.aceHighAllowed).deadwoodScore
        val points = bigGinBonus + defenderDeadwood
        return finishScoredRound(publicState, privateState, winner, points, GinRummyRoundResult(
            winnerSeat = winner,
            points = points,
            reason = "Big Gin",
            knockerSeat = winner,
            knockerDeadwood = 0,
            defenderDeadwood = defenderDeadwood,
            selectedMelds = arrangement.melds,
            selectedDeadwood = arrangement.deadwood,
            defenderMelds = bestArrangement(privateState.hands[defender], publicState.config.aceHighAllowed).melds,
            defenderDeadwoodCards = bestArrangement(privateState.hands[defender], publicState.config.aceHighAllowed).deadwood
        ))
    }

    private fun finishScoredRound(
        publicState: GinRummyPublicState,
        privateState: GinRummyPrivateState,
        winner: Int,
        rawPoints: Int,
        result: GinRummyRoundResult
    ): Pair<GinRummyPublicState, GinRummyPrivateState> {
        val shutoutApplies = publicState.config.shutoutBonusEnabled && publicState.scores.handsWonThisGame[1 - winner] == 0
        val handPoints = if (shutoutApplies) rawPoints * 2 else rawPoints
        val gamePoints = publicState.scores.gamePoints.addTo(winner, handPoints)
        val handsWon = publicState.scores.handsWonThisGame.addTo(winner, 1)
        val baseLine = GinRummyScoreLine(winner, handPoints, if (shutoutApplies) "${result.reason} with shutout double" else result.reason, publicState.gameNumber, publicState.roundNumber)
        val reachedTarget = gamePoints[winner] >= publicState.config.targetScore
        if (!reachedTarget) {
            return publicState.copy(
                phase = roundOverPhase,
                currentSeat = winner,
                scores = publicState.scores.copy(
                    gamePoints = gamePoints,
                    totalPoints = publicState.scores.totalPoints.addTo(winner, handPoints),
                    handsWonThisGame = handsWon,
                    runningLines = publicState.scores.runningLines + baseLine
                ),
                roundResult = result.copy(points = handPoints),
                message = "Hand complete. Start the next hand."
            ) to privateState
        }

        val bonusLines = mutableListOf(baseLine)
        var totalBonus = if (publicState.config.playMode == "singleGame") 0 else gameBonus
        if (totalBonus > 0) {
            bonusLines.add(GinRummyScoreLine(winner, gameBonus, "Game bonus", publicState.gameNumber, publicState.roundNumber))
        }
        if (publicState.config.lineBonusEnabled) {
            val lineBonus = handsWon[winner] * lineBonusPerHand
            totalBonus += lineBonus
            bonusLines.add(GinRummyScoreLine(winner, lineBonus, "Line bonus", publicState.gameNumber, publicState.roundNumber))
        }
        val gamesWon = publicState.scores.gamesWon.addTo(winner, 1)
        val nextTotal = publicState.scores.totalPoints.addTo(winner, handPoints + totalBonus)
        val matchWon = publicState.config.playMode == "bestOfFiveMatch" && gamesWon[winner] >= 3
        return publicState.copy(
            lifecycle = if (matchWon || publicState.config.playMode == "singleGame") finishedLifecycle else activeLifecycle,
            phase = when {
                matchWon -> matchOverPhase
                publicState.config.playMode == "singleGame" -> gameOverPhase
                else -> gameOverPhase
            },
            currentSeat = winner,
            scores = publicState.scores.copy(
                gamePoints = gamePoints,
                totalPoints = nextTotal,
                gamesWon = gamesWon,
                handsWonThisGame = handsWon,
                runningLines = publicState.scores.runningLines + bonusLines
            ),
            winnerSeat = winner,
            roundResult = result.copy(points = handPoints),
            message = if (matchWon) "Match complete." else if (publicState.config.playMode == "singleGame") "Game complete." else "Game complete. Start the next game."
        ) to privateState
    }

    private fun finishRoundDraw(publicState: GinRummyPublicState, privateState: GinRummyPrivateState): Pair<GinRummyPublicState, GinRummyPrivateState> =
        publicState.copy(
            phase = roundOverPhase,
            roundResult = GinRummyRoundResult(reason = "Stock exhausted", points = 0),
            message = "Only two cards remain in stock. The hand is a draw."
        ) to privateState

    private fun nextDealerPublicState(publicState: GinRummyPublicState): GinRummyPublicState =
        publicState.copy(
            dealerSeat = 1 - publicState.dealerSeat,
            currentSeat = publicState.dealerSeat,
            roundNumber = publicState.roundNumber + 1,
            roundResult = null,
            message = null
        )

    private fun nextGamePublicState(publicState: GinRummyPublicState): GinRummyPublicState =
        publicState.copy(
            lifecycle = activeLifecycle,
            dealerSeat = 1 - publicState.dealerSeat,
            currentSeat = publicState.dealerSeat,
            gameNumber = publicState.gameNumber + 1,
            roundNumber = 1,
            scores = publicState.scores.copy(
                gamePoints = listOf(0, 0),
                handsWonThisGame = listOf(0, 0)
            ),
            roundResult = null,
            winnerSeat = null,
            message = null
        )

    private fun requireTurn(publicState: GinRummyPublicState, actingUserId: String?) {
        if (publicState.seats[publicState.currentSeat].userId != actingUserId) {
            throw InvalidCommandException("It is not your turn.")
        }
    }

    private fun requireExpectedVersion(publicState: GinRummyPublicState, command: JsonNode) {
        val expectedVersion = command.get("expectedVersion")?.asLong()
            ?: throw InvalidCommandException("Gin Rummy command requires expectedVersion.")
        if (expectedVersion != publicState.version) {
            throw VersionConflictException(objectMapper.valueToTree(publicState))
        }
    }

    private fun parseArrangement(command: JsonNode): GinRummyMeldArrangement? =
        command.get("arrangement")?.let { objectMapper.treeToValue(it, GinRummyMeldArrangement::class.java) }

    private fun requireArrangementMatchesHand(arrangement: GinRummyMeldArrangement, hand: List<GinRummyCard>, aceHighAllowed: Boolean) {
        val handIds = hand.map { it.id }.toSet()
        val arrangedIds = (arrangement.melds.flatten() + arrangement.deadwood)
        if (arrangedIds.toSet() != handIds || arrangedIds.size != handIds.size) {
            throw InvalidCommandException("Knock arrangement must include each remaining hand card exactly once.")
        }
        val byId = hand.associateBy { it.id }
        val legalMelds = GinRummyMeldSolver.arrangements(hand, aceHighAllowed)
            .flatMap { it.melds }
            .map { it.toSet() }
            .toSet()
        if (arrangement.melds.any { it.toSet() !in legalMelds || it.any { cardId -> byId[cardId] == null } }) {
            throw InvalidCommandException("Knock arrangement includes an illegal meld.")
        }
        val recalculated = GinRummyMeldArrangement(
            melds = arrangement.melds,
            deadwood = arrangement.deadwood,
            deadwoodScore = arrangement.deadwood.map { cardId ->
                hand.first { it.id == cardId }.deadwoodValue()
            }.sum()
        )
        if (recalculated.deadwoodScore != arrangement.deadwoodScore) {
            throw InvalidCommandException("Knock arrangement deadwood score is incorrect.")
        }
    }

    private fun bestArrangement(cards: List<GinRummyCard>, aceHighAllowed: Boolean): GinRummyMeldArrangement =
        GinRummyMeldSolver.arrangements(cards, aceHighAllowed).minByOrNull { it.deadwoodScore }
            ?: GinRummyMeldArrangement(emptyList(), cards.map { it.id }, cards.sumOf { it.deadwoodValue() })

    private fun bestDefenderAfterLayoff(cards: List<GinRummyCard>, knockerArrangement: GinRummyMeldArrangement, aceHighAllowed: Boolean): GinRummyMeldArrangement =
        GinRummyMeldSolver.arrangements(cards, aceHighAllowed).map { defenderArrangement ->
            val meldCards = cards.associateBy { it.id }
            val layoffIds = defenderArrangement.deadwood.filter { cardId ->
                val card = meldCards[cardId] ?: return@filter false
                canLayOff(card, knockerArrangement, aceHighAllowed)
            }
            defenderArrangement.copy(
                deadwood = defenderArrangement.deadwood - layoffIds.toSet(),
                deadwoodScore = defenderArrangement.deadwood.filterNot { it in layoffIds }.mapNotNull { meldCards[it] }.sumOf { it.deadwoodValue() }
            )
        }.minByOrNull { it.deadwoodScore } ?: bestArrangement(cards, aceHighAllowed)

    private fun canLayOff(card: GinRummyCard, arrangement: GinRummyMeldArrangement, aceHighAllowed: Boolean): Boolean =
        arrangement.melds.any { meld ->
            val cards = meld.mapNotNull { cardId -> standardDeckById[cardId] }
            when {
                cards.size < 3 -> false
                cards.map { it.rank }.toSet().size == 1 -> cards.first().rank == card.rank
                cards.map { it.suit }.toSet().size == 1 && cards.first().suit == card.suit -> {
                    val ranks = cards.map { rankValue(it.rank, aceHigh = false) }
                    val lowRun = (ranks + rankValue(card.rank, aceHigh = false)).sorted().isConsecutive()
                    val highRun = aceHighAllowed && (cards.map { rankValue(it.rank, aceHigh = true) } + rankValue(card.rank, aceHigh = true)).sorted().isConsecutive()
                    lowRun || highRun
                }
                else -> false
            }
        }

    private fun toRecord(publicState: GinRummyPublicState, privateState: GinRummyPrivateState, lastAccessedAt: Instant, publiclyListed: Boolean = true): GameRecord =
        GameRecord(
            id = publicState.id,
            gameSlug = gameSlug,
            version = publicState.version,
            createdAt = publicState.createdAt,
            updatedAt = publicState.updatedAt,
            lifecycle = publicState.lifecycle,
            publicState = objectMapper.valueToTree(publicState),
            privateState = objectMapper.valueToTree(privateState),
            createdByUserId = publicState.createdByUserId,
            lastAccessedAt = lastAccessedAt,
            publiclyListed = publiclyListed
        )

    private fun GameRecord.toPublicState(): GinRummyPublicState =
        objectMapper.treeToValue(publicState, GinRummyPublicState::class.java)

    private fun GameRecord.toPrivateState(): GinRummyPrivateState =
        objectMapper.treeToValue(privateState, GinRummyPrivateState::class.java)

    private companion object {
        const val activeLifecycle = "active"
        const val finishedLifecycle = "finished"
        const val firstUpcardPhase = "firstUpcard"
        const val drawPhase = "draw"
        const val discardOnlyPhase = "discardOnly"
        const val discardPhase = "discard"
        const val roundOverPhase = "roundOver"
        const val gameOverPhase = "gameOver"
        const val matchOverPhase = "matchOver"
        const val knockLimit = 10
        const val ginBonus = 25
        const val undercutBonus = 25
        const val bigGinBonus = 31
        const val gameBonus = 100
        const val lineBonusPerHand = 25
        val standardDeckById = standardDeck().associateBy { it.id }
    }
}

object GinRummyMeldSolver {
    fun arrangements(cards: List<GinRummyCard>, aceHighAllowed: Boolean): List<GinRummyMeldArrangement> {
        val candidates = meldCandidates(cards, aceHighAllowed)
        val byId = cards.associateBy { it.id }
        val results = mutableListOf<GinRummyMeldArrangement>()
        fun search(index: Int, used: Set<String>, melds: List<List<String>>) {
            if (index == candidates.size) {
                val deadwood = cards.map { it.id }.filterNot { it in used }
                results.add(GinRummyMeldArrangement(
                    melds = melds,
                    deadwood = deadwood,
                    deadwoodScore = deadwood.mapNotNull { byId[it] }.sumOf { it.deadwoodValue() }
                ))
                return
            }
            search(index + 1, used, melds)
            val candidate = candidates[index]
            if (candidate.none { it in used }) {
                search(index + 1, used + candidate, melds + listOf(candidate))
            }
        }
        search(0, emptySet(), emptyList())
        return results.distinctBy { it.melds.sortedBy { meld -> meld.joinToString(",") }.joinToString("|") to it.deadwood.sorted() }
            .sortedWith(compareBy<GinRummyMeldArrangement> { it.deadwoodScore }.thenBy { it.deadwood.size }.thenBy { it.melds.size })
    }

    private fun meldCandidates(cards: List<GinRummyCard>, aceHighAllowed: Boolean): List<List<String>> {
        val sets = cards.groupBy { it.rank }.values
            .flatMap { group ->
                when (group.size) {
                    3 -> listOf(group.map { it.id })
                    4 -> group.combinations(3).map { combo -> combo.map { it.id } } + listOf(group.map { it.id })
                    else -> emptyList()
                }
            }
        val runs = cards.groupBy { it.suit }.values.flatMap { suited ->
            val lowRuns = suited.sortedBy { rankValue(it.rank, aceHigh = false) }.runCandidates(false)
            val highRuns = if (aceHighAllowed) suited.sortedBy { rankValue(it.rank, aceHigh = true) }.runCandidates(true) else emptyList()
            lowRuns + highRuns
        }
        return (sets + runs).distinctBy { it.sorted().joinToString(",") }
    }

    private fun List<GinRummyCard>.runCandidates(aceHigh: Boolean): List<List<String>> {
        val ordered = distinctBy { rankValue(it.rank, aceHigh) }.sortedBy { rankValue(it.rank, aceHigh) }
        val results = mutableListOf<List<String>>()
        ordered.indices.forEach { start ->
            for (end in start + 2 until ordered.size) {
                val slice = ordered.subList(start, end + 1)
                if (slice.map { rankValue(it.rank, aceHigh) }.isConsecutive()) {
                    results.add(slice.map { it.id })
                }
            }
        }
        return results
    }
}

private fun standardDeck(): List<GinRummyCard> =
    listOf("clubs", "diamonds", "hearts", "spades").flatMap { suit ->
        listOf("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K").map { rank ->
            GinRummyCard("${rank}_$suit", rank, suit)
        }
    }

private fun rankValue(rank: String, aceHigh: Boolean): Int =
    when (rank) {
        "A" -> if (aceHigh) 14 else 1
        "J" -> 11
        "Q" -> 12
        "K" -> 13
        else -> rank.toInt()
    }

private fun GinRummyCard.deadwoodValue(): Int =
    when (rank) {
        "A" -> 1
        "J", "Q", "K" -> 10
        else -> rank.toInt()
    }

private fun List<Int>.isConsecutive(): Boolean =
    zipWithNext().all { (a, b) -> b == a + 1 }

private fun List<Int>.addTo(index: Int, amount: Int): List<Int> =
    mapIndexed { i, value -> if (i == index) value + amount else value }

private fun List<List<GinRummyCard>>.mutableHands(): MutableList<MutableList<GinRummyCard>> =
    map { it.toMutableList() }.toMutableList()

private fun MutableList<GinRummyCard>.removeById(cardId: String): GinRummyCard? {
    val index = indexOfFirst { it.id == cardId }
    return if (index >= 0) removeAt(index) else null
}

private fun JsonNode.requiredSeat(): Int =
    get("seat")?.takeIf { it.canConvertToInt() }?.asInt()
        ?: throw InvalidCommandException("Command requires seat.")

private fun JsonNode.intValue(field: String, default: Int): Int =
    get(field)?.takeIf { it.canConvertToInt() }?.asInt() ?: default

private fun JsonNode.booleanValue(field: String, default: Boolean): Boolean =
    get(field)?.asBoolean(default) ?: default

private fun JsonNode.textValue(field: String, default: String): String =
    get(field)?.asText(default) ?: default

private fun <T> List<T>.combinations(size: Int): List<List<T>> {
    if (size == 0) return listOf(emptyList())
    if (this.size < size) return emptyList()
    if (this.size == size) return listOf(this)
    val first = first()
    val rest = drop(1)
    return rest.combinations(size - 1).map { listOf(first) + it } + rest.combinations(size)
}
