package com.ravensanddragons.lunarbase.cards

import java.io.File
import kotlin.script.experimental.api.ResultValue
import kotlin.script.experimental.api.ScriptCompilationConfiguration
import kotlin.script.experimental.api.ScriptEvaluationConfiguration
import kotlin.script.experimental.api.defaultImports
import kotlin.script.experimental.api.valueOrThrow
import kotlin.script.experimental.host.toScriptSource
import kotlin.script.experimental.jvm.dependenciesFromCurrentContext
import kotlin.script.experimental.jvm.jvm
import kotlin.script.experimental.jvmhost.BasicJvmScriptingHost
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertFailsWith

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
        assertEquals(yellow, asteroidGrinder.orbHalves.top)
        assertEquals(yellow, asteroidGrinder.orbHalves.topLeft)
        assertEquals(yellow, asteroidGrinder.orbHalves.bottomLeft)
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
                    orbHalves { top = gray }
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
                    orbHalves { top = gray }
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
                    orbHalves { top = gray }
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
                    orbHalves { top = gray }
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
                    orbHalves { top = gray }
                    cardCost = listOf()
                }
            }
        }

        assertEquals("At least 30 non-station cards are required.", exception.message)
    }

    @Test
    fun cardBuildersRequireExplicitRequiredFields() {
        val missingAgentCount = assertFailsWith<IllegalArgumentException> {
            deck {
                stationFront {
                    name = "Front"
                    orbHalves { top = gray }
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
                    orbHalves { top = gray }
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

    private fun loadStandardDeckScript(): LunarBaseDeckDefinition {
        val scriptPath = File(
            requireNotNull(javaClass.classLoader.getResource("card-sets/standard-cards.kts")) {
                "Missing backend standard-cards.kts test resource."
            }.toURI()
        )
        val result = BasicJvmScriptingHost().eval(
            script = scriptPath.toScriptSource(),
            compilationConfiguration = ScriptCompilationConfiguration {
                defaultImports(
                    "com.ravensanddragons.lunarbase.cards.*"
                )
                jvm {
                    dependenciesFromCurrentContext(wholeClasspath = true)
                }
            },
            evaluationConfiguration = ScriptEvaluationConfiguration()
        )
        val evaluation = result.valueOrThrow()
        val returnValue = evaluation.returnValue
        if (returnValue !is ResultValue.Value) {
            error("Expected standard-cards.kts to return a deck, but got ${returnValue::class.simpleName}.")
        }
        return returnValue.value as? LunarBaseDeckDefinition
            ?: error("Expected standard-cards.kts to return ${LunarBaseDeckDefinition::class.simpleName}, but got ${returnValue.value?.let { it::class.qualifiedName }}.")
    }

}
