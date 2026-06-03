package com.ravensanddragons.lunarbase.cards

import kotlin.experimental.ExperimentalTypeInference
import kotlin.jvm.JvmName
import kotlin.OverloadResolutionByLambdaReturnType

/** Keeps nested Lunar Base card DSL receivers from leaking into each other. */
@DslMarker
annotation class LunarBaseCardDsl

/** Blue card/resource color. */
val blue: LunarBaseCardColor = LunarBaseCardColor.BLUE

/** Red card/resource color. */
val red: LunarBaseCardColor = LunarBaseCardColor.RED

/** Yellow card/resource color. */
val yellow: LunarBaseCardColor = LunarBaseCardColor.YELLOW

/** Gray wildcard/resource color. */
val gray: LunarBaseCardColor = LunarBaseCardColor.GRAY

/** Space dome. */
val dome: LunarBaseAchievement = LunarBaseAchievement.DOME

/** Space rover. */
val rover: LunarBaseAchievement = LunarBaseAchievement.ROVER

/** Laika in space. */
val laika: LunarBaseAchievement = LunarBaseAchievement.LAIKA

/** Space elevator. */
val elevator: LunarBaseAchievement = LunarBaseAchievement.ELEVATOR

/** Fusion power. */
val fusion: LunarBaseAchievement = LunarBaseAchievement.FUSION

/** Bacon printer. */
val printer: LunarBaseAchievement = LunarBaseAchievement.PRINTER

/** Space telescope. */
val telescope: LunarBaseAchievement = LunarBaseAchievement.TELESCOPE

/** AI. */
val ai: LunarBaseAchievement = LunarBaseAchievement.AI

/** Satellite. */
val satellite: LunarBaseAchievement = LunarBaseAchievement.SATELLITE

/** Borg. */
val borg: LunarBaseAchievement = LunarBaseAchievement.BORG

/** Moonwalk. */
val moonwalk: LunarBaseAchievement = LunarBaseAchievement.MOONWALK

/** Botany. */
val botany: LunarBaseAchievement = LunarBaseAchievement.BOTANY

/** Chemistry. */
val chemistry: LunarBaseAchievement = LunarBaseAchievement.CHEMISTRY

/** DNA. */
val dna: LunarBaseAchievement = LunarBaseAchievement.DNA

/**
 * Defines a Lunar Base deck.
 *
 * Deck scripts should use this as their final expression so script evaluation
 * returns a [LunarBaseDeckDefinition].
 */
fun deck(block: LunarBaseDeckBuilder.() -> Unit): LunarBaseDeckDefinition =
    LunarBaseDeckBuilder().apply(block).build()

/** Builds a complete Lunar Base deck definition. */
@LunarBaseCardDsl
class LunarBaseDeckBuilder {
    private val stations = mutableListOf<LunarBaseStationCardDefinition>()
    private val modules = mutableListOf<LunarBaseModuleCardDefinition>()
    private val agents = mutableListOf<LunarBaseAgentCardDefinition>()
    private val influences = mutableListOf<LunarBaseInfluenceCardDefinition>()
    private val stationFronts = mutableListOf<LunarBaseStationFrontCardDefinition>()

    /** Adds agent cards to the deck definition. */
    fun agent(block: LunarBaseAgentCardBuilder.() -> Unit) {
        agents += LunarBaseAgentCardBuilder().apply(block).build()
    }

    /** Adds influence cards to the deck definition. */
    fun influence(block: LunarBaseInfluenceCardBuilder.() -> Unit) {
        influences += LunarBaseInfluenceCardBuilder().apply(block).build()
    }

    /** Adds module cards to the deck definition. */
    fun module(block: LunarBaseModuleCardBuilder.() -> Unit) {
        modules += LunarBaseModuleCardBuilder().apply(block).build()
    }

    /** Adds a station back card to the deck definition. */
    fun station(block: LunarBaseStationCardBuilder.() -> Unit) {
        stations += LunarBaseStationCardBuilder().apply(block).build()
    }

