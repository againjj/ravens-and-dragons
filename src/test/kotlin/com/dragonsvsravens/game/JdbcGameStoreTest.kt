package com.dragonsvsravens.game

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@SpringBootTest
class JdbcGameStoreTest {
    companion object {
        private val createdAt: Instant = Instant.parse("2026-04-08T10:00:00Z")
    }

    @Autowired
    lateinit var gameStore: JdbcGameStore

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @BeforeEach
    fun resetGames() {
        jdbcTemplate.update("delete from games")
    }

    @Test
    fun `store round trips a game and its undo snapshots`() {
        val originalSnapshot = freePlaySnapshot()
        val undoSnapshot = originalSnapshot.copy(
            board = mapOf("a1" to Piece.dragon),
            phase = Phase.setup
        )
        val storedGame = storedGame(
            gameId = "persisted-game",
            snapshot = originalSnapshot.copy(
                board = mapOf("b2" to Piece.raven),
                phase = Phase.move
            ),
            undoSnapshots = listOf(undoSnapshot),
            version = 4,
            updatedAt = Instant.parse("2026-04-08T10:05:00Z"),
            lastAccessedAt = Instant.parse("2026-04-08T10:06:00Z"),
            lifecycle = GameLifecycle.active
        )

        assertTrue(gameStore.putIfAbsent(storedGame))

        val reloaded = gameStore.get("persisted-game")

        assertNotNull(reloaded)
        assertEquals(storedGame, reloaded)
    }

    @Test
    fun `put enforces optimistic locking`() {
        val initial = freshStoredGame("locked-game")
        assertTrue(gameStore.putIfAbsent(initial))

        val updated = storedGame(
            gameId = "locked-game",
            snapshot = initial.session.snapshot.copy(phase = Phase.setup),
            undoSnapshots = emptyList(),
            version = 1,
            updatedAt = createdAt.plusSeconds(10),
            lastAccessedAt = createdAt.plusSeconds(10),
            lifecycle = GameLifecycle.active,
            createdAt = initial.session.createdAt
        )

        gameStore.put(updated)

        val staleWrite = storedGame(
            gameId = "locked-game",
            snapshot = updated.session.snapshot.copy(phase = Phase.move),
            undoSnapshots = emptyList(),
            version = 1,
            updatedAt = createdAt.plusSeconds(20),
            lastAccessedAt = createdAt.plusSeconds(20),
            lifecycle = GameLifecycle.active,
            createdAt = initial.session.createdAt
        )

        kotlin.test.assertFailsWith<ConcurrentGameUpdateException> {
            gameStore.put(staleWrite)
        }
    }

    @Test
    fun `touch updates last accessed time and remove deletes the row`() {
        val storedGame = freshStoredGame("touch-game")
        assertTrue(gameStore.putIfAbsent(storedGame))

        val touched = gameStore.touch("touch-game", createdAt.plusSeconds(30))

        assertNotNull(touched)
        assertEquals(createdAt.plusSeconds(30), touched!!.lastAccessedAt)
        assertTrue(gameStore.remove("touch-game"))
        assertNull(gameStore.get("touch-game"))
        assertFalse(gameStore.remove("touch-game"))
    }

    @Test
    fun `clear user references releases seats and creator references`() {
        val storedGame = GameSessionFactory.createStoredGame(
            gameId = "owned-game",
            snapshot = freePlaySnapshot(),
            undoSnapshots = emptyList(),
            version = 0,
            createdAt = createdAt,
            updatedAt = createdAt,
            lastAccessedAt = createdAt,
            lifecycle = GameLifecycle.new,
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            dragonsPlayerUserId = "guest-user",
            ravensPlayerUserId = "guest-user",
            createdByUserId = "guest-user"
        )
        assertTrue(gameStore.putIfAbsent(storedGame))

        val updatedGames = gameStore.clearUserReferences("guest-user")
        val reloaded = gameStore.get("owned-game")

        assertEquals(1, updatedGames.size)
        assertNotNull(reloaded)
        assertNull(reloaded!!.session.dragonsPlayerUserId)
        assertNull(reloaded.session.ravensPlayerUserId)
        assertNull(reloaded.session.createdByUserId)
    }

    @Test
    fun `persisted game can be reopened through a fresh service instance`() {
        val clock = Clock.fixed(Instant.parse("2026-04-08T12:00:00Z"), ZoneOffset.UTC)
        val firstService = GameSessionService(gameStore, clock, GameSessionService.defaultStaleGameThreshold)

        val created = firstService.createGame()
        val started = firstService.applyCommand(
            created.id,
            GameCommandRequest(expectedVersion = created.version, type = "start-game")
        )

        val restartedService = GameSessionService(gameStore, clock, GameSessionService.defaultStaleGameThreshold)
        val reloaded = restartedService.getGame(created.id)

        assertEquals(started.id, reloaded.id)
        assertEquals(1, reloaded.version)
        assertEquals(Phase.setup, reloaded.snapshot.phase)
    }

    private fun freePlaySnapshot(): GameSnapshot =
        GameRules.createIdleSnapshot(GameRules.freePlayRuleConfigurationId, Side.dragons)

    private fun freshStoredGame(gameId: String): StoredGame =
        GameSessionFactory.createFreshStoredGame(
            gameId = gameId,
            snapshot = freePlaySnapshot(),
            selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
            selectedStartingSide = Side.dragons,
            selectedBoardSize = GameRules.defaultBoardSize,
            now = createdAt
        )

    private fun storedGame(
        gameId: String,
        snapshot: GameSnapshot,
        undoSnapshots: List<GameSnapshot>,
        version: Long,
        updatedAt: Instant,
        lastAccessedAt: Instant = updatedAt,
        lifecycle: GameLifecycle,
        createdAt: Instant = Companion.createdAt
    ): StoredGame = GameSessionFactory.createStoredGame(
        gameId = gameId,
        snapshot = snapshot,
        undoSnapshots = undoSnapshots,
        version = version,
        createdAt = createdAt,
        updatedAt = updatedAt,
        lastAccessedAt = lastAccessedAt,
        lifecycle = lifecycle,
        selectedRuleConfigurationId = GameRules.freePlayRuleConfigurationId,
        selectedStartingSide = Side.dragons,
        selectedBoardSize = GameRules.defaultBoardSize
    )
}
