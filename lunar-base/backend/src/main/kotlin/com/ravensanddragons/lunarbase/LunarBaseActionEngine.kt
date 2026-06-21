package com.ravensanddragons.lunarbase

import com.ravensanddragons.lunarbase.cards.LunarBaseActionScope
import com.ravensanddragons.lunarbase.cards.LunarBaseAgentCardDefinition
import com.ravensanddragons.lunarbase.cards.LunarBaseAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseAnyNumberFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseBuildAction
import com.ravensanddragons.lunarbase.cards.LunarBaseCardAction
import com.ravensanddragons.lunarbase.cards.LunarBaseChooseOneAction
import com.ravensanddragons.lunarbase.cards.LunarBaseChooseOpponentAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDiscardAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDoAllAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDraftAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDrawAction
import com.ravensanddragons.lunarbase.cards.LunarBaseFlipStationAction
import com.ravensanddragons.lunarbase.cards.LunarBaseFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseFlipStationToAction
import com.ravensanddragons.lunarbase.cards.LunarBaseGainCreditsAction
import com.ravensanddragons.lunarbase.cards.LunarBaseHandSizeAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseInfluenceCountAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseLiteralAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseLiteralFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseLoseCreditsAction
import com.ravensanddragons.lunarbase.cards.LunarBaseModuleCardDefinition
import com.ravensanddragons.lunarbase.cards.LunarBasePlayerReference
import com.ravensanddragons.lunarbase.cards.LunarBaseResellAction
import com.ravensanddragons.lunarbase.cards.LunarBaseScopedAction
import com.ravensanddragons.lunarbase.cards.LunarBaseSelfFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseStandardDeck
import com.ravensanddragons.lunarbase.cards.LunarBaseStationCardDefinition
import com.ravensanddragons.lunarbase.cards.LunarBaseStationSide
import com.ravensanddragons.lunarbase.cards.LunarBaseStealCreditsAction
import com.ravensanddragons.lunarbase.cards.LunarBaseStealModuleAction
import com.ravensanddragons.lunarbase.cards.LunarBaseStaticCardEffect
import com.ravensanddragons.lunarbase.cards.LunarBaseStaticEffect
import com.ravensanddragons.lunarbase.cards.LunarBaseTrigger
import com.ravensanddragons.lunarbase.cards.LunarBaseTriggeredCardEffect
import com.ravensanddragons.lunarbase.cards.LunarBaseViewHandAction
import com.ravensanddragons.platform.game.runtime.InvalidCommandException

internal data class LunarBaseMutableGame(
    var public: LunarBasePublicState,
    var private: LunarBasePrivateState
)

internal fun List<LunarBaseCardAction>.toActionNodes(): List<LunarBaseActionNode> =
    map { it.toActionNode() }

private const val discardInfluenceButtonValue = "discardInfluence"