    /** Adds the shared station front card definition. Exactly one is required. */
    fun stationFront(block: LunarBaseStationFrontCardBuilder.() -> Unit) {
        stationFronts += LunarBaseStationFrontCardBuilder().apply(block).build()
    }

    fun build(): LunarBaseDeckDefinition {
        require(stationFronts.size == 1) { "Exactly one station front is required." }
        require(stations.sumOf { it.count } >= 6) { "At least six station cards are required." }
        require((modules + agents + influences).sumOf { it.count } >= 30) {
            "At least 30 non-station cards are required."
        }
        return LunarBaseDeckDefinition(
            stationFront = stationFronts.single(),
            stations = stations.toList(),
            modules = modules.toList(),
            agents = agents.toList(),
            influences = influences.toList()
        )
    }
}

/** Shared validation for typed card builders. */
@LunarBaseCardDsl
abstract class LunarBaseNamedCardBuilder internal constructor(
    private val cardLabel: String
) {
    private var countWasSet = false
    private var nameWasSet = false
    private var storedCount: Int = 0
    private var storedName: String = ""

    /** Number of physical copies represented by this definition. Required and must be positive. */
    var count: Int
        get() = storedCount
        set(value) {
            countWasSet = true
            storedCount = value
        }

    /** Player-facing card name. Required and must be non-empty. */
    var name: String
        get() = storedName
        set(value) {
            nameWasSet = true
            storedName = value
        }

    protected fun requireCount(): Int {
        require(countWasSet) { "$cardLabel count is required." }
        require(storedCount > 0) { "$cardLabel count must be positive." }
        return storedCount
    }

    protected fun requireName(): String {
        require(nameWasSet) { "$cardLabel name is required." }
        require(storedName.isNotBlank()) { "$cardLabel name must be non-empty." }
        return storedName
    }
}

/** Builds an agent card definition. */
@LunarBaseCardDsl
class LunarBaseAgentCardBuilder : LunarBaseNamedCardBuilder("Agent") {
    /** Player-facing flavor text. */
    var flavorText: String? = null

    private var onPlaying: List<LunarBaseCardAction>? = null
    private var storedCardCost: List<LunarBaseCardColor>? = null

    /** Defines required actions performed when this agent is played. */
    fun onPlaying(block: LunarBaseActionBuilder.() -> Unit) {
        onPlaying = LunarBaseActionBuilder().apply(block).build()
    }

    /** Resource/color cost required to play this agent. Must be specified, but may be empty. */
    var cardCost: List<LunarBaseCardColor>
        get() = storedCardCost ?: emptyList()
        set(value) {
            storedCardCost = value
        }

    fun build(): LunarBaseAgentCardDefinition =
        LunarBaseAgentCardDefinition(
            count = requireCount(),
            name = requireName(),
            flavorText = flavorText,
            onPlaying = requireNotNull(onPlaying) { "Agent onPlaying is required." },
            cardCost = requireNotNull(storedCardCost) { "Agent cardCost is required." }
        )
}

/** Builds an influence card definition. */
@LunarBaseCardDsl
class LunarBaseInfluenceCardBuilder : LunarBaseNamedCardBuilder("Influence") {
    /** Required static or triggered influence effect. */
    var effect: LunarBaseCardEffect? = null

    fun build(): LunarBaseInfluenceCardDefinition =
        LunarBaseInfluenceCardDefinition(
            count = requireCount(),
            name = requireName(),
            effect = requireNotNull(effect) { "Influence effect is required." }
        )
}

/** Builds a module card definition. */
@LunarBaseCardDsl
class LunarBaseModuleCardBuilder : LunarBaseNamedCardBuilder("Module") {
    /** Player-facing flavor text. */
    var flavorText: String? = null

    /** Main card color for this module. Defaults to gray. */
    var cardColor: LunarBaseCardColor = gray

    /** Explicit whole-orb colors supplied by this module. */
    var orbs: List<LunarBaseCardColor> = emptyList()

    /** Optional static or triggered module effect. */
    var effect: LunarBaseCardEffect? = null

    /** Achievement icons printed on this module. */
    var achievements: List<LunarBaseAchievement> = emptyList()

