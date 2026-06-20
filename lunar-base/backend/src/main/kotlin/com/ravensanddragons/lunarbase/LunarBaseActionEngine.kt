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
import com.ravensanddragons.lunarbase.cards.LunarBaseViewHandAction
import com.ravensanddragons.platform.game.runtime.InvalidCommandException

internal data class LunarBaseMutableGame(
    var public: LunarBasePublicState,
    var private: LunarBasePrivateState
)

internal fun List<LunarBaseCardAction>.toActionNodes(): List<LunarBaseActionNode> =
    map { it.toActionNode() }

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
        sourceCardName: String
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val game = LunarBaseMutableGame(publicState, privateState)
        val stack = actions.toActionNodes().asReversed().map { LunarBaseActionFrame(actorIndex, it, sourceCardName = sourceCardName) }
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
                    sourceCardName = game.public.actionState.sourceCardName
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
                        game.public.actionState.sourceCardName
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
        val remaining = interaction.remaining - 1
        val repeatFrame = if (remaining > 0) {
            listOf(interaction.copy(remaining = remaining).toFrame(remaining, game.public.actionState.sourceCardName))
        } else {
            emptyList()
        }
        val stack = game.public.actionState.stack +
            repeatFrame +
            interrupt.asReversed().map { LunarBaseActionFrame(actor, it, sourceCardName = card.name) }
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
        val supply = game.public.supply.toMutableList()
        supply[slotIndex] = null
        game.public = game.public.copy(supply = supply, message = "Drafted a card.")
        game.private = game.private.copy(hands = game.private.hands.replaceAt(actor, game.private.hands[actor] + card))
        return repeatOrContinue(game, interaction) { canDraft(game) }
    }

    fun resellSupply(game: LunarBaseMutableGame, slotIndex: Int): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val interaction = game.public.actionState.interaction ?: return game.public to game.private
        if (interaction.kind != "resell") return game.public to game.private
        val actor = interaction.actorIndex
        val card = game.public.supply.getOrNull(slotIndex) ?: return game.public to game.private
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
        if (interaction.kind != "discard") return game.public to game.private
        val actor = interaction.actorIndex
        val hand = game.private.hands[actor]
        val card = hand.firstOrNull { it.id == cardId } ?: return game.public to game.private
        game.private = game.private.copy(
            hands = game.private.hands.replaceAt(actor, hand.filterNot { it.id == cardId }),
            discard = listOf(card) + game.private.discard
        )
        game.public = game.public.copy(message = "Discarded a card.")
        return repeatOrContinue(game, interaction) { game.private.hands[actor].isNotEmpty() }
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
            text = interaction.textForRemaining(remaining),
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
            "build", "flipStation", "flipStationTo", "stealModule", "viewHand" -> resolve(game, game.public.actionState.copy(interaction = null))
            else -> game.public to game.private
        }
    }

    private fun executeFrame(
        game: LunarBaseMutableGame,
        actionState: LunarBaseActionState,
        frame: LunarBaseActionFrame
    ): LunarBaseActionState {
        val action = frame.action
        val actor = frame.actorIndex
        return when (action.kind) {
            "doAll" -> actionState.copy(
                stack = actionState.stack + action.actions.asReversed().map {
                    LunarBaseActionFrame(actor, it, sourceCardName = frame.sourceCardName)
                }
            )
            "chooseOne" -> if (action.actions.isEmpty()) {
                actionState
            } else {
                actionState.copy(interaction = actionInteraction(game.public, actor, action, "chooseOne"))
            }
            "scoped" -> startScoped(game.public, actionState, actor, action)
            "chooseOpponent" -> actionState.copy(interaction = actionInteraction(game.public, actor, action, "chooseOpponent"))
            "draw" -> {
                val amount = resolveAmount(game, actor, action)
                if (amount <= 0 || !canDraw(game)) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "draw", remaining = amount)
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
                    interaction = actionInteraction(game.public, actor, action, "build", remaining = amount)
                )
            }
            "draft" -> {
                val amount = minOf(frame.remaining ?: resolveAmount(game, actor, action), game.public.supply.count { it != null })
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "draft", remaining = amount)
                )
            }
            "resell" -> {
                val amount = minOf(frame.remaining ?: resolveAmount(game, actor, action), game.public.supply.count { it != null })
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "resell", remaining = amount)
                )
            }
            "discard" -> {
                val amount = frame.remaining ?: resolveAmount(game, actor, action)
                if (amount <= 0 || game.private.hands[actor].isEmpty()) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "discard", remaining = amount)
                )
            }
            "flipStation" -> startFlipStation(game, actionState, actor, action)
            "flipStationTo" -> startFlipStationTo(game, actionState, actor, action)
            "stealCredits" -> {
                val amount = resolveAmount(game, actor, action)
                if (amount <= 0) actionState else actionState.copy(
                    interaction = actionInteraction(game.public, actor, action, "stealCredits", remaining = amount)
                )
            }
            "stealModule" -> startStealModule(game, actionState, actor, action)
            "viewHand" -> startViewHand(actionState, actor, action)
            else -> actionState
        }
    }

    private fun startStealModule(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        actor: Int,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val kind = if (stealableModules(game.public, actor, action.moduleName).isEmpty()) "stealModuleEmpty" else "stealModule"
        return state.copy(interaction = actionInteraction(game.public, actor, action, kind))
    }

    private fun startScoped(
        public: LunarBasePublicState,
        state: LunarBaseActionState,
        actor: Int,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val players = when (action.scope) {
            LunarBaseActionScope.CHOSEN_PLAYER.name -> listOf(
                checkNotNull(state.chosenPlayerIndex) { "chosenPlayer scope requires a chosen player." }
            )
            LunarBaseActionScope.EACH_OPPONENT.name -> turnOrder(public, nextPlayerIndex(actor, public.config.playerCount)).filterNot { it == actor }
            LunarBaseActionScope.EACH_PLAYER.name -> turnOrder(public, actor)
            LunarBaseActionScope.NEIGHBORS_OF_TARGET.name,
            LunarBaseActionScope.OPPONENT.name,
            LunarBaseActionScope.TARGET.name -> return state.copy(interaction = actionInteraction(public, actor, action, "chooseScopeTarget"))
            else -> emptyList()
        }
        return state.copy(stack = state.stack + scopedFrames(players, action.actions, state.sourceCardName))
    }

    private fun scopedFrames(
        players: List<Int>,
        actions: List<LunarBaseActionNode>,
        sourceCardName: String?
    ): List<LunarBaseActionFrame> =
        players.asReversed().flatMap { player ->
            actions.asReversed().map { LunarBaseActionFrame(player, it, sourceCardName = sourceCardName) }
        }

    private fun startViewHand(
        state: LunarBaseActionState,
        actor: Int,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val target = when (action.playerRef) {
            LunarBasePlayerReference.CHOSEN_PLAYER.name -> state.chosenPlayerIndex
            else -> null
        } ?: error("viewHand requires a target player.")
        return state.copy(interaction = LunarBaseActionInteraction(
            kind = "viewHand",
            actorIndex = actor,
            text = action.toFullActionText(),
            buttons = listOf(LunarBaseActionButton("Done viewing", "done")),
            action = action,
            targetPlayerIndex = target
        ))
    }

    private fun startFlipStation(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        actor: Int,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val amountKind = action.flipAmountKind
        if (amountKind == "self") {
            return if (game.public.players[actor].board.any { it.card.type == stationType }) {
                state.copy(interaction = actionInteraction(game.public, actor, action, "flipStation", remaining = 1))
            } else {
                state
            }
        }
        val max = allStationIds(game).size
        val amount = if (amountKind == "anyNumber") max else minOf(action.flipAmount ?: 0, max)
        if (amount <= 0) return state
        return state.copy(interaction = actionInteraction(game.public, actor, action, "flipStation", remaining = amount))
    }

    private fun startFlipStationTo(
        game: LunarBaseMutableGame,
        state: LunarBaseActionState,
        actor: Int,
        action: LunarBaseActionNode
    ): LunarBaseActionState {
        val station = game.public.players[actor].board.firstOrNull { it.card.type == stationType } ?: return state
        val target = action.side?.let { LunarBaseStationSide.valueOf(it) } ?: return state
        val desiredFlipped = target == LunarBaseStationSide.AGENDA_SIDE
        return if (station.card.flipped == desiredFlipped) {
            state.copy(interaction = actionInteraction(game.public, actor, action, "flipStationToAlready"))
        } else {
            state.copy(interaction = actionInteraction(game.public, actor, action, "flipStationTo"))
        }
    }

    private fun repeatOrContinue(
        game: LunarBaseMutableGame,
        interaction: LunarBaseActionInteraction,
        canContinue: () -> Boolean
    ): Pair<LunarBasePublicState, LunarBasePrivateState> {
        val remaining = interaction.remaining - 1
        if (finishIfWon(game)) return game.public to game.private
        if (remaining > 0 && canContinue()) {
            game.public = game.public.copy(
                actionState = game.public.actionState.copy(
                    interaction = interaction.copy(
                        remaining = remaining,
                        text = interaction.textForRemaining(remaining)
                    )
                )
            )
            return game.public.withPrivateCounts(game.private).withBoardSummaries() to game.private
        }
        return resolve(game, game.public.actionState.copy(interaction = null))
    }

    private fun actionInteraction(
        public: LunarBasePublicState,
        actor: Int,
        action: LunarBaseActionNode,
        kind: String,
        remaining: Int = 0
    ): LunarBaseActionInteraction {
        val text = action.toFullActionText(remaining.takeIf { action.isRepeatingAction() })
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
                else -> kind
            },
            actorIndex = actor,
            text = if (kind == "stealModuleEmpty") "No module to steal" else text,
            buttons = buttons,
            remaining = remaining,
            action = action
        )
    }

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
        game.public.supply.any { it != null }

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
        game.public = game.public.copy(
            supply = keptInfluences,
            players = game.public.players.map { player ->
                player.copy(credits = player.credits + player.orbs.yellow + player.orbs.gray)
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

    private fun LunarBaseActionInteraction.toFrame(
        remainingOverride: Int? = null,
        sourceCardName: String? = null
    ): LunarBaseActionFrame =
        LunarBaseActionFrame(
            actorIndex,
            action ?: LunarBaseActionNode(kind),
            remaining = remainingOverride,
            sourceCardName = sourceCardName
        )

    private fun LunarBaseActionInteraction.textForRemaining(remaining: Int): String =
        action?.toFullActionText(remaining.takeIf { action.isRepeatingAction() }) ?: text

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