private fun LunarBaseCardAction.toActionNode(): LunarBaseActionNode =
    when (this) {
        is LunarBaseChooseOneAction -> LunarBaseActionNode("chooseOne", actions = actions.toActionNodes())
        is LunarBaseDoAllAction -> LunarBaseActionNode("doAll", actions = actions.toActionNodes())
        is LunarBaseScopedAction -> LunarBaseActionNode("scoped", scope = scope.name, actions = actions.toActionNodes())
        LunarBaseChooseOpponentAction -> LunarBaseActionNode("chooseOpponent")
        is LunarBaseDiscardAction -> LunarBaseActionNode("discard", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseDraftAction -> LunarBaseActionNode("draft", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseDrawAction -> LunarBaseActionNode("draw", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseBuildAction -> LunarBaseActionNode("build", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseFlipStationAction -> LunarBaseActionNode("flipStation", flipAmount = amount.literalValue(), flipAmountKind = amount.kindValue())
        is LunarBaseFlipStationToAction -> LunarBaseActionNode("flipStationTo", side = side.name)
        is LunarBaseGainCreditsAction -> LunarBaseActionNode("gainCredits", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseLoseCreditsAction -> LunarBaseActionNode("loseCredits", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseResellAction -> LunarBaseActionNode("resell", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseStealCreditsAction -> LunarBaseActionNode("stealCredits", amount = amount.literalValue(), amountKind = amount.kindValue())
        is LunarBaseStealModuleAction -> LunarBaseActionNode("stealModule", moduleName = moduleName)
        is LunarBaseViewHandAction -> LunarBaseActionNode("viewHand", playerRef = player.name)
    }

private fun LunarBaseAmount.literalValue(): Int? =
    (this as? LunarBaseLiteralAmount)?.value

private fun LunarBaseAmount.kindValue(): String =
    when (this) {
        is LunarBaseLiteralAmount -> "literal"
        LunarBaseHandSizeAmount -> "handSize"
        LunarBaseInfluenceCountAmount -> "influenceCount"
    }

private fun LunarBaseFlipStationAmount.literalValue(): Int? =
    (this as? LunarBaseLiteralFlipStationAmount)?.value

private fun LunarBaseFlipStationAmount.kindValue(): String =
    when (this) {
        is LunarBaseLiteralFlipStationAmount -> "literal"
        LunarBaseAnyNumberFlipStationAmount -> "anyNumber"
        LunarBaseSelfFlipStationAmount -> "self"
    }

internal class LunarBaseActionEngine(
    private val gameId: String,
    private val shuffleVersion: Long
) {
    fun startActions(
        publicState: LunarBasePublicState,
        privateState: LunarBasePrivateState,
        actorIndex: Int,
        actions: List<LunarBaseCardAction>,
        mainActionChosen: Boolean,
        sourceCardName: String,
        allowInfluenceNegation: Boolean = false
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val game = LunarBaseMutableGame(publicState, privateState)
        val stack = actions.toActionNodes().asReversed().map {
            LunarBaseActionFrame(
                actorIndex,
                it,
                sourceCardName = sourceCardName,
                sourceActorIndex = actorIndex,
                influenceNegation = allowInfluenceNegation
            )
        }
        game.public = game.public.copy(
            actionState = LunarBaseActionState(
                phase = resolvingActionPhase,
                mainActionChosen = mainActionChosen,
                stack = stack,
                sourceCardName = sourceCardName
            )
        )
        return resolve(game)
    }

    fun resolve(
        game: LunarBaseMutableGame,
        stateOverride: LunarBaseActionState? = null
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        var actionState = stateOverride ?: game.public.actionState
        while (actionState.interaction == null && actionState.stack.isNotEmpty()) {
            val frame = actionState.stack.last()
            actionState = actionState.copy(
                stack = actionState.stack.dropLast(1),
                activeActions = listOf(frame.action),
                sourceCardName = frame.sourceCardName
            )
            actionState = executeFrame(game, actionState, frame)
            game.public = game.public.copy(actionState = actionState)
            if (finishIfWon(game)) {
                return game.public to game.private
            }
            actionState = game.public.actionState
        }
        if (actionState.interaction == null && actionState.stack.isEmpty()) {
            if (actionState.mainActionChosen) {
                game.public = advanceTurn(game.public.copy(actionState = LunarBaseActionState()))
                refillSupplyIfNeeded(game)
            } else {
                game.public = game.public.copy(actionState = LunarBaseActionState())
            }
        } else {
            game.public = game.public.copy(actionState = actionState)
        }
        game.public = game.public.withPrivateCounts(game.private).withBoardSummaries()
        finishIfWon(game)
        return game.public to game.private
    }

    fun chooseOption(game: LunarBaseMutableGame, optionIndex: Int): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "chooseOne") return game.public to game.private
        val chosen = interaction.action?.actions?.getOrNull(optionIndex) ?: return game.public to game.private
        return resolve(
            game,
            game.public.actionState.copy(
                interaction = null,
                stack = game.public.actionState.stack + LunarBaseActionFrame(
                    interaction.actorIndex,
                    chosen,
                    sourceCardName = game.public.actionState.sourceCardName,
                    sourceActorIndex = interaction.defendedAction?.sourceActorIndex,
                    influenceNegation = interaction.defendedAction?.influenceNegation ?: false
                ),
                activeActions = listOf(chosen)
            )
        )
    }

    fun choosePlayer(game: LunarBaseMutableGame, playerIndex: Int): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind !in setOf("chooseOpponent", "chooseScopeTarget", "stealCredits")) return game.public to game.private
        if (playerIndex !in game.public.players.indices) return game.public to game.private
        if (interaction.kind in setOf("chooseOpponent", "stealCredits") && playerIndex == interaction.actorIndex) {
            return game.public to game.private
        }
        if (interaction.kind == "stealCredits") {
            val sourceActor = interaction.defendedAction?.sourceActorIndex
            val influenceNegation = interaction.defendedAction?.influenceNegation ?: false
            if (influenceNegation && sourceActor == interaction.actorIndex && playerIndex != interaction.actorIndex && canDiscardInfluence(game, playerIndex)) {
                val defended = LunarBaseActionFrame(
                    interaction.actorIndex,
                    interaction.action ?: LunarBaseActionNode("stealCredits"),
                    remaining = interaction.remaining,
                    sourceCardName = game.public.actionState.sourceCardName,
                    sourceActorIndex = sourceActor,
                    influenceNegation = false
                )
                return game.public.copy(
                    actionState = game.public.actionState.copy(
                        interaction = influenceDefenseInteraction(defended, playerIndex),
                        chosenPlayerIndex = playerIndex
                    )
                ).withPrivateCounts(game.private).withBoardSummaries() to game.private
            }
            stealCredits(game, interaction.actorIndex, playerIndex, interaction.remaining)
            if (finishIfWon(game)) return game.public to game.private
            return resolve(game, game.public.actionState.copy(interaction = null))
        }
        val nextState = when (interaction.kind) {
            "chooseOpponent" -> game.public.actionState.copy(interaction = null, chosenPlayerIndex = playerIndex)
            else -> {
                if (interaction.action?.scope == LunarBaseActionScope.OPPONENT.name && playerIndex == interaction.actorIndex) {
                    return game.public to game.private
                }
                val scopedPlayers = when (interaction.action?.scope) {
                    LunarBaseActionScope.NEIGHBORS_OF_TARGET.name -> neighborIndexes(game.public, playerIndex)
                    LunarBaseActionScope.OPPONENT.name,
                    LunarBaseActionScope.TARGET.name -> listOf(playerIndex)
                    else -> emptyList()
                }
                game.public.actionState.copy(
                    interaction = null,
                    stack = game.public.actionState.stack + scopedFrames(
                        scopedPlayers,
                        interaction.action?.actions.orEmpty(),
                        game.public.actionState.sourceCardName,
                        interaction.defendedAction?.sourceActorIndex,
                        interaction.defendedAction?.influenceNegation ?: false
                    )
                )
            }
        }
        return resolve(game, nextState)
    }

    fun drawStock(game: LunarBaseMutableGame): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "draw" || interaction.remaining <= 0) return game.public to game.private
        game.private = ensureStock(game.private)
        val card = game.private.stock.firstOrNull()
            ?: return resolve(game, game.public.actionState.copy(interaction = null))
        val actor = interaction.actorIndex
        game.private = game.private.copy(
            stock = game.private.stock.drop(1),
            hands = game.private.hands.replaceAt(actor, game.private.hands[actor] + card)
        )
        game.public = game.public.copy(message = "Drew a card.")
        return repeatOrContinue(game, interaction) { canDraw(game) }
    }

    fun buildModule(
        game: LunarBaseMutableGame,
        cardId: String,
        x: Int,
        y: Int,
        rotation: Int
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "build") return game.public to game.private
        val actor = interaction.actorIndex
        val card = game.private.hands.getOrElse(actor) { emptyList() }.firstOrNull { it.id == cardId && it.type == moduleType }
            ?: return game.public to game.private
        playModuleFromHand(game, actor, card, x, y, rotation)
        if (finishIfWon(game)) return game.public to game.private
        val interrupt = (catalogDefinition(card) as? LunarBaseModuleCardDefinition)?.onPlaying.orEmpty().toActionNodes()
        val triggeredEffects = if (isDomeOrLaikaMemorial(card)) {
            triggeredEffects(game, LunarBaseTrigger.BUILD_DOME_OR_LAIKA_MEMORIAL, actor)
        } else {
            emptyList()
        }
        val remaining = interaction.remaining - 1
        val repeatFrame = if (remaining > 0) {
            listOf(interaction.copy(remaining = remaining).toFrame(remaining, game.public.actionState.sourceCardName).copy(influenceNegation = false))
        } else {
            emptyList()
        }
        val stack = game.public.actionState.stack +
            repeatFrame +
            interrupt.asReversed().map { LunarBaseActionFrame(actor, it, sourceCardName = card.name) } +
            triggeredEffects
        return resolve(game, game.public.actionState.copy(interaction = null, stack = stack))
    }

    fun stealModule(
        game: LunarBaseMutableGame,
        cardId: String,
        x: Int,
        y: Int,
        rotation: Int
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "stealModule") return game.public to game.private
        val actor = interaction.actorIndex
        val moduleName = interaction.action?.moduleName ?: return game.public to game.private
        val opponentIndex = game.public.players.indices.firstOrNull { playerIndex ->
            playerIndex != actor && game.public.players[playerIndex].board.any { it.card.id == cardId && it.card.type == moduleType && it.card.name == moduleName }
        } ?: return game.public to game.private
        val stolen = game.public.players[opponentIndex].board.first { it.card.id == cardId }
        val candidate = LunarBaseBoardCard(stolen.card, x, y, rotation)
        validateModulePlacementOrThrow(game.public.players[actor].board, candidate)
        val defended = (interaction.defendedAction ?: interaction.toFrame(interaction.remaining.takeIf { it > 0 }, game.public.actionState.sourceCardName)).copy(
            targetPlayerIndex = opponentIndex,
            targetCardId = cardId,
            targetX = x,
            targetY = y,
            targetRotation = rotation
        )
        if (canNegateWithInfluence(game, opponentIndex, defended)) {
            return game.public.copy(
                actionState = game.public.actionState.copy(interaction = influenceDefenseInteraction(defended, opponentIndex))
            ).withPrivateCounts(game.private).withBoardSummaries() to game.private
        }
        game.public = game.public.copy(
            players = game.public.players.mapIndexed { playerIndex, player ->
                when (playerIndex) {
                    actor -> player.copy(board = player.board + candidate)
                    opponentIndex -> player.copy(board = player.board.filterNot { it.card.id == cardId })
                    else -> player
                }
            },
            message = "Stole a module."
        )
        if (finishIfWon(game)) return game.public to game.private
        return resolve(game, game.public.actionState.copy(interaction = null))
    }

    fun draftSupply(game: LunarBaseMutableGame, slotIndex: Int): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "draft") return game.public to game.private
        val actor = interaction.actorIndex
        val card = game.public.supply.getOrNull(slotIndex) ?: return game.public to game.private
        if (card.type == influenceType && forbidsDraftingInfluence(game.public, card.id)) return game.public to game.private
        val triggeredEffects = if (card.type == influenceType) {
            triggeredEffects(game, LunarBaseTrigger.DRAFT_ANY_INFLUENCE, actor)
        } else {
            emptyList()
        }
        val supply = game.public.supply.toMutableList()
        supply[slotIndex] = null
        game.public = game.public.copy(supply = supply, message = "Drafted a card.")
        game.private = game.private.copy(hands = game.private.hands.replaceAt(actor, game.private.hands[actor] + card))
        return repeatOrContinue(game, interaction, triggeredEffects) { canDraft(game) }
    }

    fun resellSupply(game: LunarBaseMutableGame, slotIndex: Int): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "resell") return game.public to game.private
        val actor = interaction.actorIndex
        val card = game.public.supply.getOrNull(slotIndex) ?: return game.public to game.private
        if (card.type == influenceType) return game.public to game.private
        val supply = game.public.supply.toMutableList()
        supply[slotIndex] = null
        game.public = game.public.copy(
            supply = supply,
            players = game.public.players.replaceAt(actor, game.public.players[actor].copy(credits = game.public.players[actor].credits + 1)),
            message = "Resold a card."
        )
        game.private = game.private.copy(discard = listOf(card) + game.private.discard)
        return repeatOrContinue(game, interaction) { canResell(game) }
    }

    fun discardHandCard(game: LunarBaseMutableGame, cardId: String): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind !in setOf("discard", "discardInfluence")) return game.public to game.private
        val actor = interaction.actorIndex
        val hand = game.private.hands[actor]
        val card = hand.firstOrNull { it.id == cardId } ?: return game.public to game.private
        if (interaction.kind == "discardInfluence" && card.type != influenceType) return game.public to game.private
        game.private = game.private.copy(
            hands = game.private.hands.replaceAt(actor, hand.filterNot { it.id == cardId }),
            discard = listOf(card) + game.private.discard
        )
        game.public = game.public.copy(message = "Discarded a card.")
        if (interaction.kind == "discardInfluence") {
            return resolve(
                game,
                game.public.actionState.copy(
                    interaction = null,
                    stack = game.public.actionState.stack + triggeredDiscardEffects(card, actor)
                )
            )
        }
        return repeatOrContinue(game, interaction, triggeredDiscardEffects(card, actor)) { game.private.hands[actor].isNotEmpty() }
    }

    fun flipStation(game: LunarBaseMutableGame, playerIndex: Int, cardId: String? = null): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind !in setOf("flipStation", "flipStationTo")) return game.public to game.private
        val target = if (interaction.kind == "flipStationTo" || interaction.action?.flipAmountKind == "self") {
            interaction.actorIndex
        } else {
            playerIndex
        }
        if (target !in game.public.players.indices) return game.public to game.private
        val alreadyFlipped = interaction.flippedStationIds.toSet()
        val station = game.public.players[target].board.firstOrNull { it.card.type == stationType && (cardId == null || it.card.id == cardId) }
            ?: return game.public to game.private
        if (station.card.id in alreadyFlipped) return game.public to game.private
        val desiredSide = interaction.action?.side?.let { LunarBaseStationSide.valueOf(it) }
        val nextFlipped = desiredSide?.let { it == LunarBaseStationSide.AGENDA_SIDE } ?: !station.card.flipped
        if (station.card.flipped == nextFlipped && interaction.kind == "flipStationTo") {
            return game.public.withPrivateCounts(game.private).withBoardSummaries() to game.private
        }
        val defended = (interaction.defendedAction ?: interaction.toFrame(interaction.remaining.takeIf { it > 0 }, game.public.actionState.sourceCardName)).copy(
            targetPlayerIndex = target,
            targetCardId = station.card.id
        )
        if (canNegateWithInfluence(game, target, defended)) {
            return game.public.copy(
                actionState = game.public.actionState.copy(interaction = influenceDefenseInteraction(defended, target))
            ).withPrivateCounts(game.private).withBoardSummaries() to game.private
        }
        game.public = game.public.copy(
            players = game.public.players.replaceAt(
                target,
                game.public.players[target].copy(
                    board = game.public.players[target].board.map {
                        if (it.card.id == station.card.id) it.copy(card = it.card.copy(flipped = nextFlipped)) else it
                    }
                )
            ),
            message = "Flipped station."
        )
        if (finishIfWon(game)) return game.public to game.private
        if (interaction.kind == "flipStationTo") return resolve(game, game.public.actionState.copy(interaction = null))
        val remaining = maxOf(0, interaction.remaining - 1)
        val nextInteraction = interaction.copy(
            remaining = remaining,
            flippedStationIds = interaction.flippedStationIds + station.card.id
        )
        if (nextInteraction.remaining <= 0 || allStationIds(game).all { it in nextInteraction.flippedStationIds }) {
            return resolve(game, game.public.actionState.copy(interaction = null))
        }
        game.public = game.public.copy(actionState = game.public.actionState.copy(interaction = nextInteraction))
        return game.public.withPrivateCounts(game.private).withBoardSummaries() to game.private
    }

    fun finishInteraction(game: LunarBaseMutableGame): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        return when (interaction.kind) {
            "influenceDefense" -> {
                val defended = interaction.defendedAction ?: return resolve(game, game.public.actionState.copy(interaction = null))
                when (defended.action.kind) {
                    "stealCredits" -> {
                        val chosenPlayerIndex = game.public.actionState.chosenPlayerIndex
                        if (chosenPlayerIndex != null) {
                            stealCredits(game, defended.actorIndex, chosenPlayerIndex, defended.remaining ?: 0)
                            if (finishIfWon(game)) return game.public to game.private
                            return resolve(game, game.public.actionState.copy(interaction = null))
                        }
                    }
                    "flipStation" -> return allowDefendedFlipStation(game, defended)
                    "stealModule" -> return allowDefendedStealModule(game, defended)
                }
                resolve(
                    game,
                    game.public.actionState.copy(
                        interaction = null,
                        stack = game.public.actionState.stack + defended.copy(influenceNegation = false)
                    )
                )
            }
            "build", "flipStation", "flipStationTo", "stealCredits", "stealModule", "viewHand" -> resolve(game, game.public.actionState.copy(interaction = null))
            else -> game.public to game.private
        }
    }

    fun startInfluenceNegation(game: LunarBaseMutableGame): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        val defended = when (interaction.kind) {
            "influenceDefense" -> interaction.defendedAction
            else -> interaction.toFrame(interaction.remaining.takeIf { it > 0 }, game.public.actionState.sourceCardName)
        } ?: return game.public to game.private
        if (!canDiscardInfluence(game, interaction.actorIndex)) return game.public to game.private
        val discardAction = LunarBaseActionNode(kind = "discardInfluence", amount = 1, amountKind = "literal")
        game.public = game.public.copy(
            actionState = game.public.actionState.copy(
                interaction = LunarBaseActionInteraction(
                    kind = "discardInfluence",
                    actorIndex = interaction.actorIndex,
                    remaining = 1,
                    action = discardAction,
                    defendedAction = defended
                ),
                activeActions = listOf(discardAction)
            )
        )
        return game.public.withPrivateCounts(game.private).withBoardSummaries() to game.private
    }

    private fun allowDefendedFlipStation(
        game: LunarBaseMutableGame,
        defended: LunarBaseActionFrame
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val target = defended.targetPlayerIndex ?: defended.actorIndex
        val allowedInteraction = actionInteraction(
            game.public,
            defended.actorIndex,
            defended.action,
            "flipStation",
            remaining = defended.remaining ?: 1
        ).copy(
            defendedAction = defended.copy(influenceNegation = false),
            flippedStationIds = game.public.actionState.interaction?.flippedStationIds.orEmpty()
        )
        game.public = game.public.copy(actionState = game.public.actionState.copy(interaction = allowedInteraction))
        return flipStation(game, target, defended.targetCardId)
    }

    private fun allowDefendedStealModule(
        game: LunarBaseMutableGame,
        defended: LunarBaseActionFrame
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val cardId = defended.targetCardId ?: return resolve(game, game.public.actionState.copy(interaction = null))
        val x = defended.targetX ?: return resolve(game, game.public.actionState.copy(interaction = null))
        val y = defended.targetY ?: return resolve(game, game.public.actionState.copy(interaction = null))
        val rotation = defended.targetRotation ?: return resolve(game, game.public.actionState.copy(interaction = null))
        val allowedInteraction = actionInteraction(
            game.public,
            defended.actorIndex,
            defended.action,
            "stealModule"
        ).copy(defendedAction = defended.copy(influenceNegation = false))
        game.public = game.public.copy(actionState = game.public.actionState.copy(interaction = allowedInteraction))
        return stealModule(game, cardId, x, y, rotation)
    }

    private fun executeFrame(
        game: LunarBaseMutableGame,
        actionState: LunarBaseActionState,
        frame: LunarBaseActionFrame
    ): LunarBaseActionState {
        val action = frame.action
        val actor = frame.actorIndex
        if (shouldOfferInfluenceNegationChoice(game, frame)) {
            return actionState.copy(interaction = influenceDefenseInteraction(frame))
        }
        return when (action.kind) {
            "doAll" -> actionState.copy(
                stack = actionState.stack + action.actions.asReversed().map {
                    LunarBaseActionFrame(
                        actor,
                        it,
                        sourceCardName = frame.sourceCardName,
                        sourceActorIndex = frame.sourceActorIndex,
                        influenceNegation = frame.influenceNegation
                    )
                }
            )
            "chooseOne" -> if (action.actions.isEmpty()) {
                actionState
            } else {
                actionState.copy(interaction = actionInteraction(game.public, actor, action, "chooseOne").copy(defendedAction = frame))
            }
            "scoped" -> startScoped(game.public, actionState, frame, action)
            "chooseOpponent" -> actionState.copy(interaction = actionInteraction(game.public, actor, action, "chooseOpponent").copy(defendedAction = frame))
            "draw" -> {
                val amount = resolveAmount(game, actor, action)
                if (amount <= 0 || !canDraw(game)) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "draw", remaining = amount).withInfluenceNegationButton(game, frame.copy(remaining = amount))
                )
            }
            "gainCredits" -> {
                val amount = resolveAmount(game, actor, action)
                if (amount <= 0) actionState else {
                    gainCredits(game, actor, amount)
                    actionState
                }
            }
            "loseCredits" -> {
                val amount = resolveAmount(game, actor, action)
                if (amount <= 0) actionState else {
                    loseCredits(game, actor, amount)
                    actionState
                }
            }
            "build" -> {
                val amount = frame.remaining ?: resolveAmount(game, actor, action)
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "build", remaining = amount).withInfluenceNegationButton(game, frame.copy(remaining = amount))
                )
            }
            "draft" -> {
                val amount = minOf(frame.remaining ?: resolveAmount(game, actor, action), game.public.supply.count { it != null })
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "draft", remaining = amount).withInfluenceNegationButton(game, frame.copy(remaining = amount))
                )
            }
            "resell" -> {
                val amount = minOf(frame.remaining ?: resolveAmount(game, actor, action), game.public.supply.count { it != null && it.type != influenceType })
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "resell", remaining = amount).withInfluenceNegationButton(game, frame.copy(remaining = amount))
                )
            }
            "discard" -> {
                val amount = frame.remaining ?: resolveAmount(game, actor, action)
                if (amount <= 0 || game.private.hands[actor].isEmpty()) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "discard", remaining = amount).withInfluenceNegationButton(game, frame.copy(remaining = amount))
                )
            }
            "flipStation" -> startFlipStation(game, actionState, frame, action)
            "flipStationTo" -> startFlipStationTo(game, actionState, frame, action)
            "stealCredits" -> {
                val amount = resolveAmount(game, actor, action)
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(
                        game.public,
                        actor,
                        action,
                        if (hasStaticEffect(game.public, LunarBaseStaticEffect.FORBID_STEALING_CREDITS)) "stealCreditsForbidden" else "stealCredits",
                        remaining = amount
                    ).copy(defendedAction = frame.copy(remaining = amount))
                )
            }
            "stealModule" -> startStealModule(game, actionState, frame, action)
            "viewHand" -> startViewHand(game, actionState, frame, action)
            else -> actionState
        }
    }

    private fun startStealModule(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        frame: LunarBaseActionFrame,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val actor = frame.actorIndex
        val kind = if (stealableModules(game.public, actor, action.moduleName).isEmpty()) "stealModuleEmpty" else "stealModule"
        return state.copy(interaction = actionInteraction(game.public, actor, action, kind).copy(defendedAction = frame))
    }

    private fun startScoped(
        public: LunarBasePublicState,
        state: LunarBaseActionState,
        frame: LunarBaseActionFrame,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val actor = frame.actorIndex
        val players = when (action.scope) {
            LunarBaseActionScope.CHOSEN_PLAYER.name -> listOf(
                checkNotNull(state.chosenPlayerIndex) { "chosenPlayer scope requires a chosen player." }
            )
            LunarBaseActionScope.EACH_OPPONENT.name -> turnOrder(public, nextPlayerIndex(actor, public.config.playerCount)).filterNot { it == actor }
            LunarBaseActionScope.EACH_PLAYER.name -> turnOrder(public, actor)
            LunarBaseActionScope.NEIGHBORS_OF_TARGET.name,
            LunarBaseActionScope.OPPONENT.name,
            LunarBaseActionScope.TARGET.name -> return state.copy(interaction = actionInteraction(public, actor, action, "chooseScopeTarget").copy(defendedAction = frame))
            else -> emptyList()
        }
        return state.copy(stack = state.stack + scopedFrames(players, action.actions, state.sourceCardName, frame.sourceActorIndex, frame.influenceNegation))
    }

    private fun scopedFrames(
        players: List<Int>,
        actions: List<LunarBaseActionNode>,
        sourceCardName: String?,
        sourceActorIndex: Int? = null,
        influenceNegation: Boolean = false
    ): List<LunarBaseActionFrame> =
        players.asReversed().flatMap { player ->
            actions.asReversed().map {
                LunarBaseActionFrame(player, it, sourceCardName = sourceCardName, sourceActorIndex = sourceActorIndex, influenceNegation = influenceNegation)
            }
        }

    private fun startViewHand(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        frame: LunarBaseActionFrame,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val actor = frame.actorIndex
        val target = when (action.playerRef) {
            LunarBasePlayerReference.CHOSEN_PLAYER.name -> state.chosenPlayerIndex
            else -> null
        } ?: error("viewHand requires a target player.")
        if (canNegateWithInfluence(game, target, frame)) {
            return state.copy(interaction = influenceDefenseInteraction(frame.copy(targetPlayerIndex = target), target))
        }
        return state.copy(interaction = LunarBaseActionInteraction(
            kind = "viewHand",
            actorIndex = actor,
            buttons = listOf(LunarBaseActionButton("Done viewing", "done")),
            action = action,
            targetPlayerIndex = target,
            defendedAction = frame
        ))
    }

    private fun startFlipStation(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        frame: LunarBaseActionFrame,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val actor = frame.actorIndex
        val amountKind = action.flipAmountKind
        if (amountKind == "self") {
            return if (game.public.players[actor].board.any { it.card.type == stationType }) {
                state.copy(interaction = actionInteraction(game.public, actor, action, "flipStation", remaining = 1).copy(defendedAction = frame.copy(remaining = 1)))
            } else {
                state
            }
        }
        val max = allStationIds(game).size
        val amount = if (amountKind == "anyNumber") max else minOf(action.flipAmount ?: 0, max)
        if (amount <= 0) return state
        return state.copy(interaction = actionInteraction(game.public, actor, action, "flipStation", remaining = amount).copy(defendedAction = frame.copy(remaining = amount)))
    }

    private fun startFlipStationTo(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        frame: LunarBaseActionFrame,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val actor = frame.actorIndex
        val station = game.public.players[actor].board.firstOrNull { it.card.type == stationType } ?: return state
        val target = action.side?.let { LunarBaseStationSide.valueOf(it) } ?: return state
        val desiredFlipped = target == LunarBaseStationSide.AGENDA_SIDE
        return if (station.card.flipped == desiredFlipped) {
            state.copy(interaction = actionInteraction(game.public, actor, action, "flipStationToAlready").copy(defendedAction = frame))
        } else {
            state.copy(interaction = actionInteraction(game.public, actor, action, "flipStationTo").copy(defendedAction = frame))
        }
    }

    private fun repeatOrContinue(
        game: LunarBaseMutableGame,
        interaction: LunarBaseActionInteraction,
        triggeredFrames: List<LunarBaseActionFrame>,
        canContinue: () -> Boolean
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val remaining = interaction.remaining - 1
        if (finishIfWon(game)) return game.public to game.private
        val repeatFrames = if (remaining > 0 && canContinue()) {
            listOf(interaction.copy(remaining = remaining).toFrame(remaining, game.public.actionState.sourceCardName).copy(influenceNegation = false))
        } else {
            emptyList()
        }
        if (triggeredFrames.isNotEmpty()) {
            return resolve(
                game,
                game.public.actionState.copy(
                    interaction = null,
                    stack = game.public.actionState.stack + repeatFrames + triggeredFrames
                )
            )
        }
        if (repeatFrames.isNotEmpty()) {
            game.public = game.public.copy(
                actionState = game.public.actionState.copy(
                    interaction = interaction.copy(
                        remaining = remaining,
                        buttons = interaction.buttons.filterNot { it.value == discardInfluenceButtonValue },
                        defendedAction = null
                    )
                )
            )
            return game.public.withPrivateCounts(game.private).withBoardSummaries() to game.private
        }
        return resolve(game, game.public.actionState.copy(interaction = null))
    }

    private fun repeatOrContinue(
        game: LunarBaseMutableGame,
        interaction: LunarBaseActionInteraction,
        canContinue: () -> Boolean
    ): Pair<LunarBasePublicState, LunarBasePrivateState> =
        repeatOrContinue(game, interaction, emptyList(), canContinue)

    private fun actionInteraction(
        public: LunarBasePublicState,
        actor: Int,
        action: LunarBaseActionNode,
        kind: String,
        remaining: Int = 0
    ): LunarBaseActionInteraction {
        val interactionPrompt = when (kind) {
            "stealModuleEmpty" -> LunarBaseInteractionPrompt("No module to steal")
            "stealCreditsForbidden" -> LunarBaseInteractionPrompt("Stealing credits is forbidden")
            else -> null
        }
        val buttons = when (kind) {
            "chooseOne" -> action.actions.mapIndexed { index, option ->
                LunarBaseActionButton(option.toActionText(), index.toString())
            }
            "chooseOpponent" -> public.players.indices
                .filterNot { it == actor }
                .map { LunarBaseActionButton(public.seats[it].displayName ?: "Player ${it + 1}", it.toString()) }
            "chooseScopeTarget" -> scopedTargetIndexes(public, actor, action)
                .map { LunarBaseActionButton(public.seats[it].displayName ?: "Player ${it + 1}", it.toString()) }
            "stealCredits" -> public.players.indices
                .filterNot { it == actor }
                .map { LunarBaseActionButton(public.seats[it].displayName ?: "Player ${it + 1}", it.toString()) }
            "stealCreditsForbidden" -> listOf(LunarBaseActionButton("Skip stealing credits", "skip"))
            "build" -> listOf(LunarBaseActionButton("Skip Build", "skip"))
            "flipStation" -> if (action.flipAmountKind == "anyNumber") {
                listOf(LunarBaseActionButton("Done flipping stations", "done"))
            } else {
                emptyList()
            }
            "flipStationToAlready" -> listOf(LunarBaseActionButton("Station is already flipped", "done"))
            "stealModuleEmpty" -> listOf(LunarBaseActionButton("Skip steal", "skip"))
            else -> emptyList()
        }
        return LunarBaseActionInteraction(
            kind = when (kind) {
                "flipStationToAlready" -> "flipStationTo"
                "stealModuleEmpty" -> "stealModule"
                "stealCreditsForbidden" -> "stealCredits"
                else -> kind
            },
            actorIndex = actor,
            interactionPrompt = interactionPrompt,
            buttons = buttons,
            remaining = remaining,
            action = action
        )
    }

    private fun LunarBaseActionInteraction.withInfluenceNegationButton(
        game: LunarBaseMutableGame,
        defended: LunarBaseActionFrame
    ): LunarBaseActionInteraction {
        if (!canNegateWithInfluence(game, defended.actorIndex, defended)) {
            return copy(defendedAction = defended)
        }
        return copy(
            buttons = buttons + LunarBaseActionButton("Discard influence", discardInfluenceButtonValue),
            defendedAction = defended
        )
    }

    private fun shouldOfferInfluenceNegationChoice(game: LunarBaseMutableGame, frame: LunarBaseActionFrame): Boolean =
        frame.action.kind in setOf("gainCredits", "loseCredits", "viewHand") &&
            canNegateWithInfluence(game, frame.actorIndex, frame)

    private fun influenceDefenseInteraction(
        defended: LunarBaseActionFrame,
        defenderIndex: Int = defended.actorIndex
    ): LunarBaseActionInteraction =
        LunarBaseActionInteraction(
            kind = "influenceDefense",
            actorIndex = defenderIndex,
            buttons = listOf(
                LunarBaseActionButton("Allow action", "done"),
                LunarBaseActionButton("Discard influence", discardInfluenceButtonValue)
            ),
            action = defended.action,
            defendedAction = defended
        )

    private fun canNegateWithInfluence(game: LunarBaseMutableGame, defenderIndex: Int, frame: LunarBaseActionFrame): Boolean =
        frame.influenceNegation &&
            frame.sourceActorIndex != null &&
            frame.sourceActorIndex != defenderIndex &&
            canDiscardInfluence(game, defenderIndex)

    private fun canDiscardInfluence(game: LunarBaseMutableGame, actor: Int): Boolean =
        game.private.hands.getOrElse(actor) { emptyList() }.any { it.type == influenceType }

    private fun gainCredits(game: LunarBaseMutableGame, actor: Int, amount: Int) {
        val player = game.public.players[actor]
        game.public = game.public.copy(
            players = game.public.players.replaceAt(actor, player.copy(credits = player.credits + amount)),
            message = "Gained credits."
        )
    }

    private fun loseCredits(game: LunarBaseMutableGame, actor: Int, amount: Int) {
        val player = game.public.players[actor]
        game.public = game.public.copy(
            players = game.public.players.replaceAt(actor, player.copy(credits = maxOf(0, player.credits - amount))),
            message = "Lost credits."
        )
    }

    private fun resolveAmount(game: LunarBaseMutableGame, actor: Int, action: LunarBaseActionNode): Int =
        when (action.amountKind) {
            "handSize" -> game.private.hands.getOrElse(actor) { emptyList() }.size
            "influenceCount" -> game.public.supply.count { it?.type == influenceType }
            else -> action.amount ?: 0
        }.coerceAtLeast(0)

    private fun canDraft(game: LunarBaseMutableGame): Boolean =
        game.public.supply.any { it != null }

    private fun canResell(game: LunarBaseMutableGame): Boolean =
        game.public.supply.any { it != null && it.type != influenceType }

    private fun canDraw(game: LunarBaseMutableGame): Boolean =
        game.private.stock.isNotEmpty() || game.private.discard.isNotEmpty()

    private fun playModuleFromHand(game: LunarBaseMutableGame, actor: Int, card: LunarBaseCard, x: Int, y: Int, rotation: Int) {
        val player = game.public.players[actor]
        val candidate = LunarBaseBoardCard(card, x, y, rotation)
        validateModulePlacementOrThrow(player.board, candidate)
        val cost = card.creditCost(player.orbs)
        if (cost > player.credits) {
            throw InvalidCommandException("You do not have enough credits to play that card.")
        }
        game.public = game.public.copy(
            players = game.public.players.replaceAt(actor, player.copy(credits = player.credits - cost, board = player.board + candidate)),
            message = "Played a module."
        )
        game.private = game.private.copy(hands = game.private.hands.replaceAt(actor, game.private.hands[actor].filterNot { it.id == card.id }))
    }

    private fun stealCredits(game: LunarBaseMutableGame, actor: Int, opponent: Int, amount: Int) {
        val taken = minOf(amount, game.public.players[opponent].credits)
        game.public = game.public.copy(
            players = game.public.players.mapIndexed { index, player ->
                when (index) {
                    actor -> player.copy(credits = player.credits + taken)
                    opponent -> player.copy(credits = player.credits - taken)
                    else -> player
                }
            },
            message = "Stole credits."
        )
    }

    private fun validateModulePlacementOrThrow(board: List<LunarBaseBoardCard>, candidate: LunarBaseBoardCard) {
        when (validateModulePlacement(board, candidate)) {
            PlacementValidationResult.VALID -> Unit
            PlacementValidationResult.INVALID_ROTATION -> throw InvalidCommandException("Module rotation must be 0, 90, 180, or 270.")
            PlacementValidationResult.OVERLAPS_CARD -> throw InvalidCommandException("That board position overlaps another card.")
            PlacementValidationResult.DOES_NOT_TOUCH_BOARD -> throw InvalidCommandException("A played card must touch another card.")
            PlacementValidationResult.CONNECTORS_DO_NOT_MATCH -> throw InvalidCommandException("A played card's connectors must match adjacent cards.")
        }
    }

    private fun stealableModules(public: LunarBasePublicState, actor: Int, moduleName: String?): List<LunarBaseBoardCard> =
        public.players.flatMapIndexed { playerIndex, player ->
            if (playerIndex == actor) {
                emptyList()
            } else {
                player.board.filter { boardCard ->
                    boardCard.card.type == moduleType &&
                        boardCard.card.name == moduleName &&
                        hasLegalPlacement(public.players[actor].board, boardCard.card)
                }
            }
        }

    private fun hasLegalPlacement(board: List<LunarBaseBoardCard>, card: LunarBaseCard): Boolean {
        val cells = board.flatMap { it.coveredCells() }
        val minX = (cells.minOfOrNull { it.first } ?: 0) - 1
        val maxX = (cells.maxOfOrNull { it.first } ?: 1) + 1
        val minY = (cells.minOfOrNull { it.second } ?: 0) - 1
        val maxY = (cells.maxOfOrNull { it.second } ?: 1) + 1
        return listOf(0, 90, 180, 270).any { rotation ->
            (minX..maxX).any { x ->
                (minY..maxY).any { y ->
                    validateModulePlacement(board, LunarBaseBoardCard(card, x, y, rotation)) == PlacementValidationResult.VALID
                }
            }
        }
    }

    private fun advanceTurn(public: LunarBasePublicState): LunarBasePublicState =
        public.copy(
            currentPlayerIndex = nextPlayerIndex(public.currentPlayerIndex, public.config.playerCount),
            message = "Turn complete."
        )

    private fun refillSupplyIfNeeded(game: LunarBaseMutableGame) {
        if (game.public.supply.filterNotNull().any { it.type != influenceType }) return
        val keptInfluences = game.public.supply.filterNotNull()
        val shuttleCreditColors = if (hasStaticEffect(game.public, LunarBaseStaticEffect.NO_SHUTTLE_CREDITS)) {
            emptySet()
        } else if (hasStaticEffect(game.public, LunarBaseStaticEffect.RED_ORBS_GAIN_CREDITS)) {
            setOf("red", "yellow", "gray")
        } else {
            setOf("yellow", "gray")
        }
        game.public = game.public.copy(
            supply = keptInfluences,
            players = game.public.players.map { player ->
                player.copy(credits = player.credits + player.shuttleCredits(shuttleCreditColors))
            }
        )
        val refillTarget = keptInfluences.size + supplySize(game.public.config.playerCount)
        while (game.public.supply.size < refillTarget) {
            game.private = ensureStock(game.private)
            val nextCard = game.private.stock.firstOrNull() ?: break
            game.public = game.public.copy(supply = game.public.supply + nextCard)
            game.private = game.private.copy(stock = game.private.stock.drop(1))
        }
    }

    private fun finishIfWon(game: LunarBaseMutableGame): Boolean {
        game.public = game.public.withPrivateCounts(game.private).withBoardSummaries().withEndGameResultIfWon()
        return game.public.lifecycle == finishedLifecycle
    }

    private fun ensureStock(privateState: LunarBasePrivateState): LunarBasePrivateState {
        if (privateState.stock.isNotEmpty() || privateState.discard.isEmpty()) return privateState
        return privateState.copy(
            stock = privateState.discard.shuffled(randomFor(gameId, "discard-$shuffleVersion-${privateState.discard.size}")),
            discard = emptyList()
        )
    }

    private fun triggeredDiscardEffects(card: LunarBaseCard, actor: Int): List<LunarBaseActionFrame> =
        if (card.type == influenceType) {
            triggeredEffect(card, LunarBaseTrigger.DISCARD_THIS_INFLUENCE, actor)
        } else {
            emptyList()
        }

    private fun triggeredEffects(
        game: LunarBaseMutableGame,
        trigger: LunarBaseTrigger,
        actor: Int
    ): List<LunarBaseActionFrame> =
        effectSourceCards(game.public).flatMap { card -> triggeredEffect(card, trigger, actor) }

    private fun triggeredEffect(
        sourceCard: LunarBaseCard,
        trigger: LunarBaseTrigger,
        actor: Int
    ): List<LunarBaseActionFrame> {
        val effect = cardEffect(sourceCard) as? LunarBaseTriggeredCardEffect ?: return emptyList()
        if (effect.trigger != trigger) return emptyList()
        return effect.actions.toActionNodes().asReversed().map { action ->
            LunarBaseActionFrame(actor, action, sourceCardName = sourceCard.name)
        }
    }

    private fun forbidsDraftingInfluence(public: LunarBasePublicState, draftedCardId: String): Boolean =
        public.supply.filterNotNull().any { card ->
            card.id != draftedCardId &&
                (cardEffect(card) as? LunarBaseStaticCardEffect)?.effect == LunarBaseStaticEffect.FORBID_DRAFT_OTHER_INFLUENCE
        }

    private fun hasStaticEffect(public: LunarBasePublicState, effect: LunarBaseStaticEffect): Boolean =
        effectSourceCards(public).any { card ->
            (cardEffect(card) as? LunarBaseStaticCardEffect)?.effect == effect
        }

    private fun effectSourceCards(public: LunarBasePublicState): List<LunarBaseCard> =
        public.supply.filterNotNull().filter { it.type == influenceType } +
            public.players.flatMap { player ->
                player.board.map { it.card }.filter { it.type == moduleType }
            }

    private fun cardEffect(card: LunarBaseCard) =
        when (val definition = catalogDefinition(card)) {
            is LunarBaseModuleCardDefinition -> definition.effect
            is com.ravensanddragons.lunarbase.cards.LunarBaseInfluenceCardDefinition -> definition.effect
            else -> null
        }

    private fun isDomeOrLaikaMemorial(card: LunarBaseCard): Boolean =
        card.type == moduleType && (card.name.contains("Dome") || card.name == "Laika Memorial")

    private fun LunarBasePlayerPublic.shuttleCredits(colors: Set<String>): Int =
        (if ("red" in colors) orbs.red else 0) +
            (if ("yellow" in colors) orbs.yellow else 0) +
            (if ("gray" in colors) orbs.gray else 0)

    private fun LunarBaseActionInteraction.toFrame(
        remainingOverride: Int? = null,
        sourceCardName: String? = null
    ): LunarBaseActionFrame =
        (defendedAction ?: LunarBaseActionFrame(actorIndex, action ?: LunarBaseActionNode(kind))).copy(
            actorIndex = actorIndex,
            action = action ?: defendedAction?.action ?: LunarBaseActionNode(kind),
            remaining = remainingOverride,
            sourceCardName = sourceCardName
        )

    private fun allStationIds(game: LunarBaseMutableGame): List<String> =
        game.public.players.flatMap { player -> player.board.filter { it.card.type == stationType }.map { it.card.id } }

    private fun turnOrder(public: LunarBasePublicState, start: Int): List<Int> =
        (0 until public.config.playerCount).map { (start + it) % public.config.playerCount }

    private fun neighborIndexes(public: LunarBasePublicState, target: Int): List<Int> {
        val count = public.config.playerCount
        val previous = (target - 1 + count) % count
        val next = (target + 1) % count
        return if (previous == next) listOf(previous) else listOf(previous, next)
    }

    private fun scopedTargetIndexes(public: LunarBasePublicState, actor: Int, action: LunarBaseActionNode): List<Int> =
        when (action.scope) {
            LunarBaseActionScope.OPPONENT.name -> public.players.indices.filterNot { it == actor }.toList()
            LunarBaseActionScope.TARGET.name,
            LunarBaseActionScope.NEIGHBORS_OF_TARGET.name -> public.players.indices.toList()
            else -> emptyList()
        }

}