    /** Colonist count printed on this module. */
    var colonists: Int = 0

    private var storedCardCost: List<LunarBaseCardColor>? = null
    private var orbHalves: LunarBaseOrbHalves? = null
    private var onPlaying: List<LunarBaseCardAction> = emptyList()
    private var mainAction: List<LunarBaseCardAction> = emptyList()

    /** Resource/color cost required to play this module. Must be specified, but may be empty. */
    var cardCost: List<LunarBaseCardColor>
        get() = storedCardCost ?: emptyList()
        set(value) {
            storedCardCost = value
        }

    /** Defines half-orb positions printed on this module. At least one position is required. */
    fun orbHalves(block: LunarBaseOrbHalvesBuilder.() -> Unit) {
        orbHalves = LunarBaseOrbHalvesBuilder().apply(block).build()
    }

    /** Defines optional actions performed when this module is played. */
    fun onPlaying(block: LunarBaseActionBuilder.() -> Unit) {
        onPlaying = LunarBaseActionBuilder().apply(block).build()
    }

    /** Defines the module's optional main action. */
    fun mainAction(block: LunarBaseActionBuilder.() -> Unit) {
        mainAction = LunarBaseActionBuilder().apply(block).build()
    }

    fun build(): LunarBaseModuleCardDefinition {
        val resolvedOrbHalves = requireNotNull(orbHalves) { "Module orbHalves is required." }
        require(resolvedOrbHalves.hasAnySpecified()) { "Module orbHalves must specify at least one position." }
        return LunarBaseModuleCardDefinition(
            count = requireCount(),
            name = requireName(),
            cardCost = requireNotNull(storedCardCost) { "Module cardCost is required." },
            flavorText = flavorText,
            cardColor = cardColor,
            orbHalves = resolvedOrbHalves,
            orbs = orbs,
            effect = effect,
            onPlaying = onPlaying,
            mainAction = mainAction,
            achievements = achievements,
            colonists = colonists
        )
    }
}

/** Builds a station back card definition. */
@LunarBaseCardDsl
class LunarBaseStationCardBuilder : LunarBaseNamedCardBuilder("Station") {
    /** Explicit whole-orb colors supplied by this station. */
    var orbs: List<LunarBaseCardColor> = emptyList()

    /** Achievement icons printed on this station. */
    var achievements: List<LunarBaseAchievement> = emptyList()

    /** Colonist count printed on this station. */
    var colonists: Int = 0

    private var mainAction: List<LunarBaseCardAction>? = null

    /** Defines the station's required main action. */
    fun mainAction(block: LunarBaseActionBuilder.() -> Unit) {
        mainAction = LunarBaseActionBuilder().apply(block).build()
    }

    fun build(): LunarBaseStationCardDefinition =
        LunarBaseStationCardDefinition(
            count = requireCount(),
            name = requireName(),
            orbs = orbs,
            mainAction = requireNotNull(mainAction) { "Station mainAction is required." },
            achievements = achievements,
            colonists = colonists
        )
}

/** Builds the single station front card definition. */
@LunarBaseCardDsl
class LunarBaseStationFrontCardBuilder {
    private var nameWasSet = false
    private var storedName: String = ""

    /** Player-facing card name. Required and must be non-empty. */
    var name: String
        get() = storedName
        set(value) {
            nameWasSet = true
            storedName = value
        }

    /** Achievement icons printed on this station front. */
    var achievements: List<LunarBaseAchievement> = emptyList()

    /** Colonist count printed on this station front. */
    var colonists: Int = 0

    private var orbHalves: LunarBaseOrbHalves? = null
    private var mainAction: List<LunarBaseCardAction>? = null

    /** Defines half-orb positions printed on this station front. At least one position is required. */
    fun orbHalves(block: LunarBaseOrbHalvesBuilder.() -> Unit) {
        orbHalves = LunarBaseOrbHalvesBuilder().apply(block).build()
    }

    /** Defines the station front's required main action. */
    fun mainAction(block: LunarBaseActionBuilder.() -> Unit) {
        mainAction = LunarBaseActionBuilder().apply(block).build()
    }

