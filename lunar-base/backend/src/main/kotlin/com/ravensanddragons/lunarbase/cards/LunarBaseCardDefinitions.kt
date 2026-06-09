package com.ravensanddragons.lunarbase.cards

/**
 * A complete declarative Lunar Base card set loaded from a deck script.
 */
data class LunarBaseDeckDefinition(
    val stationFront: LunarBaseStationFrontCardDefinition,
    val stations: List<LunarBaseStationCardDefinition>,
    val modules: List<LunarBaseModuleCardDefinition>,
    val agents: List<LunarBaseAgentCardDefinition>,
    val influences: List<LunarBaseInfluenceCardDefinition>
) {
    init {
        require(stations.sumOf { it.count } >= 6) { "At least six station cards are required." }
        require((modules + agents + influences).sumOf { it.count } >= 30) {
            "At least 30 non-station cards are required."
        }
        val duplicateNames = (listOf(stationFront) + stations + modules + agents + influences)
            .groupBy { it.name }
            .filterValues { it.size > 1 }
            .keys
            .sorted()
        require(duplicateNames.isEmpty()) {
            "Card names must be unique. Duplicate names: ${duplicateNames.joinToString(", ")}."
        }
    }
}

/** A reusable card definition from a Lunar Base card set. */
sealed interface LunarBaseCardDefinition {
    /** Number of physical cards represented by this definition. */
    val count: Int

    /** Player-facing card name. */
    val name: String
}

/** Agent cards can be played for their on-playing action and have a card cost. */
data class LunarBaseAgentCardDefinition(
    override val count: Int,
    override val name: String,
    val flavorText: String? = null,
    val onPlaying: List<LunarBaseCardAction>,
    val cardCost: List<LunarBaseCardColor>
) : LunarBaseCardDefinition {
    init {
        requirePositiveCount(count, "Agent")
        requireNonBlankName(name, "Agent")
        require(onPlaying.isNotEmpty()) { "Agent onPlaying is required." }
    }
}

/** Influence cards are effect cards. */
data class LunarBaseInfluenceCardDefinition(
    override val count: Int,
    override val name: String,
    val effect: LunarBaseCardEffect
) : LunarBaseCardDefinition {
    init {
        requirePositiveCount(count, "Influence")
        requireNonBlankName(name, "Influence")
    }
}

/** Module cards are board cards with cost, color, orbs, and optional behavior. */
data class LunarBaseModuleCardDefinition(
    override val count: Int,
    override val name: String,
    val cardCost: List<LunarBaseCardColor>,
    val flavorText: String? = null,
    val cardColor: LunarBaseCardColor = LunarBaseCardColor.GRAY,
    val connectors: LunarBaseConnectors,
    val orbs: List<LunarBaseCardColor> = emptyList(),
    val effect: LunarBaseCardEffect? = null,
    val onPlaying: List<LunarBaseCardAction> = emptyList(),
    val mainAction: List<LunarBaseCardAction> = emptyList(),
    val achievements: List<LunarBaseAchievement> = emptyList(),
    val colonists: Int = 0
) : LunarBaseCardDefinition {
    init {
        requirePositiveCount(count, "Module")
        requireNonBlankName(name, "Module")
        require(connectors.hasAnySpecified()) { "Module connectors must specify at least one position." }
    }
}

/** Station backs are dealt to player boards and must define a main action. */
data class LunarBaseStationCardDefinition(
    override val count: Int,
    override val name: String,
    val orbs: List<LunarBaseCardColor> = emptyList(),
    val mainAction: List<LunarBaseCardAction>,
    val achievements: List<LunarBaseAchievement> = emptyList(),
    val colonists: Int = 0
) : LunarBaseCardDefinition {
    init {
        requirePositiveCount(count, "Station")
        requireNonBlankName(name, "Station")
        require(mainAction.isNotEmpty()) { "Station mainAction is required." }
    }
}

/** The single shared station front must define connectors and a main action. */
data class LunarBaseStationFrontCardDefinition(
    override val name: String,
    val connectors: LunarBaseConnectors,
    val orbs: List<LunarBaseCardColor> = emptyList(),
    val mainAction: List<LunarBaseCardAction>,
    val achievements: List<LunarBaseAchievement> = emptyList(),
    val colonists: Int = 0
) : LunarBaseCardDefinition {
    override val count: Int = 1

    init {
        requireNonBlankName(name, "Station front")
        require(connectors.hasAnySpecified()) { "Station front connectors must specify at least one position." }
        require(mainAction.isNotEmpty()) { "Station front mainAction is required." }
    }
}

private fun requirePositiveCount(count: Int, cardLabel: String) {
    require(count > 0) { "$cardLabel count must be positive." }
}

private fun requireNonBlankName(name: String, cardLabel: String) {
    require(name.isNotBlank()) { "$cardLabel name must be non-empty." }
}

/** A resource/card color named by the Lunar Base card DSL. */
enum class LunarBaseCardColor {
    BLUE,
    RED,
    YELLOW,
    GRAY
}

