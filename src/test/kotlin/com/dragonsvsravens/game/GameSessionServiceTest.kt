package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class GameSessionServiceTest {

    @Test
    fun `broken sse emitter does not prevent a valid command from succeeding for its game`() {
        val service = createService()
        val failingEmitter = object : SseEmitter(0L) {
            override fun send(builder: SseEventBuilder) {
                throw IllegalStateException("stale emitter")
            }
        }
        val recordingEmitter = RecordingEmitter()
        val game = service.createGame()

        service.createEmitter(game.id, failingEmitter)
        service.createEmitter(game.id, recordingEmitter)

        val updated = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = 0,
                type = "start-game"
            )
        )

        assertEquals(1, updated.version)
        assertEquals(GameLifecycle.active, updated.lifecycle)
        assertEquals(Phase.setup, updated.snapshot.phase)
        assertEquals(2, recordingEmitter.eventsSent)
    }

    @Test
    fun `created games use seven character plus code style ids`() {
        val service = createService()

        val game = service.createGame()

        assertTrue(GameIdGenerator.isGeneratedGameId(game.id))
        assertEquals(GameIdGenerator.gameIdLength, game.id.length)
    }

    @Test
    fun `sse broadcasts are scoped to one game`() {
        val service = createService()
        val firstGame = service.createGame()
        val secondGame = service.createGame()
        val firstEmitter = RecordingEmitter()
        val secondEmitter = RecordingEmitter()

        service.createEmitter(firstGame.id, firstEmitter)
        service.createEmitter(secondGame.id, secondEmitter)

        service.applyCommand(
            firstGame.id,
            GameCommandRequest(
                expectedVersion = 0,
                type = "start-game"
            )
        )

        assertEquals(2, firstEmitter.eventsSent)
        assertEquals(1, secondEmitter.eventsSent)
    }

    @Test
    fun `mutating one game does not affect another game`() {
        val service = createService()
        val firstGame = service.createGame()
        val secondGame = service.createGame()

        val updatedFirstGame = service.applyCommand(
            firstGame.id,
            GameCommandRequest(
                expectedVersion = firstGame.version,
                type = "start-game"
            )
        )
        val unchangedSecondGame = service.getGame(secondGame.id)

        assertEquals(Phase.setup, updatedFirstGame.snapshot.phase)
        assertEquals(GameLifecycle.new, unchangedSecondGame.lifecycle)
        assertEquals(Phase.none, unchangedSecondGame.snapshot.phase)
        assertEquals(0, unchangedSecondGame.version)
    }

    @Test
    fun `version conflicts are scoped to a single game`() {
        val service = createService()
        val firstGame = service.createGame()
        val secondGame = service.createGame()

        service.applyCommand(
            firstGame.id,
            GameCommandRequest(
                expectedVersion = firstGame.version,
                type = "start-game"
            )
        )

        val conflict = assertThrows<VersionConflictException> {
            service.applyCommand(
                firstGame.id,
                GameCommandRequest(
                    expectedVersion = firstGame.version,
                    type = "start-game"
                )
            )
        }

        val updatedSecondGame = service.applyCommand(
            secondGame.id,
            GameCommandRequest(
                expectedVersion = secondGame.version,
                type = "start-game"
            )
        )

        assertEquals(1, conflict.latestGame.version)
        assertEquals(firstGame.id, conflict.latestGame.id)
        assertEquals(Phase.setup, updatedSecondGame.snapshot.phase)
        assertEquals(secondGame.id, updatedSecondGame.id)
    }

    @Test
    fun `selecting a rule configuration updates the shared session in the no game state`() {
        val service = createService()
        val gameId = createGameId(service)

        val updated = service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "trivial"
            )
        )

        assertEquals("trivial", updated.selectedRuleConfigurationId)
        assertEquals(GameLifecycle.new, updated.lifecycle)
        assertEquals("trivial", updated.snapshot.ruleConfigurationId)
        assertEquals(Phase.none, updated.snapshot.phase)
        assertEquals(Piece.dragon, updated.snapshot.board["a1"])
        assertEquals(Piece.gold, updated.snapshot.board["a2"])
        assertEquals(Piece.raven, updated.snapshot.board["a7"])
        assertTrue(updated.snapshot.turns.isEmpty())
    }

    @Test
    fun `selecting a starting side updates free play in the no game state`() {
        val service = createService()
        val gameId = createGameId(service)

        val updated = service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-starting-side",
                side = Side.ravens
            )
        )

        assertEquals(Side.ravens, updated.selectedStartingSide)
        assertEquals(GameLifecycle.new, updated.lifecycle)
        assertEquals(Side.ravens, updated.snapshot.activeSide)
        assertEquals(GameRules.freePlayRuleConfigurationId, updated.snapshot.ruleConfigurationId)
    }

    @Test
    fun `selecting a board size updates free play in the no game state`() {
        val service = createService()
        val gameId = createGameId(service)

        val updated = service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-board-size",
                boardSize = 9
            )
        )

        assertEquals(9, updated.selectedBoardSize)
        assertEquals(GameLifecycle.new, updated.lifecycle)
        assertEquals(9, updated.snapshot.boardSize)
        assertEquals("e5", updated.snapshot.specialSquare)
        assertEquals(GameRules.freePlayRuleConfigurationId, updated.snapshot.ruleConfigurationId)
    }

    @Test
    fun `undo restores the previous snapshot and updates can undo`() {
        val service = createService()
        val gameId = createGameId(service)

        enterMovePhaseWithDragonAtA1(service, gameId)
        val moved = service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 3,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )

        assertTrue(moved.canUndo)
        assertEquals(Phase.move, moved.snapshot.phase)
        assertEquals(Piece.dragon, moved.snapshot.board["a2"])

        val undone = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 4, type = "undo"))

        assertFalse(undone.canUndo)
        assertEquals(Phase.move, undone.snapshot.phase)
        assertEquals(Piece.dragon, undone.snapshot.board["a1"])
        assertFalse(undone.snapshot.board.containsKey("a2"))
    }

    @Test
    fun `end game preserves the board and keeps undo available`() {
        val service = createService()
        val gameId = createGameId(service)

        enterMovePhaseWithDragonAtA1(service, gameId)
        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 3,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )

        val ended = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 4, type = "end-game"))

        assertEquals(GameLifecycle.finished, ended.lifecycle)
        assertEquals(Phase.none, ended.snapshot.phase)
        assertEquals(Piece.dragon, ended.snapshot.board["a2"])
        assertEquals(TurnType.gameOver, ended.snapshot.turns.last().type)
        assertTrue(ended.canUndo)
    }

    @Test
    fun `undo after end game restores the previous playable snapshot`() {
        val service = createService()
        val gameId = createGameId(service)

        enterMovePhaseWithDragonAtA1(service, gameId)
        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 3,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )
        service.applyCommand(gameId, GameCommandRequest(expectedVersion = 4, type = "end-game"))

        val undone = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 5, type = "undo"))

        assertEquals(GameLifecycle.active, undone.lifecycle)
        assertEquals(Phase.move, undone.snapshot.phase)
        assertEquals(Piece.dragon, undone.snapshot.board["a2"])
        assertEquals(TurnType.move, undone.snapshot.turns.last().type)
        assertFalse(undone.snapshot.turns.any { it.type == TurnType.gameOver })
        assertTrue(undone.canUndo)
    }

    @Test
    fun `finished games cannot be restarted on the same game id`() {
        val service = createService()
        val gameId = createGameId(service)

        enterMovePhaseWithDragonAtA1(service, gameId)
        service.applyCommand(gameId, GameCommandRequest(expectedVersion = 3, type = "end-game"))

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(gameId, GameCommandRequest(expectedVersion = 4, type = "start-game"))
        }

        assertEquals("Game $gameId is finished. Create a new game to play again.", exception.message)
    }

    @Test
    fun `finished games cannot be reconfigured on the same game id`() {
        val service = createService()
        val gameId = createGameId(service)

        enterMovePhaseWithDragonAtA1(service, gameId)
        service.applyCommand(gameId, GameCommandRequest(expectedVersion = 3, type = "end-game"))

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(
                gameId,
                GameCommandRequest(
                    expectedVersion = 4,
                    type = "select-rule-configuration",
                    ruleConfigurationId = "trivial"
                )
            )
        }

        assertEquals("Game $gameId is finished. Create a new game to play again.", exception.message)
    }

    @Test
    fun `starting original game uses its preset board and opening side`() {
        val service = createService()
        val gameId = createGameId(service)

        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "original-game"
            )
        )

        val started = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 1, type = "start-game"))

        assertEquals("original-game", started.snapshot.ruleConfigurationId)
        assertEquals(Phase.move, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)
        assertEquals(Piece.gold, started.snapshot.board["d4"])
        assertEquals(Piece.dragon, started.snapshot.board["d5"])
        assertEquals(Piece.raven, started.snapshot.board["d7"])
    }

    @Test
    fun `starting sherwood rules uses the original setup and opening side`() {
        val service = createService()
        val gameId = createGameId(service)

        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "sherwood-rules"
            )
        )

        val started = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 1, type = "start-game"))

        assertEquals("sherwood-rules", started.snapshot.ruleConfigurationId)
        assertEquals(Phase.move, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)
        assertEquals(Piece.gold, started.snapshot.board["d4"])
        assertEquals(Piece.dragon, started.snapshot.board["d5"])
        assertEquals(Piece.raven, started.snapshot.board["d7"])
    }

    @Test
    fun `starting sherwood x 9 uses the shifted setup and opening side`() {
        val service = createService()
        val gameId = createGameId(service)

        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-rule-configuration",
                ruleConfigurationId = "sherwood-x-9"
            )
        )

        val started = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 1, type = "start-game"))

        assertEquals("sherwood-x-9", started.snapshot.ruleConfigurationId)
        assertEquals(Phase.move, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)
        assertEquals(9, started.snapshot.boardSize)
        assertEquals("e5", started.snapshot.specialSquare)
        assertEquals(Piece.gold, started.snapshot.board["e5"])
        assertEquals(Piece.dragon, started.snapshot.board["e6"])
        assertEquals(Piece.raven, started.snapshot.board["e8"])
    }

    @Test
    fun `starting free play honors the selected starting side through setup`() {
        val service = createService()
        val gameId = createGameId(service)

        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-starting-side",
                side = Side.ravens
            )
        )

        val started = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 1, type = "start-game"))
        assertEquals(Phase.setup, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)

        val endedSetup = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 2, type = "end-setup"))
        assertEquals(Phase.move, endedSetup.snapshot.phase)
        assertEquals(Side.ravens, endedSetup.snapshot.activeSide)
    }

    @Test
    fun `undo with no move history is rejected`() {
        val service = createService()
        val gameId = createGameId(service)

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(gameId, GameCommandRequest(expectedVersion = 0, type = "undo"))
        }

        assertEquals("No move is available to undo.", exception.message)
        assertFalse(service.getGame(gameId).canUndo)
    }

    @Test
    fun `loading a game touches its last accessed time`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val game = service.createGame()
        val oldAccessedAt = Instant.parse("2026-04-08T00:00:00Z")

        store.touch(game.id, oldAccessedAt)

        service.getGame(game.id)

        val storedGame = store.get(game.id)
        assertNotNull(storedGame)
        assertTrue(storedGame!!.lastAccessedAt.isAfter(oldAccessedAt))
    }

    @Test
    fun `game older than the stale threshold with no viewers is removed`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val oldAccessedAt = Instant.parse("2026-04-08T00:00:00Z")
        val now = oldAccessedAt.plus(GameSessionService.defaultStaleGameThreshold).plusSeconds(1)
        val game = createStoredGame(
            store = store,
            gameId = "stale-game",
            lastAccessedAt = oldAccessedAt
        )

        service.removeStaleGames(now)

        assertNull(store.get(game.session.id))
    }

    @Test
    fun `recently loaded game is not removed`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val oldAccessedAt = Instant.parse("2026-04-08T00:00:00Z")
        val now = oldAccessedAt.plus(GameSessionService.defaultStaleGameThreshold).plusSeconds(1)
        val game = createStoredGame(
            store = store,
            gameId = "recent-game",
            lastAccessedAt = oldAccessedAt
        )

        service.getGame(game.session.id)
        service.removeStaleGames(now)

        assertNotNull(store.get(game.session.id))
    }

    @Test
    fun `game with active emitter is not removed`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val oldAccessedAt = Instant.parse("2026-04-08T00:00:00Z")
        val now = oldAccessedAt.plus(GameSessionService.defaultStaleGameThreshold).plusSeconds(1)
        val game = createStoredGame(
            store = store,
            gameId = "watched-game",
            lastAccessedAt = oldAccessedAt
        )

        service.createEmitter(game.session.id, RecordingEmitter())
        store.touch(game.session.id, oldAccessedAt)

        service.removeStaleGames(now)

        assertNotNull(store.get(game.session.id))
    }

    @Test
    fun `game touched on emitter disconnect is not removed immediately after viewer leaves`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val oldAccessedAt = Instant.parse("2026-04-08T00:00:00Z")
        val now = oldAccessedAt.plus(GameSessionService.defaultStaleGameThreshold).plusSeconds(1)
        val game = createStoredGame(
            store = store,
            gameId = "disconnect-game",
            lastAccessedAt = oldAccessedAt
        )
        val emitter = service.createEmitter(game.session.id)

        store.touch(game.session.id, oldAccessedAt)
        emitter.complete()
        service.removeStaleGames(now)

        assertNotNull(store.get(game.session.id))
    }

    private class RecordingEmitter : SseEmitter(0L) {
        var eventsSent: Int = 0

        override fun send(builder: SseEventBuilder) {
            eventsSent += 1
        }
    }

    private fun createService(
        store: InMemoryGameStore = InMemoryGameStore(),
        clock: Clock = fixedClock(),
        staleGameThreshold: Duration = GameSessionService.defaultStaleGameThreshold
    ): GameSessionService = GameSessionService(
        store,
        clock,
        staleGameThreshold,
        GameCommandService(clock)
    )

    private fun createGameId(service: GameSessionService): String = service.createGame().id

    private fun enterMovePhaseWithDragonAtA1(service: GameSessionService, gameId: String) {
        service.applyCommand(gameId, GameCommandRequest(expectedVersion = 0, type = "start-game"))
        service.applyCommand(gameId, GameCommandRequest(expectedVersion = 1, type = "cycle-setup", square = "a1"))
        service.applyCommand(gameId, GameCommandRequest(expectedVersion = 2, type = "end-setup"))
    }

    private fun fixedClock(now: Instant = Instant.parse("2026-04-08T12:00:00Z")): Clock =
        Clock.fixed(now, ZoneOffset.UTC)

    private fun createStoredGame(
        store: InMemoryGameStore,
        gameId: String,
        lastAccessedAt: Instant
    ): StoredGame {
        val storedGame = GameSessionFactory.createFreshStoredGame(
            gameId = gameId,
            snapshot = GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons),
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            now = lastAccessedAt
        )
        store.put(storedGame)
        return storedGame
    }
}
