package com.ravensanddragons.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.Test
import java.util.concurrent.atomic.AtomicInteger

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
    fun `bot registry exposes both release four bots on supported rulesets and none on free play`() {
        val registry = BotRegistry(object : RandomIndexSource {
            override fun nextInt(bound: Int): Int = 0
        })

        assertEquals(
            listOf(BotRegistry.randomBotId, BotRegistry.simpleBotId, BotRegistry.minimaxBotId),
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
}
