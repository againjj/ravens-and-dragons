package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GameRulesTest {

    @Test
    fun `initial snapshot starts with no game and an empty board`() {
        val snapshot = GameRules.createInitialSnapshot()

        assertEquals(Phase.none, snapshot.phase)
        assertEquals(Side.dragons, snapshot.activeSide)
        assertTrue(snapshot.board.isEmpty())
        assertEquals(emptyList<TurnRecord>(), snapshot.turns)
    }

    @Test
    fun `start game enters setup with a cleared board and history`() {
        val snapshot = GameRules.startGame()

        assertEquals(Phase.setup, snapshot.phase)
        assertTrue(snapshot.board.isEmpty())
        assertEquals(emptyList<TurnRecord>(), snapshot.turns)
    }

    @Test
    fun `setup cycles empty to dragon to raven to gold to empty`() {
        val first = GameRules.cycleSetupPiece(GameRules.startGame(), "a1")
        val second = GameRules.cycleSetupPiece(first, "a1")
        val third = GameRules.cycleSetupPiece(second, "a1")
        val fourth = GameRules.cycleSetupPiece(third, "a1")

        assertEquals(Piece.dragon, first.board["a1"])
        assertEquals(Piece.raven, second.board["a1"])
        assertEquals(Piece.gold, third.board["a1"])
        assertFalse(fourth.board.containsKey("a1"))
    }

    @Test
    fun `setup can place gold on e5 like any other square`() {
        val first = GameRules.cycleSetupPiece(GameRules.startGame(), "e5")
        val second = GameRules.cycleSetupPiece(first, "e5")
        val third = GameRules.cycleSetupPiece(second, "e5")

        assertEquals(Piece.dragon, first.board["e5"])
        assertEquals(Piece.raven, second.board["e5"])
        assertEquals(Piece.gold, third.board["e5"])
    }

    @Test
    fun `end setup resets pending move and starts with dragons`() {
        val started = GameRules.endSetup(
            GameRules.startGame().copy(
                pendingMove = TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                activeSide = Side.ravens
            )
        )

        assertEquals(Phase.move, started.phase)
        assertEquals(Side.dragons, started.activeSide)
        assertNull(started.pendingMove)
    }

    @Test
    fun `move enters capture when an opposing piece exists`() {
        val moved = GameRules.movePiece(
            GameRules.endSetup(
                GameRules.startGame().copy(
                    board = linkedMapOf(
                        "e5" to Piece.gold,
                        "a1" to Piece.dragon,
                        "b2" to Piece.raven
                    )
                )
            ),
            "a1",
            "a2"
        )

        assertEquals(Phase.capture, moved.phase)
        assertEquals(Side.dragons, moved.activeSide)
        assertEquals(listOf("b2"), GameRules.getCapturableSquares(moved))
        assertEquals(TurnRecord(type = TurnType.move, from = "a1", to = "a2"), moved.pendingMove)
    }

    @Test
    fun `move commits immediately when nothing is capturable`() {
        val moved = GameRules.movePiece(
            GameRules.endSetup(
                GameRules.startGame().copy(
                    board = linkedMapOf(
                        "e5" to Piece.gold,
                        "a1" to Piece.dragon
                    )
                )
            ),
            "a1",
            "a2"
        )

        assertEquals(Phase.move, moved.phase)
        assertEquals(Side.ravens, moved.activeSide)
        assertNull(moved.pendingMove)
        assertEquals(
            listOf(TurnRecord(type = TurnType.move, from = "a1", to = "a2")),
            moved.turns
        )
    }

    @Test
    fun `capture removes the piece and commits the move`() {
        val captured = GameRules.capturePiece(
            GameSnapshot(
                board = linkedMapOf(
                    "e5" to Piece.gold,
                    "a2" to Piece.dragon,
                    "b2" to Piece.raven
                ),
                phase = Phase.capture,
                activeSide = Side.dragons,
                pendingMove = TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                turns = emptyList()
            ),
            "b2"
        )

        assertFalse(captured.board.containsKey("b2"))
        assertEquals(Phase.move, captured.phase)
        assertEquals(Side.ravens, captured.activeSide)
        assertEquals(
            listOf(TurnRecord(type = TurnType.move, from = "a1", to = "a2", captured = "b2")),
            captured.turns
        )
    }

    @Test
    fun `skip capture commits the turn`() {
        val committed = GameRules.commitTurn(
            GameSnapshot(
                board = linkedMapOf(
                    "e5" to Piece.gold,
                    "a2" to Piece.dragon,
                    "b2" to Piece.raven
                ),
                phase = Phase.capture,
                activeSide = Side.dragons,
                pendingMove = TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                turns = emptyList()
            )
        )

        assertEquals(Phase.move, committed.phase)
        assertEquals(Side.ravens, committed.activeSide)
        assertEquals(
            listOf(TurnRecord(type = TurnType.move, from = "a1", to = "a2")),
            committed.turns
        )
    }

    @Test
    fun `end game preserves the board and appends game over`() {
        val ended = GameRules.endGame(
            GameSnapshot(
                board = linkedMapOf(
                    "a2" to Piece.dragon,
                    "b2" to Piece.raven
                ),
                phase = Phase.move,
                activeSide = Side.ravens,
                pendingMove = TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                turns = listOf(TurnRecord(type = TurnType.move, from = "a1", to = "a2"))
            )
        )

        assertEquals(Phase.none, ended.phase)
        assertEquals(linkedMapOf("a2" to Piece.dragon, "b2" to Piece.raven), ended.board)
        assertNull(ended.pendingMove)
        assertEquals(
            listOf(
                TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                TurnRecord(type = TurnType.gameOver)
            ),
            ended.turns
        )
    }
}
