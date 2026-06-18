package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class GameSessionServiceTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()

    @AfterEach
    fun clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `game stream broadcasts command update after transaction commit`() {
        val service = createService()
        val created = service.createGame("test-game", objectMapper.createObjectNode())
        val emitter = RecordingEmitter()
        service.createEmitter(created.get("id").asText(), emitter)

        TransactionSynchronizationManager.initSynchronization()
        service.applyCommand(
            created.get("id").asText(),
            objectMapper.createObjectNode().put("expectedVersion", 1).put("type", "move"),
            "player"
        )

        assertEquals(1, emitter.eventsSent)

        TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
            synchronization.afterCommit()
        }

        assertEquals(2, emitter.eventsSent)
    }

    @Test
    fun `command response and stream can include transient state that is not persisted`() {
        val service = createService()
        val created = service.createGame("test-game", objectMapper.createObjectNode())
        val emitter = RecordingEmitter()
        service.createEmitter(created.get("id").asText(), emitter)

        val response = service.applyCommand(
            created.get("id").asText(),
            objectMapper.createObjectNode().put("expectedVersion", 1).put("type", "transient"),
            "player"
        )
        val reloaded = service.getGame(created.get("id").asText())

        assertEquals("only this command", response.get("transientMessage").asText())
        assertEquals(null, reloaded.get("transientMessage"))
        assertEquals(2, emitter.eventsSent)
    }

    @Test
    fun `command response hook receives acting user id`() {
        val service = createService()
        val created = service.createGame("test-game", objectMapper.createObjectNode())

        val response = service.applyCommand(
            created.get("id").asText(),
            objectMapper.createObjectNode().put("expectedVersion", 1).put("type", "viewer"),
            "player-1"
        )

        assertEquals("player-1", response.get("viewerUserId").asText())
    }

    @Test
    fun `command response returns before queued follow-up action runs`() {
        val executor = RecordingExecutor()
        val service = createService(commandFollowUpExecutor = executor)
        val created = service.createGame("test-game", objectMapper.createObjectNode())
        val emitter = RecordingEmitter()
        service.createEmitter(created.get("id").asText(), emitter)

        val response = service.applyCommand(
            created.get("id").asText(),
            objectMapper.createObjectNode().put("expectedVersion", 1).put("type", "follow-up"),
            "player"
        )
        val beforeFollowUp = service.getGame(created.get("id").asText())

        assertEquals(2, response.get("version").asLong())
        assertEquals(2, beforeFollowUp.get("version").asLong())
        assertEquals(1, executor.pendingCount)
        assertEquals(2, emitter.eventsSent)

        executor.runNext()
        val afterFollowUp = service.getGame(created.get("id").asText())

        assertEquals(3, afterFollowUp.get("version").asLong())
        assertEquals("done", afterFollowUp.get("followUp").asText())
        assertEquals(3, emitter.eventsSent)
    }

    @Test
    fun `queued follow-up broadcasts while original transaction synchronization is still active`() {
        val executor = RecordingExecutor()
        val service = createService(commandFollowUpExecutor = executor)
        val created = service.createGame("test-game", objectMapper.createObjectNode())
        val emitter = RecordingEmitter()
        service.createEmitter(created.get("id").asText(), emitter)

        TransactionSynchronizationManager.initSynchronization()
        service.applyCommand(
            created.get("id").asText(),
            objectMapper.createObjectNode().put("expectedVersion", 1).put("type", "follow-up"),
            "player"
        )
        TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
            synchronization.afterCommit()
        }

        assertEquals(2, emitter.eventsSent)

        executor.runNext()

        assertEquals(3, emitter.eventsSent)
    }

    @Test
    fun `queued follow-up does not block a later command on the same game`() {
        val followUpStarted = CountDownLatch(1)
        val releaseFollowUp = CountDownLatch(1)
        val commandCompleted = CountDownLatch(1)
        val service = createService(
            commandFollowUpExecutor = Executor { command ->
                thread(start = true) {
                    command.run()
                }
            },
            onFollowUpStarted = {
                followUpStarted.countDown()
                releaseFollowUp.await(5, TimeUnit.SECONDS)
            }
        )
        val created = service.createGame("test-game", objectMapper.createObjectNode())

        service.applyCommand(
            created.get("id").asText(),
            objectMapper.createObjectNode().put("expectedVersion", 1).put("type", "follow-up"),
            "player"
        )
        assertEquals(true, followUpStarted.await(1, TimeUnit.SECONDS))

        thread(start = true) {
            service.applyCommand(
                created.get("id").asText(),
                objectMapper.createObjectNode().put("expectedVersion", 2).put("type", "move"),
                "player"
            )
            commandCompleted.countDown()
        }

        assertEquals(true, commandCompleted.await(1, TimeUnit.SECONDS))

        releaseFollowUp.countDown()
    }

    private fun createService(
        commandFollowUpExecutor: Executor = Executor { it.run() },
        onFollowUpStarted: (() -> Unit)? = null
    ): GameSessionService = GameSessionService(
        gameStore = InMemoryGameStore(),
        clock = Clock.fixed(Instant.parse("2026-05-23T00:00:00Z"), ZoneOffset.UTC),
        staleGameThreshold = Duration.ofDays(42),
        gameHandlers = listOf(TestGameHandler(objectMapper, onFollowUpStarted)),
        playerAccountValidator = object : PlayerAccountValidator {
            override fun requirePlayerAccountsExist(userIds: Set<String>) = Unit
        },
        commandFollowUpExecutor = commandFollowUpExecutor
    )

    private class RecordingEmitter : SseEmitter(0L) {
        var eventsSent = 0

        override fun send(builder: SseEventBuilder) {
            eventsSent += 1
        }
    }

    private class TestGameHandler(
        private val objectMapper: com.fasterxml.jackson.databind.ObjectMapper,
        private val onFollowUpStarted: (() -> Unit)? = null
    ) : GameHandler {
        override val gameSlug: String = "test-game"

        override fun createGame(gameId: String, request: JsonNode, createdByUserId: String?): GameRecord =
            record(gameId, version = 1)

        override fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord =
            record(
                current.id,
                current.version + 1,
                transientMessage = command.get("type")?.asText() == "transient",
                needsFollowUp = command.get("type")?.asText() == "follow-up",
                viewerResponse = command.get("type")?.asText() == "viewer"
            )

        override fun persistedStateAfterCommand(commandResult: GameRecord): GameRecord {
            if (commandResult.publicState.get("transientMessage") == null) return commandResult
            return commandResult.copy(
                publicState = commandResult.publicState.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().also {
                    it.remove("transientMessage")
                }
            )
        }

        override fun commandResponseState(commandResult: GameRecord, persisted: GameRecord, actingUserId: String?): JsonNode {
            if (commandResult.publicState.get("viewerResponse")?.asBoolean() != true) return publicState(commandResult)
            return commandResult.publicState.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().also {
                it.put("viewerUserId", actingUserId)
            }
        }

        override fun afterCommandCommitted(current: GameRecord, persist: (GameRecord) -> GameRecord): GameRecord {
            if (current.publicState.get("needsFollowUp")?.asBoolean() != true) return current
            onFollowUpStarted?.invoke()
            return persist(record(current.id, current.version + 1, followUp = "done"))
        }

        override fun gameView(current: GameRecord, currentUserId: String?): JsonNode =
            publicState(current)

        override fun publicState(current: GameRecord): JsonNode =
            current.publicState

        private fun record(
            gameId: String,
            version: Long,
            transientMessage: Boolean = false,
            needsFollowUp: Boolean = false,
            viewerResponse: Boolean = false,
            followUp: String? = null
        ): GameRecord {
            val now = Instant.parse("2026-05-23T00:00:00Z")
            val publicState = objectMapper.createObjectNode()
                .put("id", gameId)
                .put("gameSlug", gameSlug)
                .put("version", version)
                .put("lifecycle", "active")
            if (transientMessage) {
                publicState.put("transientMessage", "only this command")
            }
            if (needsFollowUp) {
                publicState.put("needsFollowUp", true)
            }
            if (viewerResponse) {
                publicState.put("viewerResponse", true)
            }
            if (followUp != null) {
                publicState.put("followUp", followUp)
            }
            return GameRecord(
                id = gameId,
                gameSlug = gameSlug,
                version = version,
                createdAt = now,
                updatedAt = now,
                lifecycle = "active",
                publicState = publicState,
                privateState = objectMapper.createObjectNode()
            )
        }
    }

    private class RecordingExecutor : Executor {
        private val commands = ArrayDeque<Runnable>()
        val pendingCount: Int
            get() = commands.size

        override fun execute(command: Runnable) {
            commands += command
        }

        fun runNext() {
            commands.removeFirst().run()
        }
    }
}