internal fun LunarBaseActionNode.toActionText(): String =
    when (kind) {
        "chooseOne" -> "Choose one"
        "doAll" -> actions.joinToString("; ") { it.toActionText() }
        "scoped" -> scope.toScopeActionText(actions)
        "chooseOpponent" -> "Choose an opponent"
        "discardInfluence" -> "Discard an influence"
        "discard" -> amountText("Discard", "card")
        "draft" -> amountText("Draft", "card")
        "draw" -> amountText("Draw", "card")
        "build" -> amountText("Build", "module")
        "flipStation" -> when (flipAmountKind) {
            "self" -> "Flip your station"
            "anyNumber" -> "Flip any number of stations"
            else -> "Flip ${flipAmount ?: 0} ${if (flipAmount == 1) "station" else "stations"}"
        }
        "flipStationTo" -> "Flip your station to ${if (side == LunarBaseStationSide.AGENDA_SIDE.name) "Agenda Side" else "Terran Outpost"}"
        "gainCredits" -> amountText("Gain", "credit")
        "loseCredits" -> amountText("Lose", "credit")
        "resell" -> amountText("Resell", "card")
        "stealCredits" -> amountText("Steal", "credit")
        "stealModule" -> "Steal a ${moduleName.orEmpty()}"
        "viewHand" -> "View chosen player's hand"
        else -> kind
    }