    fun build(): LunarBaseStationFrontCardDefinition {
        val resolvedOrbHalves = requireNotNull(orbHalves) { "Station front orbHalves is required." }
        require(resolvedOrbHalves.hasAnySpecified()) { "Station front orbHalves must specify at least one position." }
        require(nameWasSet) { "Station front name is required." }
        require(storedName.isNotBlank()) { "Station front name must be non-empty." }
        return LunarBaseStationFrontCardDefinition(
            name = storedName,
            orbHalves = resolvedOrbHalves,
            mainAction = requireNotNull(mainAction) { "Station front mainAction is required." },
            achievements = achievements,
            colonists = colonists
        )
    }
}

/** Builds half-orb positions for a module or station-front card definition. */
@LunarBaseCardDsl
class LunarBaseOrbHalvesBuilder {
    /** Top half-orb color. */
    var top: LunarBaseCardColor? = null

    /** Top-left half-orb color. */
    var topLeft: LunarBaseCardColor? = null

    /** Top-right half-orb color. */
    var topRight: LunarBaseCardColor? = null

    /** Bottom-left half-orb color. */
    var bottomLeft: LunarBaseCardColor? = null

    /** Bottom-right half-orb color. */
    var bottomRight: LunarBaseCardColor? = null

    /** Bottom half-orb color. */
    var bottom: LunarBaseCardColor? = null

    fun build(): LunarBaseOrbHalves =
        LunarBaseOrbHalves(
            top = top,
            topLeft = topLeft,
            topRight = topRight,
            bottomLeft = bottomLeft,
            bottomRight = bottomRight,
            bottom = bottom
        )
}

/** Builds a list of declarative Lunar Base action nodes. */
@LunarBaseCardDsl
class LunarBaseActionBuilder : LunarBaseActionListBuilder()

/** Builds the flat list of choices inside a choose-one action. */
@LunarBaseCardDsl
class LunarBaseChoiceBuilder : LunarBaseActionListBuilder()

/** Shared action-building operations. */
@LunarBaseCardDsl
abstract class LunarBaseActionListBuilder {
    private val actions = mutableListOf<LunarBaseCardAction>()

    /** Lets a player choose one of the nested action choices. */
    fun chooseOne(block: LunarBaseChoiceBuilder.() -> Unit) {
        actions += LunarBaseChooseOneAction(LunarBaseChoiceBuilder().apply(block).build())
    }

    /** Groups nested actions into one action. */
    fun doAll(block: LunarBaseActionBuilder.() -> Unit) {
        actions += LunarBaseDoAllAction(LunarBaseActionBuilder().apply(block).build())
    }

    /** Has the previously chosen player chosen do the nested actions. */
    fun chosenPlayer(block: LunarBaseActionBuilder.() -> Unit) {
        scoped(LunarBaseActionScope.CHOSEN_PLAYER, block)
    }

    /** Has each opponent do the nested actions. */
    fun eachOpponent(block: LunarBaseActionBuilder.() -> Unit) {
        scoped(LunarBaseActionScope.EACH_OPPONENT, block)
    }

    /** Has each player do the nested actions. */
    fun eachPlayer(block: LunarBaseActionBuilder.() -> Unit) {
        scoped(LunarBaseActionScope.EACH_PLAYER, block)
    }

    /** Has the neighbors of a chosen target do the nested actions. */
    fun neighborsOfTarget(block: LunarBaseActionBuilder.() -> Unit) {
        scoped(LunarBaseActionScope.NEIGHBORS_OF_TARGET, block)
    }

    /** Has a chosen opponent do the nested actions. */
    fun opponent(block: LunarBaseActionBuilder.() -> Unit) {
        scoped(LunarBaseActionScope.OPPONENT, block)
    }

    /** Has the selected target do the nested actions. */
    fun target(block: LunarBaseActionBuilder.() -> Unit) {
        scoped(LunarBaseActionScope.TARGET, block)
    }

