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
        assertEquals(GameRules.freePlayRuleConfigurationId, snapshot.ruleConfigurationId)
    }

    @Test
    fun `free play start game enters setup with a cleared board and history`() {
        val snapshot = GameRules.startGame()

        assertEquals(Phase.setup, snapshot.phase)
        assertTrue(snapshot.board.isEmpty())
        assertEquals(emptyList<TurnRecord>(), snapshot.turns)
        assertEquals(GameRules.freePlayRuleConfigurationId, snapshot.ruleConfigurationId)
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
    fun `free play move enters capture when an opposing piece exists`() {
        val moved = GameRules.movePiece(
            GameRules.endSetup(
                GameRules.startGame().copy(
                    board = linkedMapOf(
                        "d4" to Piece.gold,
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
    fun `free play move commits immediately when nothing is capturable`() {
        val moved = GameRules.movePiece(
            GameRules.endSetup(
                GameRules.startGame().copy(
                    board = linkedMapOf(
                        "d4" to Piece.gold,
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
    fun `free play capture removes the piece and commits the move`() {
        val captured = GameRules.capturePiece(
            createFreePlayCaptureSnapshot(),
            "b2"
        )

        assertFalse(captured.board.containsKey("b2"))
        assertEquals(Phase.move, captured.phase)
        assertEquals(Side.ravens, captured.activeSide)
        assertEquals(
            listOf(TurnRecord(type = TurnType.move, from = "a1", to = "a2", capturedSquares = listOf("b2"))),
            captured.turns
        )
    }

    @Test
    fun `free play skip capture commits the turn`() {
        val committed = GameRules.commitTurn(createFreePlayCaptureSnapshot())

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
            createSnapshot(
                board = linkedMapOf(
                    "a2" to Piece.dragon,
                    "b2" to Piece.raven
                ),
                phase = Phase.move,
                activeSide = Side.ravens,
                pendingMove = TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                turns = listOf(TurnRecord(type = TurnType.move, from = "a1", to = "a2"))
            ),
            "Dragons win"
        )

        assertEquals(Phase.none, ended.phase)
        assertEquals(linkedMapOf("a2" to Piece.dragon, "b2" to Piece.raven), ended.board)
        assertNull(ended.pendingMove)
        assertEquals(
            listOf(
                TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                TurnRecord(type = TurnType.gameOver, outcome = "Dragons win")
            ),
            ended.turns
        )
    }

    @Test
    fun `trivial starts from its preset board with dragons to move`() {
        val snapshot = GameRules.startGame("trivial")

        assertEquals(Phase.move, snapshot.phase)
        assertEquals(Side.dragons, snapshot.activeSide)
        assertEquals(Piece.dragon, snapshot.board["a1"])
        assertEquals(Piece.gold, snapshot.board["a2"])
        assertEquals(Piece.raven, snapshot.board["a7"])
    }

    @Test
    fun `trivial automatically captures adjacent enemies and can end with a dragon win`() {
        val moved = GameRules.movePiece(
            createSnapshot(
                board = linkedMapOf(
                    "a1" to Piece.dragon,
                    "c3" to Piece.gold,
                    "e5" to Piece.raven
                ),
                activeSide = Side.dragons,
                ruleConfigurationId = "trivial"
            ),
            "a1",
            "d5"
        )

        assertEquals(Phase.none, moved.phase)
        assertFalse(moved.board.containsKey("e5"))
        assertEquals("Dragons win", moved.turns.last().outcome)
    }

    @Test
    fun `original game starts from the published setup with ravens to move`() {
        val snapshot = GameRules.startGame("original-game")

        assertEquals(Phase.move, snapshot.phase)
        assertEquals(Side.ravens, snapshot.activeSide)
        assertEquals(Piece.gold, snapshot.board["d4"])
        assertEquals(Piece.dragon, snapshot.board["d5"])
        assertEquals(Piece.raven, snapshot.board["d7"])
        assertEquals(1, snapshot.positionKeys.size)
    }

    @Test
    fun `sherwood rules start from the published setup with ravens to move`() {
        val snapshot = GameRules.startGame("sherwood-rules")

        assertEquals(Phase.move, snapshot.phase)
        assertEquals(Side.ravens, snapshot.activeSide)
        assertEquals(Piece.gold, snapshot.board["d4"])
        assertEquals(Piece.dragon, snapshot.board["d5"])
        assertEquals(Piece.raven, snapshot.board["d7"])
        assertEquals(1, snapshot.positionKeys.size)
    }

    @Test
    fun `original game captures a dragon against the empty center`() {
        val moved = GameRules.movePiece(
            createSnapshot(
                board = linkedMapOf(
                    "c4" to Piece.dragon,
                    "a4" to Piece.raven,
                    "g7" to Piece.gold
                ),
                activeSide = Side.ravens,
                ruleConfigurationId = "original-game",
                positionKeys = listOf("original-game|ravens|a4:raven,c4:dragon,g7:gold")
            ),
            "a4",
            "b4"
        )

        assertFalse(moved.board.containsKey("c4"))
        assertEquals(listOf("c4"), moved.turns.first().capturedSquares)
        assertEquals(Side.dragons, moved.activeSide)
    }

    @Test
    fun `original game rejects moves that leave the moved piece captured`() {
        val exception = org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            GameRules.movePiece(
                createSnapshot(
                    board = linkedMapOf(
                        "b4" to Piece.raven,
                        "c1" to Piece.dragon,
                        "g7" to Piece.gold
                    ),
                    activeSide = Side.ravens,
                    ruleConfigurationId = "original-game"
                ),
                "b4",
                "b1"
            )
        }

        assertEquals("You may not move so that your piece is captured.", exception.message)
    }

    @Test
    fun `original game rejects moves that are self captures even when they also capture an enemy`() {
        val exception = org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            GameRules.movePiece(
                createSnapshot(
                    board = linkedMapOf(
                        "d6" to Piece.raven,
                        "f6" to Piece.raven,
                        "c5" to Piece.dragon,
                        "e5" to Piece.dragon,
                        "g5" to Piece.raven,
                        "a4" to Piece.raven,
                        "e4" to Piece.gold,
                        "c3" to Piece.dragon,
                        "e3" to Piece.raven,
                        "f3" to Piece.raven,
                        "b2" to Piece.raven,
                        "d2" to Piece.dragon,
                        "d1" to Piece.raven
                    ),
                    activeSide = Side.ravens,
                    ruleConfigurationId = "original-game"
                ),
                "e3",
                "d3"
            )
        }

        assertEquals("You may not move so that your piece is captured.", exception.message)
    }

    @Test
    fun `original game rejects moves that cause other friendly pieces to be captured`() {
        val exception = org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            GameRules.movePiece(
                createSnapshot(
                    board = linkedMapOf(
                        "d7" to Piece.raven,
                        "f7" to Piece.raven,
                        "d6" to Piece.raven,
                        "d5" to Piece.dragon,
                        "a4" to Piece.raven,
                        "b4" to Piece.raven,
                        "c4" to Piece.dragon,
                        "d4" to Piece.gold,
                        "f4" to Piece.dragon,
                        "d3" to Piece.dragon,
                        "e2" to Piece.raven,
                        "d1" to Piece.raven
                    ),
                    activeSide = Side.dragons,
                    ruleConfigurationId = "original-game"
                ),
                "d4",
                "e4"
            )
        }

        assertEquals("You may not move so that your piece is captured.", exception.message)
    }

    @Test
    fun `sherwood rules reject multi-square gold moves`() {
        val exception = org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            GameRules.movePiece(
                createSnapshot(
                    board = linkedMapOf(
                        "d5" to Piece.gold,
                        "a7" to Piece.raven
                    ),
                    activeSide = Side.dragons,
                    ruleConfigurationId = "sherwood-rules"
                ),
                "d5",
                "d7"
            )
        }

        assertEquals("The gold may move only one square at a time.", exception.message)
    }

    @Test
    fun `sherwood rules allow one-square gold moves`() {
        val moved = GameRules.movePiece(
            createSnapshot(
                board = linkedMapOf(
                    "d5" to Piece.gold,
                    "a7" to Piece.raven
                ),
                activeSide = Side.dragons,
                ruleConfigurationId = "sherwood-rules"
            ),
            "d5",
            "e5"
        )

        assertFalse(moved.board.containsKey("d5"))
        assertEquals(Piece.gold, moved.board["e5"])
        assertEquals(Side.ravens, moved.activeSide)
        assertEquals(listOf(TurnRecord(type = TurnType.move, from = "d5", to = "e5")), moved.turns)
    }

    @Test
    fun `original game is a draw when the resulting position repeats`() {
        val repeatedKey = "original-game|dragons|b4:raven,g7:gold"
        val moved = GameRules.movePiece(
            createSnapshot(
                board = linkedMapOf(
                    "a4" to Piece.raven,
                    "g7" to Piece.gold
                ),
                activeSide = Side.ravens,
                ruleConfigurationId = "original-game",
                positionKeys = listOf(repeatedKey)
            ),
            "a4",
            "b4"
        )

        assertEquals(Phase.none, moved.phase)
        assertEquals("Draw", moved.turns.last().outcome)
    }

    private fun createFreePlayCaptureSnapshot(): GameSnapshot = createSnapshot(
        board = linkedMapOf(
            "d4" to Piece.gold,
            "a2" to Piece.dragon,
            "b2" to Piece.raven
        ),
        phase = Phase.capture,
        activeSide = Side.dragons,
        pendingMove = TurnRecord(type = TurnType.move, from = "a1", to = "a2")
    )

    private fun createSnapshot(
        board: Map<String, Piece> = emptyMap(),
        phase: Phase = Phase.move,
        activeSide: Side = Side.dragons,
        pendingMove: TurnRecord? = null,
        turns: List<TurnRecord> = emptyList(),
        ruleConfigurationId: String = GameRules.freePlayRuleConfigurationId,
        positionKeys: List<String> = emptyList()
    ): GameSnapshot = GameSnapshot(
        board = LinkedHashMap(board),
        phase = phase,
        activeSide = activeSide,
        pendingMove = pendingMove,
        turns = turns,
        ruleConfigurationId = ruleConfigurationId,
        positionKeys = positionKeys
    )
}
