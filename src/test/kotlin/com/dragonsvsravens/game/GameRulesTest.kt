package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GameRulesTest {

    @Test
    fun `initial snapshot starts in setup with an empty board`() {
        val snapshot = GameRules.createInitialSnapshot()

        assertEquals(Phase.setup, snapshot.phase)
        assertEquals(Side.dragons, snapshot.activeSide)
        assertTrue(snapshot.board.isEmpty())
        assertEquals(emptyList<MoveRecord>(), snapshot.turns)
    }

    @Test
    fun `setup cycles empty to dragon to raven to gold to empty`() {
        val first = GameRules.cycleSetupPiece(GameRules.createInitialSnapshot(), "a1")
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
        val first = GameRules.cycleSetupPiece(GameRules.createInitialSnapshot(), "e5")
        val second = GameRules.cycleSetupPiece(first, "e5")
        val third = GameRules.cycleSetupPiece(second, "e5")

        assertEquals(Piece.dragon, first.board["e5"])
        assertEquals(Piece.raven, second.board["e5"])
        assertEquals(Piece.gold, third.board["e5"])
    }

    @Test
    fun `begin game resets pending move`() {
        val started = GameRules.beginGame(
            GameRules.createInitialSnapshot().copy(
                pendingMove = MoveRecord("a1", "a2")
            )
        )

        assertEquals(Phase.move, started.phase)
        assertEquals(Side.dragons, started.activeSide)
        assertNull(started.pendingMove)
    }

    @Test
    fun `move enters capture when an opposing piece exists`() {
        val moved = GameRules.movePiece(
            GameRules.beginGame(
                GameRules.createInitialSnapshot().copy(
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
        assertEquals(MoveRecord("a1", "a2"), moved.pendingMove)
    }

    @Test
    fun `move commits immediately when nothing is capturable`() {
        val moved = GameRules.movePiece(
            GameRules.beginGame(
                GameRules.createInitialSnapshot().copy(
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
        assertEquals(listOf(MoveRecord("a1", "a2")), moved.turns)
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
                pendingMove = MoveRecord("a1", "a2"),
                turns = emptyList()
            ),
            "b2"
        )

        assertFalse(captured.board.containsKey("b2"))
        assertEquals(Phase.move, captured.phase)
        assertEquals(Side.ravens, captured.activeSide)
        assertEquals(listOf(MoveRecord("a1", "a2", "b2")), captured.turns)
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
                pendingMove = MoveRecord("a1", "a2"),
                turns = emptyList()
            )
        )

        assertEquals(Phase.move, committed.phase)
        assertEquals(Side.ravens, committed.activeSide)
        assertEquals(listOf(MoveRecord("a1", "a2")), committed.turns)
    }
}
