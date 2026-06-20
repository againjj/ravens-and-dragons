package com.ravensanddragons.lunarbase.cards

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs

class LunarBaseCardScriptTest {
    @Test
    fun loadsStandardCardsScriptAsFinalExpression() {
        val deck = loadStandardDeckScript()

        assertEquals(50, deck.modules.sumOf { it.count })
        assertEquals(26, deck.agents.sumOf { it.count })
        assertEquals(8, deck.influences.sumOf { it.count })
        assertEquals(6, deck.stations.sumOf { it.count })
        assertEquals(1, deck.stationFront.count)
    }

    @Test
    fun standardCardsScriptProducesRepresentativeCardData() {
        val deck = loadStandardDeckScript()

        val crazyPresident = deck.agents.single { it.name == "Crazy President" }
        assertEquals(2, crazyPresident.count)
        assertEquals("Peripeteia", crazyPresident.flavorText)
        val eachPlayer = assertIs<LunarBaseScopedAction>(crazyPresident.onPlaying.single())
        assertEquals(LunarBaseActionScope.EACH_PLAYER, eachPlayer.scope)
        val flipStation = assertIs<LunarBaseFlipStationAction>(eachPlayer.actions.single())
        assertIs<LunarBaseSelfFlipStationAmount>(flipStation.amount)

        val lunarAlliance = deck.influences.single { it.name == "Lunar Alliance" }
        val staticEffect = assertIs<LunarBaseStaticCardEffect>(lunarAlliance.effect)
        assertEquals(LunarBaseStaticEffect.FORBID_STEALING_CREDITS, staticEffect.effect)

        val runawayBureaucracy = deck.influences.single { it.name == "Runaway Bureaucracy" }
        val triggeredEffect = assertIs<LunarBaseTriggeredCardEffect>(runawayBureaucracy.effect)
        assertEquals(LunarBaseTrigger.DRAFT_ANY_INFLUENCE, triggeredEffect.trigger)
        assertIs<LunarBaseDiscardAction>(triggeredEffect.actions.single())

        val asteroidGrinder = deck.modules.single { it.name == "Asteroid Grinder" }
        assertEquals(yellow, asteroidGrinder.cardColor)
        assertEquals(yellow, asteroidGrinder.connectors.top)
        assertEquals(yellow, asteroidGrinder.connectors.topLeft)
        assertEquals(yellow, asteroidGrinder.connectors.bottomLeft)
        assertEquals(listOf(yellow, yellow), asteroidGrinder.cardCost)

        val spaceElevator = deck.modules.single { it.name == "Space Elevator" }
        assertEquals(gray, spaceElevator.cardColor)

        val satellite = deck.modules.single { it.name == "Satellite" }
        val resell = assertIs<LunarBaseResellAction>(satellite.onPlaying.single())
        assertIs<LunarBaseInfluenceCountAmount>(resell.amount)

        val terranOutpost = deck.stationFront
        assertEquals("Terran Outpost", terranOutpost.name)
        val chooseOne = assertIs<LunarBaseChooseOneAction>(terranOutpost.mainAction.single())
        assertEquals(2, chooseOne.actions.size)
    }

    @Test
    fun deckRequiresExactlyOneStationFront() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 30
                    name = "Module"
                    connectors { top = gray }
                    cardCost = listOf()
                }
            }
        }

        assertEquals("Exactly one station front is required.", exception.message)
    }

    @Test
    fun deckRequiresAtLeastSixStations() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 5
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 30
                    name = "Module"
                    connectors { top = gray }
                    cardCost = listOf()
                }
            }
        }

        assertEquals("At least six station cards are required.", exception.message)
    }

    @Test
    fun deckRequiresAtLeastThirtyNonStationCards() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 29
                    name = "Module"
                    connectors { top = gray }
                    cardCost = listOf()
                }
            }
        }

        assertEquals("At least 30 non-station cards are required.", exception.message)
    }

    @Test
    fun deckRequiresUniqueCardNames() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Duplicate"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 30
                    name = "Duplicate"
                    connectors { top = gray }
                    cardCost = listOf()
                }
            }
        }

        assertEquals("Card names must be unique. Duplicate names: Duplicate.", exception.message)
    }

    @Test
    fun cardBuildersRequireExplicitRequiredFields() {
        val missingAgentCount = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                agent {
                    name = "Agent"
                    onPlaying { draw { 1 } }
                    cardCost = listOf()
                }
            }
        }
        assertEquals("Agent count is required.", missingAgentCount.message)

        val missingInfluenceEffect = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                influence {
                    count = 30
                    name = "Influence"
                }
            }
        }
        assertEquals("Influence effect is required.", missingInfluenceEffect.message)
    }

    @Test
    fun modulesCannotDefineBothOnPlayingAndMainAction() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 30
                    name = "Module"
                    connectors { top = gray }
                    cardCost = listOf()
                    onPlaying { draw { 1 } }
                    mainAction { build { 1 } }
                }
            }
        }

        assertEquals("Module cannot define both onPlaying and mainAction.", exception.message)
    }

    @Test
    fun modulesCannotDefineEffectWithOnPlayingOrMainAction() {
        val effectWithOnPlaying = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 30
                    name = "Module"
                    connectors { top = gray }
                    cardCost = listOf()
                    effect = staticEffect { redOrbsGainCredits }
                    onPlaying { draw { 1 } }
                }
            }
        }
        assertEquals("Module cannot define effect with onPlaying or mainAction.", effectWithOnPlaying.message)

        val effectWithMainAction = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction { draw { 1 } }
                }
                station {
                    count = 6
                    name = "Station"
                    mainAction { draw { 1 } }
                }
                module {
                    count = 30
                    name = "Module"
                    connectors { top = gray }
                    cardCost = listOf()
                    effect = staticEffect { redOrbsGainCredits }
                    mainAction { draw { 1 } }
                }
            }
        }
        assertEquals("Module cannot define effect with onPlaying or mainAction.", effectWithMainAction.message)
    }

    @Test
    fun chooseOneRequiresAtLeastTwoActions() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction {
                        chooseOne {
                            draw { 1 }
                        }
                    }
                }
            }
        }

        assertEquals("Choose one requires at least two actions.", exception.message)
    }

    @Test
    fun doAllRequiresAtLeastTwoActions() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction {
                        doAll {
                            draw { 1 }
                        }
                    }
                }
            }
        }

        assertEquals("Do all requires at least two actions.", exception.message)
    }

    @Test
    fun chosenPlayerScopeRequiresEarlierChooseOpponent() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction {
                        chosenPlayer {
                            draw { 1 }
                        }
                    }
                }
            }
        }

        assertEquals("chosenPlayer actions require an earlier chooseOpponent action.", exception.message)
    }

    @Test
    fun viewHandChosenPlayerRequiresEarlierChooseOpponent() {
        val exception = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    connectors { top = gray }
                    mainAction {
                        viewHand { chosenPlayer }
                    }
                }
            }
        }

        assertEquals("viewHand chosenPlayer requires an earlier chooseOpponent action.", exception.message)
    }

    private fun loadStandardDeckScript(): LunarBaseDeckDefinition {
        return LunarBaseStandardDeck.definition
    }

}