    /** Chooses an opponent for later `chosenPlayer` references. */
    fun chooseOpponent() {
        actions += LunarBaseChooseOpponentAction
    }

    /** Build some number of modules. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("buildLiteral")
    fun build(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseBuildAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Build some number of modules. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("buildAugmented")
    fun build(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseBuildAction(LunarBaseAmountBuilder().amount())
    }

    /** Discard some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("discardLiteral")
    fun discard(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseDiscardAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Discard some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("discardAugmented")
    fun discard(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseDiscardAction(LunarBaseAmountBuilder().amount())
    }

    /** Draft some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("draftLiteral")
    fun draft(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseDraftAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Draft some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("draftAugmented")
    fun draft(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseDraftAction(LunarBaseAmountBuilder().amount())
    }

    /** Draw some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("drawLiteral")
    fun draw(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseDrawAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Draw some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("drawAugmented")
    fun draw(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseDrawAction(LunarBaseAmountBuilder().amount())
    }

    /** Flip some number of stations. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("flipStationLiteral")
    fun flipStation(amount: LunarBaseFlipStationAmountBuilder.() -> Int) {
        actions += LunarBaseFlipStationAction(LunarBaseLiteralFlipStationAmount(LunarBaseFlipStationAmountBuilder().amount()))
    }

    /** Flip some number of stations. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("flipStationAugmented")
    fun flipStation(amount: LunarBaseFlipStationAmountBuilder.() -> LunarBaseFlipStationAmount) {
        actions += LunarBaseFlipStationAction(LunarBaseFlipStationAmountBuilder().amount())
    }

    /** Flip your station to a named side. */
    fun flipStationTo(side: LunarBaseStationSideBuilder.() -> LunarBaseStationSide) {
        actions += LunarBaseFlipStationToAction(LunarBaseStationSideBuilder().side())
    }

    /** Gain some number of credits. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("gainCreditsLiteral")
    fun gainCredits(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseGainCreditsAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Gain some number of credits. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("gainCreditsAugmented")
    fun gainCredits(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseGainCreditsAction(LunarBaseAmountBuilder().amount())
    }

    /** Lose some number of credits. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("loseCreditsLiteral")
    fun loseCredits(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseLoseCreditsAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Lose some number of credits. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("loseCreditsAugmented")
    fun loseCredits(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseLoseCreditsAction(LunarBaseAmountBuilder().amount())
    }

    /** Resell some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("resellLiteral")
    fun resell(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseResellAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Resell some number of cards. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("resellAugmented")
    fun resell(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseResellAction(LunarBaseAmountBuilder().amount())
    }

    /** Steal some number of credits. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("stealCreditsLiteral")
    fun stealCredits(amount: LunarBaseAmountBuilder.() -> Int) {
        actions += LunarBaseStealCreditsAction(LunarBaseLiteralAmount(LunarBaseAmountBuilder().amount()))
    }

    /** Steal some number of credits. */
    @OptIn(ExperimentalTypeInference::class)
    @OverloadResolutionByLambdaReturnType
    @JvmName("stealCreditsAugmented")
    fun stealCredits(amount: LunarBaseAmountBuilder.() -> LunarBaseAmount) {
        actions += LunarBaseStealCreditsAction(LunarBaseAmountBuilder().amount())
    }

    /** Steal the named module. */
    fun stealModule(moduleName: () -> String) {
        actions += LunarBaseStealModuleAction(moduleName())
    }

    /** View the referenced player's hand. */
    fun viewHand(player: LunarBasePlayerReferenceBuilder.() -> LunarBasePlayerReference) {
        actions += LunarBaseViewHandAction(LunarBasePlayerReferenceBuilder().player())
    }

    fun build(): List<LunarBaseCardAction> = actions.toList()

    private fun scoped(scope: LunarBaseActionScope, block: LunarBaseActionBuilder.() -> Unit) {
        actions += LunarBaseScopedAction(scope, LunarBaseActionBuilder().apply(block).build())
    }
}

/** Resolves number-based augmented amount DSL values. */
@LunarBaseCardDsl
class LunarBaseAmountBuilder {
    /** The acting player's current hand size. */
    val handSize: LunarBaseAmount = LunarBaseHandSizeAmount