internal fun LunarBaseActionNode.toFullActionText(remaining: Int? = null): String =
    when (kind) {
        "chooseOne" -> if (actions.isEmpty()) {
            "Choose one"
        } else {
            "Choose one:\n${actions.joinToString("\n") { it.toActionText() }}"
        }
        "doAll" -> actions.joinToString("\n") { it.toActionText() }
        "scoped" -> scope.toScopeActionText(actions)
        else -> toActionText()
    }.withRemainingText(remaining)

private fun LunarBaseActionNode.isRepeatingAction(): Boolean =
    when (kind) {
        "build", "draw", "draft", "resell", "discard" -> true
        "flipStation" -> flipAmountKind != "self"
        else -> false
    }

private fun String?.toScopeActionText(actions: List<LunarBaseActionNode>): String =
    when (this) {
        LunarBaseActionScope.OPPONENT.name -> "Opponent: ${actions.joinToString("; ") { it.toActionText() }}"
        LunarBaseActionScope.TARGET.name -> "Target: ${actions.joinToString("; ") { it.toActionText() }}"
        LunarBaseActionScope.NEIGHBORS_OF_TARGET.name -> "Neighbors of target: ${actions.joinToString("; ") { it.toActionText() }}"
        LunarBaseActionScope.CHOSEN_PLAYER.name -> "Chosen player: ${actions.joinToString("; ") { it.toActionText() }}"
        LunarBaseActionScope.EACH_OPPONENT.name -> "Each opponent: ${actions.joinToString("; ") { it.toActionText() }}"
        LunarBaseActionScope.EACH_PLAYER.name -> "Each player: ${actions.joinToString("; ") { it.toActionText() }}"
        else -> "${orEmpty()}: ${actions.joinToString("; ") { it.toActionText() }}"
    }

