package com.dragonsvsravens.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.dragonsvsravens.auth.AuthSessionSupport
import com.dragonsvsravens.auth.AuthType
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.assertAll
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.time.Instant

abstract class AbstractGameControllerTestSupport {
    companion object {
        const val defaultTestUserId = "test-user"
        const val alternateTestUserId = "other-user"
    }

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var gameStore: GameStore

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @BeforeEach
    fun resetGames() {
        jdbcTemplate.update("delete from user_identities")
        jdbcTemplate.update("delete from users")
        jdbcTemplate.update("delete from games")
        seedUser(defaultTestUserId, "Test Player")
        seedUser(alternateTestUserId, "Other Player")
    }

    protected fun seedGame(
        gameId: String = "test-game",
        snapshot: GameSnapshot = GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons),
        selectedRuleConfigurationId: String = snapshot.ruleConfigurationId,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = snapshot.boardSize,
        lifecycle: GameLifecycle = when {
            snapshot.turns.lastOrNull()?.type == TurnType.gameOver -> GameLifecycle.finished
            snapshot.phase == Phase.none -> GameLifecycle.new
            else -> GameLifecycle.active
        },
        version: Long = 0,
        createdAt: Instant = Instant.now(),
        updatedAt: Instant = createdAt,
        lastAccessedAt: Instant = updatedAt,
        dragonsPlayerUserId: String? = defaultTestUserId,
        ravensPlayerUserId: String? = defaultTestUserId,
        createdByUserId: String? = defaultTestUserId
    ): GameSession {
        val storedGame = GameSessionFactory.createStoredGame(
            gameId = gameId,
            snapshot = snapshot,
            undoSnapshots = emptyList(),
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lastAccessedAt = lastAccessedAt,
            lifecycle = lifecycle,
            selectedRuleConfigurationId = selectedRuleConfigurationId,
            selectedStartingSide = selectedStartingSide,
            selectedBoardSize = selectedBoardSize,
            dragonsPlayerUserId = dragonsPlayerUserId,
            ravensPlayerUserId = ravensPlayerUserId,
            createdByUserId = createdByUserId
        )
        assertTrue(gameStore.putIfAbsent(storedGame))
        return storedGame.session
    }

    protected fun seedUser(
        userId: String,
        displayName: String,
        authType: AuthType = AuthType.local,
        username: String = userId
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, display_name, username, email, password_hash, auth_type, created_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            userId,
            displayName,
            username,
            null,
            "\$2a\$10\$xQ4h0N4Qn2dLZ0s8AjtS2OgKzdON3NofM8JrIoYNewc19hXtOD87e",
            authType.name,
            java.sql.Timestamp.from(Instant.now())
        )
    }

    protected fun command(
        expectedVersion: Long,
        type: String,
        square: String? = null,
        origin: String? = null,
        destination: String? = null,
        ruleConfigurationId: String? = null,
        side: Side? = null,
        boardSize: Int? = null
    ): GameCommandRequest = GameCommandRequest(
        expectedVersion = expectedVersion,
        type = type,
        square = square,
        origin = origin,
        destination = destination,
        ruleConfigurationId = ruleConfigurationId,
        side = side,
        boardSize = boardSize
    )

    protected fun createGame(request: CreateGameRequest = CreateGameRequest()): GameSession =
        objectMapper.readValue(
            mockMvc.post("/api/games") {
                with(authenticated("create-game", defaultTestUserId))
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
        ).game.also { assignSides(it.id, defaultTestUserId, defaultTestUserId) }

    protected fun getGame(gameId: String, userId: String = currentActorFor(gameId)): GameSession =
        objectMapper.readValue(
            mockMvc.get("/api/games/$gameId") {
                with(authenticated(gameId, userId))
            }
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

    protected fun anonymousGetGame(gameId: String) =
        mockMvc.get("/api/games/$gameId")

    protected fun executeGameCommand(gameId: String, command: GameCommandRequest): GameSession =
        objectMapper.readValue(
            authenticatedPostGameCommand(gameId, command)
                .andExpect {
                    status { isOk() }
                }
                .andReturn()
                .response
                .contentAsString,
            GameSession::class.java
        )

    protected fun postGameCommand(gameId: String, command: GameCommandRequest) =
        authenticatedPostGameCommand(gameId, command)

    protected fun anonymousPostGameCommand(gameId: String, command: GameCommandRequest) =
        mockMvc.post("/api/games/$gameId/commands") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command)
        }

    protected fun authenticated(gameId: String, userId: String = currentActorFor(gameId)): RequestPostProcessor =
        RequestPostProcessor { request ->
            val processed = user(userId).roles("USER").postProcessRequest(request)
            val session = processed.getSession(true)!!
            session.setAttribute(AuthSessionSupport.currentUserIdSessionAttribute, userId)
            session.setAttribute(AuthSessionSupport.currentAuthTypeSessionAttribute, AuthType.local.name)
            processed
        }

    protected fun authenticatedPostGameCommand(
        gameId: String,
        command: GameCommandRequest,
        userId: String = currentActorFor(gameId, command.type)
    ) =
        mockMvc.post("/api/games/$gameId/commands") {
            with(authenticated(gameId, userId))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(command)
        }

    protected fun claimSide(gameId: String, side: Side, userId: String = defaultTestUserId) =
        mockMvc.post("/api/games/$gameId/claim-side") {
            with(authenticated(gameId, userId))
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(ClaimSideRequest(side))
        }

    protected fun assignSides(gameId: String, dragonsUserId: String?, ravensUserId: String?) {
        jdbcTemplate.update(
            """
            update games
            set dragons_player_user_id = ?,
                ravens_player_user_id = ?
            where id = ?
            """.trimIndent(),
            dragonsUserId,
            ravensUserId,
            gameId
        )
    }

    protected fun currentActorFor(gameId: String, commandType: String? = null): String {
        val current = gameStore.get(gameId)?.session ?: return defaultTestUserId
        if (commandType == "undo") {
            return when (current.undoOwnerSide) {
                Side.dragons -> current.dragonsPlayerUserId
                Side.ravens -> current.ravensPlayerUserId
                null -> current.dragonsPlayerUserId ?: current.ravensPlayerUserId
            } ?: defaultTestUserId
        }
        return when (current.snapshot.phase) {
            Phase.capture,
            Phase.move,
            Phase.setup -> when (current.snapshot.activeSide) {
                Side.dragons -> current.dragonsPlayerUserId
                Side.ravens -> current.ravensPlayerUserId
            }
            Phase.none -> current.dragonsPlayerUserId ?: current.ravensPlayerUserId
        } ?: defaultTestUserId
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
        authenticatedPostGameCommand(gameId, command).andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value(message) }
        }

        assertGameUnchanged(gameId, before)
    }
}
