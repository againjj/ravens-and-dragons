package com.ravensanddragons.lunarbase

import com.ravensanddragons.lunarbase.cards.LunarBaseAnyNumberFlipStationAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseActionScope
import com.ravensanddragons.lunarbase.cards.LunarBaseBuildAction
import com.ravensanddragons.lunarbase.cards.LunarBaseChooseOneAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDiscardAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDoAllAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDrawAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDraftAction
import com.ravensanddragons.lunarbase.cards.LunarBaseFlipStationAction
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
import com.ravensanddragons.lunarbase.cards.LunarBaseChooseOpponentAction
import com.ravensanddragons.lunarbase.cards.LunarBaseViewHandAction
import kotlin.test.Test
import kotlin.test.assertEquals

class LunarBaseActionTextTest {
    @Test
    fun topLevelChoiceUsesLineBreaksBetweenChoices() {
        val text = listOf(
            LunarBaseChooseOneAction(
                listOf(
                    LunarBaseDraftAction(LunarBaseLiteralAmount(1)),
                    LunarBaseDrawAction(LunarBaseLiteralAmount(2))
                )
            )
        ).toActionText()

        assertEquals("Choose one:\nDraft 1 card\nDraw 2 cards", text)
    }

    @Test
    fun chooseOneInsideTopLevelSequenceUsesInlineChoices() {
        val text = listOf(
            LunarBaseChooseOpponentAction,
            LunarBaseViewHandAction(LunarBasePlayerReference.CHOSEN_PLAYER),
            LunarBaseChooseOneAction(
                listOf(
                    LunarBaseDrawAction(LunarBaseLiteralAmount(1)),
                    LunarBaseScopedAction(
                        LunarBaseActionScope.CHOSEN_PLAYER,
                        listOf(LunarBaseDiscardAction(LunarBaseLiteralAmount(1)))
                    )
                )
            )
        ).toActionText()

        assertEquals(
            "Choose an opponent\n" +
                "View chosen player's hand\n" +
                "Choose one: Draw 1 card or Chosen player: Discard 1 card",
            text
        )
    }

    @Test
    fun topLevelDoAllUsesLineBreaksBetweenActions() {
        val text = listOf(
            LunarBaseDoAllAction(
                listOf(
                    LunarBaseBuildAction(LunarBaseLiteralAmount(1)),
                    LunarBaseDiscardAction(LunarBaseLiteralAmount(2))
                )
            )
        ).toActionText()

        assertEquals("Build 1 module\nDiscard 2 cards", text)
    }

    @Test
    fun nonNumericAmountsNameTheRulePhrase() {
        val text = listOf(
            LunarBaseDiscardAction(LunarBaseHandSizeAmount),
            LunarBaseResellAction(LunarBaseInfluenceCountAmount),
            LunarBaseGainCreditsAction(LunarBaseHandSizeAmount)
        ).toActionText()

        assertEquals(
            "Discard cards equal to your hand size\n" +
                "Resell cards equal to the number of influences in the supply\n" +
                "Gain credits equal to your hand size",
            text
        )
    }

    @Test
    fun countedActionsUseTheRightThingNames() {
        val text = listOf(
            LunarBaseDraftAction(LunarBaseLiteralAmount(1)),
            LunarBaseDrawAction(LunarBaseLiteralAmount(2)),
            LunarBaseBuildAction(LunarBaseLiteralAmount(1)),
            LunarBaseLoseCreditsAction(LunarBaseLiteralAmount(1)),
            LunarBaseStealCreditsAction(LunarBaseLiteralAmount(2)),
            LunarBaseStealModuleAction("Satellite")
        ).toActionText()

        assertEquals(
            "Draft 1 card\n" +
                "Draw 2 cards\n" +
                "Build 1 module\n" +
                "Lose 1 credit\n" +
                "Steal 2 credits\n" +
                "Steal a Satellite",
            text
        )
    }

    @Test
    fun flipStationActionsUseStationPhrases() {
        val text = listOf(
            LunarBaseFlipStationAction(LunarBaseLiteralFlipStationAmount(1)),
            LunarBaseFlipStationAction(LunarBaseLiteralFlipStationAmount(2)),
            LunarBaseFlipStationAction(LunarBaseAnyNumberFlipStationAmount),
            LunarBaseFlipStationAction(LunarBaseSelfFlipStationAmount),
            LunarBaseFlipStationToAction(LunarBaseStationSide.AGENDA_SIDE)
        ).toActionText()

        assertEquals(
            "Flip 1 station\n" +
                "Flip 2 stations\n" +
                "Flip any number of stations\n" +
                "Flip your station\n" +
                "Flip your station to Agenda Side",
            text
        )
    }

    @Test
    fun effectsUseReadableCatalogText() {
        assertEquals(
            "Red orbs gain credits as well as yellow orbs",
            LunarBaseStaticCardEffect(LunarBaseStaticEffect.RED_ORBS_GAIN_CREDITS).toEffectText()
        )
        assertEquals(
            "When this influence is discarded:\nDraw 4 cards; Discard 3 cards",
            LunarBaseTriggeredCardEffect(
                LunarBaseTrigger.DISCARD_THIS_INFLUENCE,
                listOf(
                    LunarBaseDrawAction(LunarBaseLiteralAmount(4)),
                    LunarBaseDiscardAction(LunarBaseLiteralAmount(3))
                )
            ).toEffectText()
        )
    }
}
