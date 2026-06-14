package com.ravensanddragons.lunarbase

import com.ravensanddragons.lunarbase.cards.LunarBaseActionScope
import com.ravensanddragons.lunarbase.cards.LunarBaseAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseAnyNumberFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseBuildAction
import com.ravensanddragons.lunarbase.cards.LunarBaseCardAction
import com.ravensanddragons.lunarbase.cards.LunarBaseCardEffect
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
import com.ravensanddragons.lunarbase.cards.LunarBasePlayerReference
import com.ravensanddragons.lunarbase.cards.LunarBaseResellAction
import com.ravensanddragons.lunarbase.cards.LunarBaseScopedAction
import com.ravensanddragons.lunarbase.cards.LunarBaseSelfFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseStationSide
import com.ravensanddragons.lunarbase.cards.LunarBaseStealCreditsAction
import com.ravensanddragons.lunarbase.cards.LunarBaseStealModuleAction
import com.ravensanddragons.lunarbase.cards.LunarBaseStaticCardEffect
import com.ravensanddragons.lunarbase.cards.LunarBaseStaticEffect
import com.ravensanddragons.lunarbase.cards.LunarBaseTrigger
import com.ravensanddragons.lunarbase.cards.LunarBaseTriggeredCardEffect
import com.ravensanddragons.lunarbase.cards.LunarBaseViewHandAction

internal fun List<LunarBaseCardAction>.toActionText(): String? =
    takeIf { it.isNotEmpty() }?.joinToString("\n") { it.toActionText(topLevel = true) }

private fun List<LunarBaseCardAction>.toInlineActionText(): String =
    joinToString("; ") { it.toActionText() }

internal fun LunarBaseCardEffect.toEffectText(): String =
    when (this) {
        is LunarBaseStaticCardEffect -> effect.toEffectText()
        is LunarBaseTriggeredCardEffect -> "When ${trigger.toEffectText()}:\n${actions.toInlineActionText()}"
    }

private fun LunarBaseStaticEffect.toEffectText(): String =
    when (this) {
        LunarBaseStaticEffect.FORBID_DRAFT_OTHER_INFLUENCE -> "Drafting an influence other than this one is forbidden"
        LunarBaseStaticEffect.FORBID_STEALING_CREDITS -> "Stealing credits is forbidden"
        LunarBaseStaticEffect.NO_SHUTTLE_CREDITS -> "Do not gain credits when the shuttles arrive"
        LunarBaseStaticEffect.RED_ORBS_GAIN_CREDITS -> "Red orbs gain credits as well as yellow orbs"
    }

private fun LunarBaseTrigger.toEffectText(): String =
    when (this) {
        LunarBaseTrigger.BUILD_DOME_OR_LAIKA_MEMORIAL -> "you build a Dome or Laika Memorial"
        LunarBaseTrigger.DISCARD_THIS_INFLUENCE -> "this influence is discarded"
        LunarBaseTrigger.DRAFT_ANY_INFLUENCE -> "any influence is drafted"
    }

internal fun LunarBaseCardAction.toActionText(topLevel: Boolean = false): String =
    when (this) {
        is LunarBaseChooseOneAction -> if (topLevel) {
            "Choose one:\n${actions.joinToString("\n") { it.toActionText() }}"
        } else {
            "Choose one: ${actions.joinToString(" or ") { it.toActionText() }}"
        }
        is LunarBaseDoAllAction -> actions.joinToString(if (topLevel) "\n" else "; ") { it.toActionText() }
        is LunarBaseScopedAction -> "${scope.toActionText()}: ${actions.joinToString("; ") { it.toActionText() }}"
        LunarBaseChooseOpponentAction -> "Choose an opponent"
        is LunarBaseDiscardAction -> amount.toCountedActionText("Discard", "card")
        is LunarBaseDraftAction -> amount.toCountedActionText("Draft", "card")
        is LunarBaseDrawAction -> amount.toCountedActionText("Draw", "card")
        is LunarBaseBuildAction -> amount.toCountedActionText("Build", "module")
        is LunarBaseFlipStationAction -> amount.toFlipStationText()
        is LunarBaseFlipStationToAction -> "Flip your station to ${side.toActionText()}"
        is LunarBaseGainCreditsAction -> amount.toCountedActionText("Gain", "credit")
        is LunarBaseLoseCreditsAction -> amount.toCountedActionText("Lose", "credit")
        is LunarBaseResellAction -> amount.toCountedActionText("Resell", "card")
        is LunarBaseStealCreditsAction -> amount.toCountedActionText("Steal", "credit")
        is LunarBaseStealModuleAction -> "Steal a $moduleName"
        is LunarBaseViewHandAction -> "View ${player.toActionText()} hand"
    }

private fun LunarBaseActionScope.toActionText(): String =
    when (this) {
        LunarBaseActionScope.CHOSEN_PLAYER -> "Chosen player"
        LunarBaseActionScope.EACH_OPPONENT -> "Each opponent"
        LunarBaseActionScope.EACH_PLAYER -> "Each player"
        LunarBaseActionScope.NEIGHBORS_OF_TARGET -> "Neighbors of target"
        LunarBaseActionScope.OPPONENT -> "Opponent"
        LunarBaseActionScope.TARGET -> "Target"
    }

private fun LunarBaseAmount.toCountedActionText(verb: String, singularThing: String): String =
    when (this) {
        is LunarBaseLiteralAmount -> "$verb $value ${singularThing.pluralized(value)}"
        else -> "$verb ${singularThing.pluralized()} equal to ${toPhraseText()}"
    }

private fun String.pluralized(count: Int? = null): String =
    if (count == 1) this else "${this}s"

private fun LunarBaseAmount.toPhraseText(): String =
    when (this) {
        is LunarBaseLiteralAmount -> value.toString()
        LunarBaseHandSizeAmount -> "your hand size"
        LunarBaseInfluenceCountAmount -> "the number of influences in the supply"
    }

private fun LunarBaseFlipStationAmount.toFlipStationText(): String =
    when (this) {
        is LunarBaseLiteralFlipStationAmount -> "Flip $value ${"station".pluralized(value)}"
        LunarBaseAnyNumberFlipStationAmount -> "Flip any number of stations"
        LunarBaseSelfFlipStationAmount -> "Flip your station"
    }

private fun LunarBaseStationSide.toActionText(): String =
    when (this) {
        LunarBaseStationSide.TERRAN_OUTPOST -> "Terran Outpost"
        LunarBaseStationSide.AGENDA_SIDE -> "Agenda Side"
    }

private fun LunarBasePlayerReference.toActionText(): String =
    when (this) {
        LunarBasePlayerReference.CHOSEN_PLAYER -> "chosen player's"
    }