    /** The acting player's current influence count. */
    val influenceCount: LunarBaseAmount = LunarBaseInfluenceCountAmount
}

/** Resolves flip-station-only amount DSL values. */
@LunarBaseCardDsl
class LunarBaseFlipStationAmountBuilder {
    /** Any number chosen by future runtime flip-station execution. */
    val anyNumber: LunarBaseFlipStationAmount = LunarBaseAnyNumberFlipStationAmount

    /** The source card or station. */
    val self: LunarBaseFlipStationAmount = LunarBaseSelfFlipStationAmount
}

/** Resolves station-side DSL values. */
@LunarBaseCardDsl
class LunarBaseStationSideBuilder {
    /** Terran Outpost side of station. */
    val terranOutpost: LunarBaseStationSide = LunarBaseStationSide.TERRAN_OUTPOST

    /** Agenda side of station. */
    val agendaSide: LunarBaseStationSide = LunarBaseStationSide.AGENDA_SIDE
}

/** Resolves player-reference DSL values. */
@LunarBaseCardDsl
class LunarBasePlayerReferenceBuilder {
    /** The player chosen by a previous chooseOpponent action. */
    val chosenPlayer: LunarBasePlayerReference = LunarBasePlayerReference.CHOSEN_PLAYER
}

/** Creates a static effect from a named static-effect symbol. */
fun staticEffect(block: LunarBaseStaticEffectBuilder.() -> LunarBaseStaticEffect): LunarBaseCardEffect =
    LunarBaseStaticCardEffect(LunarBaseStaticEffectBuilder().block())

/** Starts a triggered effect declaration. Chain with `takeAction { ... }`. */
fun whenOccurs(block: LunarBaseTriggerBuilder.() -> LunarBaseTrigger): LunarBaseTriggeredEffectBuilder =
    LunarBaseTriggeredEffectBuilder(LunarBaseTriggerBuilder().block())

/** Builds the action side of a triggered effect. */
class LunarBaseTriggeredEffectBuilder internal constructor(
    private val trigger: LunarBaseTrigger
) {
    /** Defines the actions taken when the trigger occurs. */
    infix fun takeAction(block: LunarBaseActionBuilder.() -> Unit): LunarBaseCardEffect =
        LunarBaseTriggeredCardEffect(trigger, LunarBaseActionBuilder().apply(block).build())
}

/** Resolves static-effect DSL values. */
@LunarBaseCardDsl
class LunarBaseStaticEffectBuilder {
    /** Forbids drafting an influence other than this one. */
    val forbidDraftOtherInfluence: LunarBaseStaticEffect = LunarBaseStaticEffect.FORBID_DRAFT_OTHER_INFLUENCE

    /** Forbids stealing of credits. */
    val forbidStealingCredits: LunarBaseStaticEffect = LunarBaseStaticEffect.FORBID_STEALING_CREDITS

    /** Disables gaining credits when the shuttles arrive. */
    val noShuttleCredits: LunarBaseStaticEffect = LunarBaseStaticEffect.NO_SHUTTLE_CREDITS

    /** Causes red orbs to gain credits as well as yellow. */
    val redOrbsGainCredits: LunarBaseStaticEffect = LunarBaseStaticEffect.RED_ORBS_GAIN_CREDITS
}

/** Resolves trigger DSL values. */
@LunarBaseCardDsl
class LunarBaseTriggerBuilder {
    /** Triggers when a dome or Laika Memorial is built. */
    val buildDomeOrLaikaMemorial: LunarBaseTrigger = LunarBaseTrigger.BUILD_DOME_OR_LAIKA_MEMORIAL

    /** Triggers when this influence is discarded. */
    val discardThisInfluence: LunarBaseTrigger = LunarBaseTrigger.DISCARD_THIS_INFLUENCE

    /** Triggers when any influence is drafted. */
    val draftAnyInfluence: LunarBaseTrigger = LunarBaseTrigger.DRAFT_ANY_INFLUENCE
}
