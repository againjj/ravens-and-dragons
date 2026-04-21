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
    fun `create game returns an active free-play session in move phase`() {
        val service = createService()

        val created = service.createGame(
            CreateGameRequest(
                startingSide = Side.ravens,
                board = mapOf(
                    "a1" to Piece.dragon,
                    "g7" to Piece.raven
                )
            )
        )

        assertEquals(GameLifecycle.active, created.lifecycle)
        assertEquals(Phase.move, created.snapshot.phase)
        assertEquals(Side.ravens, created.snapshot.activeSide)
        assertEquals(Piece.dragon, created.snapshot.board["a1"])
        assertEquals(Piece.raven, created.snapshot.board["g7"])
        assertTrue(created.snapshot.positionKeys.isEmpty())
    }

    @Test
    fun `creating a preset game ignores the supplied draft board`() {
        val service = createService()

        val created = service.createGame(
            CreateGameRequest(
                ruleConfigurationId = "trivial",
                startingSide = Side.ravens,
                boardSize = 9,
                board = mapOf("a1" to Piece.gold)
            )
        )

        assertEquals(GameLifecycle.active, created.lifecycle)
        assertEquals("trivial", created.selectedRuleConfigurationId)
        assertEquals(Phase.move, created.snapshot.phase)
        assertEquals(7, created.selectedBoardSize)
        assertEquals(Side.dragons, created.selectedStartingSide)
        assertEquals(Piece.dragon, created.snapshot.board["a1"])
        assertEquals(Piece.gold, created.snapshot.board["a2"])
    }

    @Test
    fun `broken sse emitter does not prevent a valid command from succeeding for its game`() {
        val service = createService()
        val failingEmitter = object : SseEmitter(0L) {
            override fun send(builder: SseEventBuilder) {
                throw IllegalStateException("stale emitter")
            }
        }
        val recordingEmitter = RecordingEmitter()
        val game = service.createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))

        service.createEmitter(game.id, failingEmitter)
        service.createEmitter(game.id, recordingEmitter)

        val updated = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = 0,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )

        assertEquals(1, updated.version)
        assertEquals(GameLifecycle.active, updated.lifecycle)
        assertEquals(Phase.move, updated.snapshot.phase)
        assertEquals(2, recordingEmitter.eventsSent)
    }

    @Test
    fun `selecting a rule configuration updates an idle session`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val gameId = createIdleGameId(store)

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
        assertEquals(Phase.none, updated.snapshot.phase)
        assertEquals(Piece.dragon, updated.snapshot.board["a1"])
        assertEquals(Piece.gold, updated.snapshot.board["a2"])
    }

    @Test
    fun `starting an idle free-play session enters move phase immediately`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val gameId = createIdleGameId(store)

        service.applyCommand(
            gameId,
            GameCommandRequest(
                expectedVersion = 0,
                type = "select-starting-side",
                side = Side.ravens
            )
        )

        val started = service.applyCommand(gameId, GameCommandRequest(expectedVersion = 1, type = "start-game"))

        assertEquals(GameLifecycle.active, started.lifecycle)
        assertEquals(Phase.move, started.snapshot.phase)
        assertEquals(Side.ravens, started.snapshot.activeSide)
    }

    @Test
    fun `undo with no move history is rejected`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(game.id, GameCommandRequest(expectedVersion = 0, type = "undo"))
        }

        assertEquals("No move is available to undo.", exception.message)
        assertFalse(service.getGame(game.id).canUndo)
    }

    @Test
    fun `with one seat claimed assigning a bot to the claimed seat is rejected but assigning to the open seat succeeds`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))

        val claimed = service.claimSide(game.id, Side.dragons, "player-one")
        val wrongUserException = assertThrows<com.dragonsvsravens.auth.ForbiddenActionException> {
            service.assignBotOpponent(claimed.id, BotRegistry.randomBotId, "player-two")
        }
        val updated = service.assignBotOpponent(claimed.id, BotRegistry.randomBotId, "player-one")

        assertEquals("You must claim exactly one human seat before assigning a bot opponent.", wrongUserException.message)
        assertEquals(BotRegistry.randomBotId, updated.ravensBotId)
        assertNull(updated.dragonsBotId)
    }

    @Test
    fun `supported release two rulesets allow assigning a bot and trigger an immediate bot move`() {
        val service = createService()

        BotRegistry.releaseTwoSupportedRuleConfigurationIds.forEach { ruleConfigurationId ->
            val game = service.createGame(CreateGameRequest(ruleConfigurationId = ruleConfigurationId))
            service.claimSide(game.id, Side.dragons, "player-one")

            val updated = service.assignBotOpponent(game.id, BotRegistry.randomBotId, "player-one")

            assertEquals(ruleConfigurationId, updated.selectedRuleConfigurationId)
            assertEquals(BotRegistry.randomBotId, updated.ravensBotId)
            assertEquals(Side.dragons, updated.snapshot.activeSide)
            assertEquals(1, updated.snapshot.turns.size)
        }
    }

    @Test
    fun `unsupported rulesets reject bot assignment`() {
        val service = createService()

        listOf(GameRules.freePlayRuleConfigurationId, "trivial").forEach { ruleConfigurationId ->
            val game = service.createGame(CreateGameRequest(ruleConfigurationId = ruleConfigurationId))
            service.claimSide(game.id, Side.dragons, "player-one")

            val exception = assertThrows<InvalidCommandException> {
                service.assignBotOpponent(game.id, BotRegistry.randomBotId, "player-one")
            }

            assertEquals("Random is not available for this rule configuration.", exception.message)
        }
    }

    @Test
    fun `with both seats claimed any bot assignment is rejected`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))

        service.claimSide(game.id, Side.dragons, "player-one")
        val fullyClaimed = service.claimSide(game.id, Side.ravens, "player-one")

        val exception = assertThrows<com.dragonsvsravens.auth.ForbiddenActionException> {
            service.assignBotOpponent(fullyClaimed.id, BotRegistry.randomBotId, "player-one")
        }

        assertEquals("A bot opponent can be assigned only to an open seat.", exception.message)
    }

    @Test
    fun `with one seat claimed and the other assigned to a bot a human cannot claim the bot seat`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))

        service.claimSide(game.id, Side.dragons, "player-one")
        val withBot = service.assignBotOpponent(game.id, BotRegistry.randomBotId, "player-one")

        val exception = assertThrows<com.dragonsvsravens.auth.ForbiddenActionException> {
            service.claimSide(withBot.id, Side.ravens, "player-two")
        }

        assertEquals("Ravens is already claimed.", exception.message)
    }

    @Test
    fun `undo is rejected after a bot opponent is assigned`() {
        val service = createService()
        val game = GameSessionFactory.createFreshStoredGame(
            gameId = "bot-game",
            snapshot = GameRules.startGame("sherwood-rules"),
            selectedRuleConfigurationId = "sherwood-rules",
            selectedStartingSide = Side.ravens,
            selectedBoardSize = GameRules.defaultBoardSize,
            ravensBotId = BotRegistry.randomBotId,
            now = fixedClock().instant()
        )
        val store = InMemoryGameStore().also { it.putIfAbsent(game) }
        val serviceWithBotGame = createService(store)

        val exception = assertThrows<InvalidCommandException> {
            serviceWithBotGame.applyCommand(game.session.id, GameCommandRequest(expectedVersion = game.session.version, type = "undo"), "player-one")
        }

        assertEquals("Undo is unavailable in games with a bot opponent.", exception.message)
    }

    @Test
    fun `loading a game touches its last accessed time`() {
        val store = InMemoryGameStore()
        val service = createService(store)
        val game = service.createGame(CreateGameRequest(board = mapOf("a1" to Piece.dragon)))

        val beforeTouch = store.get(game.id)
        val loaded = service.getGame(game.id)
        val afterTouch = store.get(game.id)

        assertNotNull(beforeTouch)
        assertEquals(game.id, loaded.id)
        assertNotNull(afterTouch)
        assertTrue(afterTouch!!.lastAccessedAt >= beforeTouch!!.lastAccessedAt)
    }

    @Test
    fun `remove stale games ignores active emitters`() {
        val store = InMemoryGameStore()
        val oldAccessedAt = Instant.parse("2026-04-01T12:00:00Z")
        val now = Instant.parse("2026-04-08T12:00:00Z")
        val service = createService(store, fixedClock(now), Duration.ofDays(1))
        val game = createStoredIdleGame(store, "stale-game", oldAccessedAt)
        val emitter = service.createEmitter(game.session.id)

        store.touch(game.session.id, oldAccessedAt)
        service.removeStaleGames(now)

        assertNotNull(store.get(game.session.id))
        emitter.complete()
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
        GameCommandService(clock),
        BotRegistry(FixedRandomIndexSource())
    )

    private fun createIdleGameId(store: InMemoryGameStore): String {
        val storedGame = GameSessionFactory.createFreshStoredGame(
            gameId = GameIdGenerator.nextId(),
            snapshot = GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons),
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            now = fixedClock().instant()
        )
        store.putIfAbsent(storedGame)
        return storedGame.session.id
    }

    private fun createStoredIdleGame(
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

    private fun fixedClock(now: Instant = Instant.parse("2026-04-08T12:00:00Z")): Clock =
        Clock.fixed(now, ZoneOffset.UTC)

    private class FixedRandomIndexSource : RandomIndexSource {
        override fun nextInt(bound: Int): Int = 0
    }
}