/** Connector positions available on module and station-front cards. */
data class LunarBaseConnectors(
    val top: LunarBaseCardColor? = null,
    val topLeft: LunarBaseCardColor? = null,
    val topRight: LunarBaseCardColor? = null,
    val bottomLeft: LunarBaseCardColor? = null,
    val bottomRight: LunarBaseCardColor? = null,
    val bottom: LunarBaseCardColor? = null
) {
    /** True when at least one connector position was set. */
    fun hasAnySpecified(): Boolean =
        listOf(top, topLeft, topRight, bottomLeft, bottomRight, bottom).any { it != null }
}

/** Achievement icons that may appear on Lunar Base stations, station fronts, and modules. */
enum class LunarBaseAchievement {
    DOME,
    ROVER,
    LAIKA,
    ELEVATOR,
    FUSION,
    PRINTER,
    TELESCOPE,
    AI,
    SATELLITE,
    BORG,
    MOONWALK,
    BOTANY,
    CHEMISTRY,
    DNA
}

/** A declarative card effect. Runtime execution is intentionally added later. */
sealed interface LunarBaseCardEffect

/** A continuous/static effect declared by an influence or module. */
data class LunarBaseStaticCardEffect(
    val effect: LunarBaseStaticEffect
) : LunarBaseCardEffect

/** An effect that runs an action sequence when its trigger occurs. */
data class LunarBaseTriggeredCardEffect(
    val trigger: LunarBaseTrigger,
    val actions: List<LunarBaseCardAction>
) : LunarBaseCardEffect

/** Static effects currently named by the Lunar Base card DSL. */
enum class LunarBaseStaticEffect {
    FORBID_DRAFT_OTHER_INFLUENCE,
    FORBID_STEALING_CREDITS,
    NO_SHUTTLE_CREDITS,
    RED_ORBS_GAIN_CREDITS
}

/** Trigger names currently used by Lunar Base card definitions. */
enum class LunarBaseTrigger {
    BUILD_DOME_OR_LAIKA_MEMORIAL,
    DISCARD_THIS_INFLUENCE,
    DRAFT_ANY_INFLUENCE
}

/** A declarative action node. Runtime execution is intentionally added later. */
sealed interface LunarBaseCardAction

/** Choose one of the listed action choices. */
data class LunarBaseChooseOneAction(val actions: List<LunarBaseCardAction>) : LunarBaseCardAction

/** Perform all nested actions as one choice or sequence. */
data class LunarBaseDoAllAction(val actions: List<LunarBaseCardAction>) : LunarBaseCardAction

/** Apply nested actions to a target scope. */
data class LunarBaseScopedAction(
    val scope: LunarBaseActionScope,
    val actions: List<LunarBaseCardAction>
) : LunarBaseCardAction

/** Choose an opponent for later chosen-player actions. */
data object LunarBaseChooseOpponentAction : LunarBaseCardAction

/** Discard cards from a hand or other rule-defined source. */
data class LunarBaseDiscardAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Draft cards from a rule-defined draft source. */
data class LunarBaseDraftAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Draw cards from the stock. */
data class LunarBaseDrawAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Build modules using the active card's rule-defined build permission. */
data class LunarBaseBuildAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Flip one or more stations according to the active card's targeting rule. */
data class LunarBaseFlipStationAction(val amount: LunarBaseFlipStationAmount) : LunarBaseCardAction

/** Flip one or more stations to a specific side. */
data class LunarBaseFlipStationToAction(val side: LunarBaseStationSide) : LunarBaseCardAction

/** Gain credits. */
data class LunarBaseGainCreditsAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Lose credits. */
data class LunarBaseLoseCreditsAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Resell modules or resources according to the active card's rule text. */
data class LunarBaseResellAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Steal credits. */
data class LunarBaseStealCreditsAction(val amount: LunarBaseAmount) : LunarBaseCardAction

/** Steal a named module. */
data class LunarBaseStealModuleAction(val moduleName: String) : LunarBaseCardAction

/** View a player's hand. */
data class LunarBaseViewHandAction(val player: LunarBasePlayerReference) : LunarBaseCardAction

/** Target scopes available to scoped action blocks. */
enum class LunarBaseActionScope {
    CHOSEN_PLAYER,
    EACH_OPPONENT,
    EACH_PLAYER,
    NEIGHBORS_OF_TARGET,
    OPPONENT,
    TARGET
}

/** Amounts accepted by number-based action nodes. */
sealed interface LunarBaseAmount

/** A literal numeric action amount. */
data class LunarBaseLiteralAmount(val value: Int) : LunarBaseAmount

/** The acting player's current hand size. */
data object LunarBaseHandSizeAmount : LunarBaseAmount

/** The acting player's current influence count. */
data object LunarBaseInfluenceCountAmount : LunarBaseAmount

/** Amounts accepted only by flip-station actions. */
sealed interface LunarBaseFlipStationAmount

/** A literal flip-station amount. */
data class LunarBaseLiteralFlipStationAmount(val value: Int) : LunarBaseFlipStationAmount

/** Any number chosen according to future flip-station execution rules. */
data object LunarBaseAnyNumberFlipStationAmount : LunarBaseFlipStationAmount

/** The card or station that owns the active flip-station action. */
data object LunarBaseSelfFlipStationAmount : LunarBaseFlipStationAmount

/** Station sides named by the DSL. */
enum class LunarBaseStationSide {
    TERRAN_OUTPOST,
    AGENDA_SIDE
}

/** Player references named by the DSL. */
enum class LunarBasePlayerReference {
    CHOSEN_PLAYER
}
