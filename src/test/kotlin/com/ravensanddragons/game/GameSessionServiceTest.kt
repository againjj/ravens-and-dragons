package com.ravensanddragons.game

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
    fun `undo restores the latest move after multiple turns and keeps earlier undo history`() {
        val service = createService()
        val game = service.createGame(
            CreateGameRequest(
                board = mapOf(
                    "a1" to Piece.dragon,
                    "g7" to Piece.raven
                )
            )
        )

        val afterFirstMove = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = game.version,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )
        val afterFirstTurn = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = afterFirstMove.version,
                type = "skip-capture"
            )
        )
        val afterSecondMove = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = afterFirstTurn.version,
                type = "move-piece",
                origin = "g7",
                destination = "g6"
            )
        )

        assertTrue(afterSecondMove.canUndo)
        assertEquals(Side.ravens, afterSecondMove.undoOwnerSide)

        val undone = service.applyCommand(
            afterSecondMove.id,
            GameCommandRequest(expectedVersion = afterSecondMove.version, type = "undo")
        )

        assertEquals(afterFirstTurn.snapshot, undone.snapshot)
        assertTrue(undone.canUndo)
        assertEquals(Side.dragons, undone.undoOwnerSide)
    }

    @Test
    fun `multiple undos in a row step backward through move history until it is exhausted`() {
        val service = createService()
        val game = service.createGame(
            CreateGameRequest(
                board = mapOf(
                    "a1" to Piece.dragon,
                    "g7" to Piece.raven
                )
            )
        )

        val afterFirstMove = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = game.version,
                type = "move-piece",
                origin = "a1",
                destination = "a2"
            )
        )
        val afterFirstTurn = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = afterFirstMove.version,
                type = "skip-capture"
            )
        )
        val afterSecondMove = service.applyCommand(
            game.id,
            GameCommandRequest(
                expectedVersion = afterFirstTurn.version,
                type = "move-piece",
                origin = "g7",
                destination = "g6"
            )
        )
        val undone = service.applyCommand(
            afterSecondMove.id,
            GameCommandRequest(expectedVersion = afterSecondMove.version, type = "undo")
        )
        val undoneAgain = service.applyCommand(
            undone.id,
            GameCommandRequest(expectedVersion = undone.version, type = "undo")
        )

        val exception = assertThrows<InvalidCommandException> {
            service.applyCommand(
                undoneAgain.id,
                GameCommandRequest(expectedVersion = undoneAgain.version, type = "undo")
            )
        }

        assertEquals("No move is available to undo.", exception.message)
        assertEquals(afterFirstTurn.snapshot, undone.snapshot)
        assertEquals(game.snapshot, undoneAgain.snapshot)
        assertFalse(undoneAgain.canUndo)
    }

    @Test
    fun `with one seat claimed assigning a bot to the claimed seat is rejected but assigning to the open seat succeeds`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))

        val claimed = service.claimSide(game.id, Side.dragons, "player-one")
        val wrongUserException = assertThrows<com.ravensanddragons.auth.ForbiddenActionException> {
            service.assignBotOpponent(claimed.id, BotRegistry.randomBotId, "player-two")
        }
        val updated = service.assignBotOpponent(claimed.id, BotRegistry.randomBotId, "player-one")

        assertEquals("You must claim exactly one human seat before assigning a bot opponent.", wrongUserException.message)
        assertEquals(BotRegistry.randomBotId, updated.ravensBotId)
        assertNull(updated.dragonsBotId)
    }

    @Test
    fun `supported release two rulesets expose every selectable bot`() {
        val registry = BotRegistry(object : RandomIndexSource {
            override fun nextInt(bound: Int): Int = 0
        })

        BotRegistry.releaseTwoSupportedRuleConfigurationIds.forEach { ruleConfigurationId ->
            assertEquals(
                listOf(
                    BotRegistry.randomBotId,
                    BotRegistry.simpleBotId,
                    BotRegistry.minimaxBotId,
                    BotRegistry.deepMinimaxBotId
                ),
                registry.availableBotsFor(ruleConfigurationId).map(BotSummary::id)
            )
        }
    }

    @Test
    fun `assigning each selectable bot on a representative supported ruleset triggers an immediate bot move`() {
        val service = createService()
        val ruleConfigurationId = "sherwood-rules"

        listOf(
            BotRegistry.randomBotId,
            BotRegistry.simpleBotId,
            BotRegistry.minimaxBotId,
            BotRegistry.deepMinimaxBotId
        ).forEach { botId ->
            val game = service.createGame(CreateGameRequest(ruleConfigurationId = ruleConfigurationId))
            service.claimSide(game.id, Side.dragons, "player-one")

            val updated = service.assignBotOpponent(game.id, botId, "player-one")

            assertEquals(ruleConfigurationId, updated.selectedRuleConfigurationId)
            assertEquals(botId, updated.ravensBotId)
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

            assertEquals("Randall is not available for this rule configuration.", exception.message)
        }
    }

    @Test
    fun `with both seats claimed any bot assignment is rejected`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))

        service.claimSide(game.id, Side.dragons, "player-one")
        val fullyClaimed = service.claimSide(game.id, Side.ravens, "player-one")

        val exception = assertThrows<com.ravensanddragons.auth.ForbiddenActionException> {
            service.assignBotOpponent(fullyClaimed.id, BotRegistry.randomBotId, "player-one")
        }

        assertEquals("A bot opponent can be assigned only to an open seat.", exception.message)
    }

    @Test
    fun `with one seat claimed and the other assigned to a bot a human cannot claim the bot seat`() {
        val service = createService()
        val game = service.createGame(CreateGameRequest(ruleConfigurationId = "sherwood-rules"))

        service.claimSide(game.id, Side.ravens, "player-one")
        val withBot = service.assignBotOpponent(game.id, BotRegistry.randomBotId, "player-one")

        val exception = assertThrows<com.ravensanddragons.auth.ForbiddenActionException> {
            service.claimSide(withBot.id, Side.ravens, "player-two")
        }

        assertEquals("Ravens is already claimed.", exception.message)
    }

    @Test
    fun `bot games advertise no undo until a full human plus bot exchange exists`() {
        val service = createService()
        val game = service.createGame(
            CreateGameRequest(
                ruleConfigurationId = "sherwood-rules",
                startingSide = Side.dragons
            )
        )

        service.claimSide(game.id, Side.ravens, "player-one")
        val withBot = service.assignBotOpponent(game.id, BotRegistry.randomBotId, "player-one")

        assertFalse(withBot.canUndo)
        assertNull(withBot.undoOwnerSide)
    }

    @Test
    fun `grouped undo restores the pre human turn snapshot in bot games without replaying the bot turn`() {
        val service = createService()
        val game = service.createGame(
            CreateGameRequest(
                ruleConfigurationId = "sherwood-rules",
                startingSide = Side.dragons
            )
        )

        service.claimSide(game.id, Side.ravens, "player-one")
        val withBot = service.assignBotOpponent(game.id, BotRegistry.randomBotId, "player-one")
        val humanMove = GameRules.getLegalMoves(withBot.snapshot).first()
        val afterHumanMove = service.applyCommand(
            withBot.id,
            GameCommandRequest(
                expectedVersion = withBot.version,
                type = "move-piece",
                origin = humanMove.origin,
                destination = humanMove.destination
            ),
            "player-one"
        )

        assertTrue(afterHumanMove.canUndo)
        assertEquals(Side.ravens, afterHumanMove.undoOwnerSide)

        val undone = service.applyCommand(
            afterHumanMove.id,
            GameCommandRequest(expectedVersion = afterHumanMove.version, type = "undo"),
            "player-one"
        )

        assertFalse(undone.canUndo)
        assertEquals(0, undone.snapshot.turns.size)
        assertEquals(withBot.snapshot.board, undone.snapshot.board)
    }

    @Test
    fun `bot games allow undo after a human move ends the game before any bot reply`() {
        val service = createService()
        val finishedSnapshot = GameRules.endGame(
            GameRules.startGame(
                initialBoard = mapOf(
                    "a1" to Piece.dragon,
                    "b1" to Piece.raven
                )
            ),
            "Dragons win"
        )
        val storedGame = GameSessionFactory.createStoredGame(
            gameId = "finished-human-last-bot-game",
            snapshot = finishedSnapshot,
            undoEntries = listOf(
                UndoEntry(
                    state = GameRules.startGame(
                        initialBoard = mapOf(
                            "a1" to Piece.dragon,
                            "b1" to Piece.raven
                        )
                    ).toUndoSnapshotState(),
                    ownerSide = Side.dragons,
                    kind = UndoEntryKind.humanOnly
                )
            ),
            version = 1,
            createdAt = fixedClock().instant(),
            updatedAt = fixedClock().instant(),
            lastAccessedAt = fixedClock().instant(),
            lifecycle = GameLifecycle.finished,
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            dragonsPlayerUserId = "player-one",
            ravensBotId = BotRegistry.randomBotId
        )
        val store = InMemoryGameStore().also { it.putIfAbsent(storedGame) }
        val serviceWithStoredGame = createService(store)

        val loaded = serviceWithStoredGame.getGame(storedGame.session.id)

        assertTrue(loaded.canUndo)
        assertEquals(Side.dragons, loaded.undoOwnerSide)
    }

    @Test
    fun `bot games allow undo after the bot makes the last move and wins the game`() {
        val service = createService()
        val preExchangeSnapshot = GameRules.startGame(
            initialBoard = mapOf(
                "a1" to Piece.dragon,
                "b1" to Piece.raven
            )
        )
        val finishedSnapshot = GameRules.endGame(
            preExchangeSnapshot.copy(
                board = mapOf("b2" to Piece.raven),
                activeSide = Side.dragons,
                turns = listOf(
                    TurnRecord(type = TurnType.move, from = "a1", to = "a2"),
                    TurnRecord(type = TurnType.move, from = "b1", to = "b2")
                )
            ),
            "Ravens win"
        )
        val storedGame = GameSessionFactory.createStoredGame(
            gameId = "finished-bot-last-game",
            snapshot = finishedSnapshot,
            undoEntries = listOf(
                UndoEntry(
                    state = preExchangeSnapshot.toUndoSnapshotState(),
                    ownerSide = Side.dragons,
                    kind = UndoEntryKind.humanPlusBot
                )
            ),
            version = 2,
            createdAt = fixedClock().instant(),
            updatedAt = fixedClock().instant(),
            lastAccessedAt = fixedClock().instant(),
            lifecycle = GameLifecycle.finished,
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            dragonsPlayerUserId = "player-one",
            ravensBotId = BotRegistry.randomBotId
        )
        val store = InMemoryGameStore().also { it.putIfAbsent(storedGame) }
        val serviceWithStoredGame = createService(store)

        val loaded = serviceWithStoredGame.getGame(storedGame.session.id)

        assertTrue(loaded.canUndo)
        assertEquals(Side.dragons, loaded.undoOwnerSide)
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
        BotRegistry(FixedRandomIndexSource()),
        BotTurnRunner(
            GameCommandService(clock),
            BotRegistry(FixedRandomIndexSource())
        )
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

    private fun GameSnapshot.toUndoSnapshotState(): UndoSnapshotState =
        UndoSnapshotState(
            board = board,
            phase = phase,
            activeSide = activeSide,
            pendingMove = pendingMove,
            turns = turns,
            positionKeys = positionKeys
        )

    private class FixedRandomIndexSource : RandomIndexSource {
        override fun nextInt(bound: Int): Int = 0
    }
}
