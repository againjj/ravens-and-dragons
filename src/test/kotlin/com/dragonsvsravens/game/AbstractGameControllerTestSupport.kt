package com.dragonsvsravens.game

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

abstract class AbstractGameControllerTestSupport {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var gameStore: InMemoryGameStore

    @BeforeEach
    fun resetDefaultGame() {
        seedDefaultGame()
    }

    protected fun seedDefaultGame(
        snapshot: GameSnapshot = GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons),
        selectedRuleConfigurationId: String = snapshot.ruleConfigurationId,
        selectedStartingSide: Side = Side.dragons
    ) {
        gameStore.clear()
        gameStore.put(
            GameSessionFactory.createFreshStoredGame(
                gameId = GameSessionService.defaultGameId,
                snapshot = snapshot,
                selectedRuleConfigurationId = selectedRuleConfigurationId,
                selectedStartingSide = selectedStartingSide
            )
        )
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

    protected fun getDefaultGame(): GameSession =
        objectMapper.readValue(
            mockMvc.get("/api/game")
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

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

    protected fun executeDefaultCommand(command: GameCommandRequest): GameSession =
        objectMapper.readValue(
            postDefaultCommand(command)
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

    protected fun postDefaultCommand(command: GameCommandRequest) =
        mockMvc.post("/api/game/commands") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command)
        }

    protected fun postGameCommand(gameId: String, command: GameCommandRequest) =
        mockMvc.post("/api/games/$gameId/commands") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command)
        }
}