private fun LunarBaseActionNode.amountText(verb: String, singular: String): String =
    when (amountKind) {
        "handSize" -> "$verb ${singular}s equal to your hand size"
        "influenceCount" -> "$verb ${singular}s equal to the number of influences in the supply"
        else -> "$verb ${amount ?: 0} ${if (amount == 1) singular else "${singular}s"}"
    }

private fun String.withRemainingText(remaining: Int?): String =
    if (remaining == null || remaining <= 0) this else "$this ($remaining left)"

internal fun LunarBaseCard.mainActions(): List<LunarBaseCardAction> =
    when (type) {
        stationType -> if (flipped) {
            (catalogDefinition(this) as? LunarBaseStationCardDefinition)?.mainAction.orEmpty()
        } else {
            LunarBaseStandardDeck.definition.stationFront.mainAction
        }
        moduleType -> (catalogDefinition(this) as? LunarBaseModuleCardDefinition)?.mainAction.orEmpty()
        else -> emptyList()
    }

internal fun LunarBaseCard.onPlayingActions(): List<LunarBaseCardAction> =
    when (val definition = catalogDefinition(this)) {
        is LunarBaseAgentCardDefinition -> definition.onPlaying
        is LunarBaseModuleCardDefinition -> definition.onPlaying
        else -> emptyList()
    }
