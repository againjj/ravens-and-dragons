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

    private fun createService(): GameSessionService = GameSessionService(
        gameStore = InMemoryGameStore(),
        clock = Clock.fixed(Instant.parse("2026-05-23T00:00:00Z"), ZoneOffset.UTC),
        staleGameThreshold = Duration.ofDays(42),
        gameHandlers = listOf(TestGameHandler(objectMapper)),
        playerAccountValidator = object : PlayerAccountValidator {
            override fun requirePlayerAccountsExist(userIds: Set<String>) = Unit
        }
    )

    private class RecordingEmitter : SseEmitter(0L) {
        var eventsSent = 0

        override fun send(builder: SseEventBuilder) {
            eventsSent += 1
        }
    }

    private class TestGameHandler(private val objectMapper: com.fasterxml.jackson.databind.ObjectMapper) : GameHandler {
        override val gameSlug: String = "test-game"

        override fun createGame(gameId: String, request: JsonNode, createdByUserId: String?): GameRecord =
            record(gameId, version = 1)

        override fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord =
            record(current.id, current.version + 1, transientMessage = command.get("type")?.asText() == "transient")

        override fun persistedStateAfterCommand(commandResult: GameRecord): GameRecord {
            if (commandResult.publicState.get("transientMessage") == null) return commandResult
            return commandResult.copy(
                publicState = commandResult.publicState.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().also {
                    it.remove("transientMessage")
                }
            )
        }

        override fun gameView(current: GameRecord, currentUserId: String?): JsonNode =
            publicState(current)

        override fun publicState(current: GameRecord): JsonNode =
            current.publicState

        private fun record(gameId: String, version: Long, transientMessage: Boolean = false): GameRecord {
            val now = Instant.parse("2026-05-23T00:00:00Z")
            val publicState = objectMapper.createObjectNode()
                .put("id", gameId)
                .put("gameSlug", gameSlug)
                .put("version", version)
                .put("lifecycle", "active")
            if (transientMessage) {
                publicState.put("transientMessage", "only this command")
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
}
