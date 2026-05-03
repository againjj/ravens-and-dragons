package com.ravensanddragons.game

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.web.*


import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import java.util.concurrent.atomic.AtomicInteger
import kotlin.system.measureNanoTime

class GameBotsTest {

    @Test
    fun `simple bot chooses an immediate win before heuristic scoring`() {
        val strategy = SimpleGameBotStrategy()
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "a2" to Piece.gold,
                "d5" to Piece.dragon,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "sherwood-rules",
            positionKeys = listOf("initial")
        )

        val move = strategy.chooseMove(snapshot, GameRules.getLegalMoves(snapshot))

        assertEquals(LegalMove("a2", "a1"), move)
    }

    @Test
    fun `simple bot prefers moving the gold closer to a corner in a quiet position`() {
        val strategy = SimpleGameBotStrategy()
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "d4" to Piece.gold,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "original-game",
            positionKeys = listOf("initial")
        )

        val move = strategy.chooseMove(snapshot, GameRules.getLegalMoves(snapshot))

        assertEquals(LegalMove("d4", "a4"), move)
    }

    @Test
    fun `simple bot stays deterministic under stable legal move ordering`() {
        val strategy = SimpleGameBotStrategy()
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "d4" to Piece.gold,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "original-game",
            positionKeys = listOf("initial")
        )
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val firstChoice = strategy.chooseMove(snapshot, legalMoves)
        val secondChoice = strategy.chooseMove(snapshot, legalMoves)

        assertEquals(firstChoice, secondChoice)
    }

    @Test
    fun `minimax bot chooses the immediate winning move when available`() {
        val strategy = MinimaxGameBotStrategy()
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "a2" to Piece.gold,
                "d5" to Piece.dragon,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "sherwood-rules",
            positionKeys = listOf("initial")
        )

        val move = strategy.chooseMove(snapshot, GameRules.getLegalMoves(snapshot))

        assertEquals(LegalMove("a2", "a1"), move)
    }

    @Test
    fun `minimax bot stays deterministic under stable legal move ordering`() {
        val strategy = MinimaxGameBotStrategy()
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "d4" to Piece.gold,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "original-game",
            positionKeys = listOf("initial")
        )
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val firstChoice = strategy.chooseMove(snapshot, legalMoves)
        val secondChoice = strategy.chooseMove(snapshot, legalMoves)

        assertEquals(firstChoice, secondChoice)
    }

    @Test
    fun `minimax bot returns a stable legal move on a larger supported board`() {
        val strategy = MinimaxGameBotStrategy()
        val snapshot = GameRules.startGame("square-one-x-9")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val firstChoice = strategy.chooseMove(snapshot, legalMoves)
        val secondChoice = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(firstChoice in legalMoves)
        assertEquals(firstChoice, secondChoice)
    }

    @Test
    fun `minimax bot search stays within a stable node budget on a larger supported board`() {
        val visitedNodes = AtomicInteger(0)
        val strategy = MinimaxGameBotStrategy(
            searchObserver = MinimaxSearchObserver { visitedNodes.incrementAndGet() }
        )
        val snapshot = GameRules.startGame("square-one-x-9")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val move = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(move in legalMoves)
        assertTrue(visitedNodes.get() < 1068)
    }

    @Test
    fun `alpha beta bot stays deterministic under stable legal move ordering`() {
        val strategy = AlphaBetaGameBotStrategy(searchDepth = 4)
        val snapshot = GameRules.startGame("square-one")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val firstChoice = strategy.chooseMove(snapshot, legalMoves)
        val secondChoice = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(firstChoice in legalMoves)
        assertEquals(firstChoice, secondChoice)
    }

    @Disabled("Manual cross-strategy comparison; enable when checking representative depth-2 behavior.")
    @Test
    fun `depth two minimax and alpha beta choose the same move across representative positions`() {
        val minimax = MinimaxGameBotStrategy(searchDepth = 2)
        val alphaBeta = AlphaBetaGameBotStrategy(searchDepth = 2)
        val mismatches = representativeComparisonSnapshots().mapNotNull { snapshot ->
            val legalMoves = GameRules.getLegalMoves(snapshot)
            val minimaxMove = minimax.chooseMove(snapshot, legalMoves)
            val alphaBetaMove = alphaBeta.chooseMove(snapshot, legalMoves)

            if (minimaxMove == alphaBetaMove) {
                null
            } else {
                buildString {
                    append(snapshot.ruleConfigurationId)
                    append(" active=")
                    append(snapshot.activeSide)
                    append(" phase=")
                    append(snapshot.phase)
                    append(" board=")
                    append(snapshot.board)
                    append(" minimax=")
                    append(minimaxMove)
                    append(" alphaBeta=")
                    append(alphaBetaMove)
                }
            }
        }

        assertTrue(
            mismatches.isEmpty(),
            "Expected depth-2 minimax and alpha-beta to agree, but found mismatches:\n${mismatches.joinToString("\n")}"
        )
    }

    @Disabled("Manual performance comparison; timing is environment-sensitive and should not run in the regular suite.")
    @Test
    fun `depth two alpha beta timing can be compared against minimax across representative positions`() {
        val minimax = MinimaxGameBotStrategy(searchDepth = 2)
        val alphaBeta = AlphaBetaGameBotStrategy(searchDepth = 2)
        val snapshots = representativeComparisonSnapshots()
        val repetitionsPerPosition = 25

        val minimaxTiming = measureStrategyTiming(minimax, snapshots, repetitionsPerPosition)
        val alphaBetaTiming = measureStrategyTiming(alphaBeta, snapshots, repetitionsPerPosition)
        val alphaBetaShare = alphaBetaTiming.totalNanos.toDouble() / minimaxTiming.totalNanos.toDouble()

        println(
            buildString {
                appendLine("Depth-2 strategy timing across ${snapshots.size} representative positions")
                appendLine("repetitionsPerPosition=$repetitionsPerPosition")
                appendLine("minimaxTotalNanos=${minimaxTiming.totalNanos}")
                appendLine("alphaBetaTotalNanos=${alphaBetaTiming.totalNanos}")
                appendLine("alphaBetaShareOfMinimax=$alphaBetaShare")
                appendLine("minimaxAverageNanos=${minimaxTiming.averageNanosPerSearch}")
                append("alphaBetaAverageNanos=${alphaBetaTiming.averageNanosPerSearch}")
            }
        )

        assertTrue(minimaxTiming.totalNanos > 0L)
        assertTrue(alphaBetaTiming.totalNanos > 0L)
    }

    @Test
    fun `minimax bot search uses hypothetical snapshots without mutating the input snapshot`() {
        val strategy = MinimaxGameBotStrategy()
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "d4" to Piece.gold,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "original-game",
            positionKeys = listOf("initial")
        )
        val originalSnapshot = snapshot.copy(
            board = LinkedHashMap(snapshot.board),
            turns = snapshot.turns.toList(),
            positionKeys = snapshot.positionKeys.toList()
        )

        strategy.chooseMove(snapshot, GameRules.getLegalMoves(snapshot))

        assertEquals(originalSnapshot, snapshot)
    }

    @Test
    fun `random bot still selects only legal actions`() {
        val strategy = RandomGameBotStrategy(object : RandomIndexSource {
            override fun nextInt(bound: Int): Int = bound - 1
        })
        val snapshot = GameRules.startGame("sherwood-rules")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val move = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(move in legalMoves)
    }

    @Test
    fun `optimized legal move counting matches generated move lists`() {
        val snapshots = listOf(
            GameRules.startGame("original-game"),
            GameRules.startGame("sherwood-rules"),
            GameRules.startGame("square-one"),
            GameRules.startGame("square-one-x-9"),
            GameRules.startGame("trivial"),
            GameRules.startGame(
                ruleConfigurationId = GameRules.freePlayRuleConfigurationId,
                initialBoard = linkedMapOf(
                    "a1" to Piece.dragon,
                    "d4" to Piece.gold,
                    "g7" to Piece.raven
                )
            )
        )

        snapshots.forEach { snapshot ->
            assertEquals(GameRules.getLegalMoves(snapshot).size, GameRules.countLegalMoves(snapshot))
        }
    }

    @Test
    fun `generated legal moves remain executable for representative positions`() {
        val snapshots = listOf(
            GameRules.startGame("original-game"),
            GameRules.startGame("sherwood-rules"),
            GameRules.startGame("square-one"),
            GameRules.startGame("square-one-x-9"),
            GameRules.startGame("trivial"),
            GameRules.startGame(
                ruleConfigurationId = GameRules.freePlayRuleConfigurationId,
                initialBoard = linkedMapOf(
                    "a1" to Piece.dragon,
                    "d4" to Piece.gold,
                    "g7" to Piece.raven
                )
            ),
            sherwoodMaxineRegressionPosition()
        )

        snapshots.forEach { snapshot ->
            GameRules.getLegalMoves(snapshot).forEach { move ->
                try {
                    GameRules.movePiece(snapshot, move.origin, move.destination)
                } catch (exception: RuntimeException) {
                    fail("Generated move $move was not executable for ${snapshot.ruleConfigurationId}: ${exception.message}")
                }
            }
        }
    }

    @Test
    fun `minimax bot handles the sherwood occupied destination regression position`() {
        val strategy = MinimaxGameBotStrategy()
        val snapshot = sherwoodMaxineRegressionPosition()
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val move = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(move in legalMoves)
    }

    @Test
    fun `alpha beta bot handles the sherwood occupied destination regression position`() {
        val strategy = AlphaBetaGameBotStrategy(searchDepth = 4)
        val snapshot = sherwoodMaxineRegressionPosition()
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val move = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(move in legalMoves)
    }

    @Test
    fun `bot registry exposes every supported baseline bot on release two rulesets and none on free play`() {
        val registry = BotRegistry(object : RandomIndexSource {
            override fun nextInt(bound: Int): Int = 0
        })

        assertEquals(
            listOf(
                BotRegistry.randomBotId,
                BotRegistry.simpleBotId,
                BotRegistry.minimaxBotId,
                BotRegistry.deepMinimaxBotId
            ),
            registry.availableBotsFor("original-game").map(BotSummary::id)
        )
        assertTrue(registry.availableBotsFor(GameRules.freePlayRuleConfigurationId).isEmpty())
    }

    private fun sherwoodMaxineRegressionPosition(): GameSnapshot =
        GameRules.startGame("sherwood-rules")
            .let { GameRules.movePiece(it, "b4", "b3") }
            .let { GameRules.movePiece(it, "c4", "c5") }
            .let { GameRules.movePiece(it, "d2", "c2") }
            .let { GameRules.movePiece(it, "d3", "c3") }

    private fun representativeComparisonSnapshots(): List<GameSnapshot> = listOf(
        GameRules.startGame("original-game"),
        positionFromLegalMoveIndices(GameRules.startGame("original-game"), 0, 3),
        positionFromLegalMoveIndices(GameRules.startGame("original-game"), 5, 2, 4),
        GameRules.startGame("sherwood-rules"),
        positionFromLegalMoveIndices(GameRules.startGame("sherwood-rules"), 1, 4),
        sherwoodMaxineRegressionPosition(),
        GameRules.startGame("square-one"),
        positionFromLegalMoveIndices(GameRules.startGame("square-one"), 2, 7),
        positionFromLegalMoveIndices(GameRules.startGame("square-one"), 6, 1, 5),
        GameRules.startGame("square-one-x-9"),
        positionFromLegalMoveIndices(GameRules.startGame("square-one-x-9"), 3, 8),
        GameRules.startGame(
            ruleConfigurationId = GameRules.freePlayRuleConfigurationId,
            initialBoard = linkedMapOf(
                "a1" to Piece.dragon,
                "d4" to Piece.gold,
                "g7" to Piece.raven,
                "c6" to Piece.raven
            )
        ),
        positionFromLegalMoveIndices(
            GameRules.startGame(
                ruleConfigurationId = GameRules.freePlayRuleConfigurationId,
                initialBoard = linkedMapOf(
                    "a1" to Piece.dragon,
                    "d4" to Piece.gold,
                    "g7" to Piece.raven,
                    "c6" to Piece.raven
                )
            ),
            2,
            1
        )
    ).filter { snapshot ->
        snapshot.phase == Phase.move && GameRules.getLegalMoves(snapshot).isNotEmpty()
    }

    private fun positionFromLegalMoveIndices(snapshot: GameSnapshot, vararg moveIndices: Int): GameSnapshot =
        moveIndices.fold(snapshot) { current, requestedIndex ->
            val legalMoves = GameRules.getLegalMoves(current)
            if (legalMoves.isEmpty()) {
                return@fold current
            }
            val move = legalMoves[requestedIndex % legalMoves.size]
            GameRules.movePiece(current, move.origin, move.destination)
        }

    private fun measureStrategyTiming(
        strategy: GameBotStrategy,
        snapshots: List<GameSnapshot>,
        repetitionsPerPosition: Int
    ): StrategyTiming {
        var totalNanos = 0L
        var searches = 0

        repeat(repetitionsPerPosition) {
            snapshots.forEach { snapshot ->
                val legalMoves = GameRules.getLegalMoves(snapshot)
                totalNanos += measureNanoTime {
                    val move = strategy.chooseMove(snapshot, legalMoves)
                    assertTrue(move in legalMoves)
                }
                searches += 1
            }
        }

        return StrategyTiming(
            totalNanos = totalNanos,
            averageNanosPerSearch = totalNanos / searches
        )
    }

    private data class StrategyTiming(
        val totalNanos: Long,
        val averageNanosPerSearch: Long
    )
}
