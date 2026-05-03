package com.ravensanddragons.game

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.web.*


import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.fail
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class BotMatchHarnessTest {
    companion object {
        private const val gamesPerMatchupProperty = "botMatchHarnessGamesPerMatchup"
        private const val defaultGamesPerMatchup = 1
    }

    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val machineTrainedRegistry = MachineTrainedRegistry.from(MachineTrainedModelLoader(objectMapper))

    @Test
    fun `randall and maxine complete many head to head games without errors`() {
        val gamesPerMatchup = configuredGamesPerMatchup()
        val matchups = mutableListOf<BotMatchResult>()

        BotRegistry.releaseTwoSupportedRuleConfigurationIds.forEach { ruleConfigurationId ->
            repeat(gamesPerMatchup) { seed ->
                matchups += runMatch(
                    ruleConfigurationId = ruleConfigurationId,
                    dragonsBotId = BotRegistry.randomBotId,
                    ravensBotId = BotRegistry.minimaxBotId,
                    seed = seed + 1
                )
                matchups += runMatch(
                    ruleConfigurationId = ruleConfigurationId,
                    dragonsBotId = BotRegistry.minimaxBotId,
                    ravensBotId = BotRegistry.randomBotId,
                    seed = seed + 101
                )
            }
        }

        assertEquals(expectedGameCount(gamesPerMatchup), matchups.size)
        assertTrue(matchups.all { it.finished }, "Every Randall vs Maxine match should finish.")
        assertTrue(matchups.all { it.turnCount > 0 }, "Every Randall vs Maxine match should make progress.")

        val outcomesByLabel = matchups.groupingBy { it.outcome }.eachCount().toSortedMap()
        val averageTurns = matchups.map(BotMatchResult::turnCount).average()
        println(
            buildString {
                append("BotMatchHarness summary: ran ")
                append(matchups.size)
                append(" games; outcomes=")
                append(outcomesByLabel)
                append("; averagePlies=")
                append(String.format("%.2f", averageTurns))
            }
        )
    }

    @Test
    fun `michelle completes sherwood evaluation games against baseline bots`() {
        val gamesPerMatchup = configuredGamesPerMatchup()
        val baselineBotIds = listOf(
            BotRegistry.randomBotId,
            BotRegistry.simpleBotId,
            BotRegistry.minimaxBotId,
            BotRegistry.deepMinimaxBotId
        )
        val matchups = mutableListOf<BotMatchResult>()

        baselineBotIds.forEachIndexed { index, baselineBotId ->
            repeat(gamesPerMatchup) { seed ->
                matchups += runMatch(
                    ruleConfigurationId = "sherwood-rules",
                    dragonsBotId = BotRegistry.machineTrainedBotId,
                    ravensBotId = baselineBotId,
                    seed = seed + 1 + (index * 100)
                )
                matchups += runMatch(
                    ruleConfigurationId = "sherwood-rules",
                    dragonsBotId = baselineBotId,
                    ravensBotId = BotRegistry.machineTrainedBotId,
                    seed = seed + 51 + (index * 100)
                )
            }
        }

        assertEquals(baselineBotIds.size * 2 * gamesPerMatchup, matchups.size)
        assertTrue(matchups.all { it.finished }, "Every Michelle evaluation match should finish.")
        assertTrue(matchups.all { it.turnCount > 0 }, "Every Michelle evaluation match should make progress.")

        val outcomesByLabel = matchups.groupingBy { it.outcome }.eachCount().toSortedMap()
        val averageTurns = matchups.map(BotMatchResult::turnCount).average()
        println(
            buildString {
                append("Michelle Sherwood evaluation summary: ran ")
                append(matchups.size)
                append(" games; outcomes=")
                append(outcomesByLabel)
                append("; averagePlies=")
                append(String.format("%.2f", averageTurns))
            }
        )
    }

    private fun runMatch(
        ruleConfigurationId: String,
        dragonsBotId: String,
        ravensBotId: String,
        seed: Int
    ): BotMatchResult {
        val clock = fixedClock()
        val snapshot = GameRules.startGame(ruleConfigurationId)
        val initial = GameSessionFactory.createFreshStoredGame(
            gameId = "bot-match-$ruleConfigurationId-$dragonsBotId-$ravensBotId-$seed",
            snapshot = snapshot,
            selectedRuleConfigurationId = snapshot.ruleConfigurationId,
            selectedStartingSide = snapshot.activeSide,
            selectedBoardSize = snapshot.boardSize,
            dragonsBotId = dragonsBotId,
            ravensBotId = ravensBotId,
            now = clock.instant()
        )
        val runner = BotTurnRunner(
            GameCommandService(clock),
            BotRegistry(SeededRandomIndexSource(seed), machineTrainedRegistry)
        )
        var persistedTurns = 0

        val result = try {
            runner.runBotTurns(initial) { stored ->
                persistedTurns = stored.session.snapshot.turns.size
                if (persistedTurns > 400) {
                    fail("Bot match exceeded 400 plies: rule=$ruleConfigurationId dragons=$dragonsBotId ravens=$ravensBotId seed=$seed")
                }
                stored
            }
        } catch (exception: RuntimeException) {
            fail("Bot match crashed: rule=$ruleConfigurationId dragons=$dragonsBotId ravens=$ravensBotId seed=$seed after $persistedTurns plies: ${exception.message}")
        }

        return BotMatchResult(
            finished = result.session.lifecycle == GameLifecycle.finished,
            turnCount = result.session.snapshot.turns.size,
            outcome = result.session.snapshot.turns.lastOrNull()?.outcome ?: "Unknown"
        )
    }

    private fun configuredGamesPerMatchup(): Int =
        (System.getProperty(gamesPerMatchupProperty)?.toIntOrNull() ?: defaultGamesPerMatchup)
            .also { gamesPerMatchup ->
                require(gamesPerMatchup > 0) {
                    "$gamesPerMatchupProperty must be a positive integer."
                }
            }

    private fun expectedGameCount(gamesPerMatchup: Int): Int =
        BotRegistry.releaseTwoSupportedRuleConfigurationIds.size * 2 * gamesPerMatchup

    private fun fixedClock(now: Instant = Instant.parse("2026-04-08T12:00:00Z")): Clock =
        Clock.fixed(now, ZoneOffset.UTC)

    private data class BotMatchResult(
        val finished: Boolean,
        val turnCount: Int,
        val outcome: String
    )

    private class SeededRandomIndexSource(
        seed: Int
    ) : RandomIndexSource {
        private var state: Int = if (seed != 0) seed else 1

        override fun nextInt(bound: Int): Int {
            state = (state * 1103515245 + 12345) and Int.MAX_VALUE
            return state % bound
        }
    }
}
