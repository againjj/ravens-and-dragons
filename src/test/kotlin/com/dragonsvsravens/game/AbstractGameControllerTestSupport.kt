package com.dragonsvsravens.game

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.assertAll
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant

abstract class AbstractGameControllerTestSupport {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var gameStore: InMemoryGameStore

    @BeforeEach
    fun resetGames() {
        gameStore.clear()
    }

    protected fun seedGame(
        gameId: String = "test-game",
        snapshot: GameSnapshot = GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons),
        selectedRuleConfigurationId: String = snapshot.ruleConfigurationId,
        selectedStartingSide: Side = Side.dragons,
        version: Long = 0,
        createdAt: Instant = Instant.now(),
        updatedAt: Instant = createdAt,
        lastAccessedAt: Instant = updatedAt
    ): GameSession {
        val storedGame = GameSessionFactory.createStoredGame(
            gameId = gameId,
            snapshot = snapshot,
            undoSnapshots = emptyList(),
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lastAccessedAt = lastAccessedAt,
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide
        )
        gameStore.put(storedGame)
        return storedGame.session
    }

    protected fun command(
        expectedVersion: Long,
        type: String,
        square: String? = null,
        origin: String? = null,
        destination: String? = null,
        ruleConfigurationId: String? = null,
        side: Side? = null
    ): GameCommandRequest = GameCommandRequest(
        expectedVersion = expectedVersion,
        type = type,
        square = square,
        origin = origin,
        destination = destination,
        ruleConfigurationId = ruleConfigurationId,
        side = side
    )

    protected fun createGame(request: CreateGameRequest = CreateGameRequest()): GameSession =
        objectMapper.readValue(
            mockMvc.post("/api/games") {
                contentType = MediaType.APPLICATION_JSON
                content = objectMapper.writeValueAsString(request)
            }
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            CreateGameResponse::class.java
        ).game

    protected fun getGame(gameId: String): GameSession =
        objectMapper.readValue(
            mockMvc.get("/api/games/$gameId")
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

    protected fun executeGameCommand(gameId: String, command: GameCommandRequest): GameSession =
        objectMapper.readValue(
            postGameCommand(gameId, command)
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

    protected fun postGameCommand(gameId: String, command: GameCommandRequest) =
        mockMvc.post("/api/games/$gameId/commands") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command)
        }

    protected fun currentGame(gameId: String): GameSession = getGame(gameId)

    protected fun currentVersion(gameId: String): Long = currentGame(gameId).version

    protected fun startSetup(gameId: String): GameSession =
        executeGameCommand(gameId, command(currentVersion(gameId), "start-game"))

    protected fun endSetup(gameId: String): GameSession =
        executeGameCommand(gameId, command(currentVersion(gameId), "end-setup"))

    protected fun setupDragonAt(gameId: String, square: String) {
        executeGameCommand(gameId, command(currentVersion(gameId), "cycle-setup", square = square))
    }

    protected fun setupRavenAt(gameId: String, square: String) {
        setupDragonAt(gameId, square)
        executeGameCommand(gameId, command(currentVersion(gameId), "cycle-setup", square = square))
    }

    protected fun enterCapturePhase(gameId: String) {
        startSetup(gameId)
        setupDragonAt(gameId, "a1")
        setupRavenAt(gameId, "b2")
        endSetup(gameId)
        executeGameCommand(
            gameId,
            command(currentVersion(gameId), "move-piece", origin = "a1", destination = "a2")
        )
    }

    protected fun assertGameUnchanged(gameId: String, expected: GameSession) {
        val after = getGame(gameId)
        assertAll(
            { assertEquals(expected.version, after.version) },
            { assertEquals(expected.snapshot, after.snapshot) }
        )
    }

    protected fun assertRejectedCommandLeavesGameUnchanged(
        gameId: String,
        before: GameSession,
        command: GameCommandRequest,
        message: String
    ) {
        postGameCommand(gameId, command).andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(message) }
        }

        assertGameUnchanged(gameId, before)
    }
}
