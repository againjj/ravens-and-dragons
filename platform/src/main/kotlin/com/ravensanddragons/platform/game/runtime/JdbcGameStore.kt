package com.ravensanddragons.platform.game.runtime

import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Component
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant

@Component
class JdbcGameStore(
    private val jdbcTemplate: JdbcTemplate,
    private val gameJsonCodec: PlatformGameJsonCodec
) : GameStore {
    companion object {
        private val selectStoredGameColumns = """
            select id, game_slug, version, created_at, updated_at, last_accessed_at, lifecycle,
                   created_by_user_id, public_state_json, private_state_json
            from games
        """.trimIndent()
    }

    override fun get(gameId: String): GameRecord? =
        jdbcTemplate.query(
            """
            $selectStoredGameColumns
            where id = ?
            """.trimIndent(),
            storedGameRowMapper,
            gameId
        ).firstOrNull()

    override fun put(game: GameRecord) {
        val updatedRows = jdbcTemplate.update(
            """
            update games
            set version = ?,
                updated_at = ?,
                last_accessed_at = ?,
                lifecycle = ?,
                game_slug = ?,
                created_by_user_id = ?,
                public_state_json = ?,
                private_state_json = ?
            where id = ?
              and version = ?
            """.trimIndent(),
            game.version,
            Timestamp.from(game.updatedAt),
            Timestamp.from(game.lastAccessedAt),
            game.lifecycle,
            game.gameSlug,
            game.createdByUserId,
            gameJsonCodec.writeJson(game.publicState),
            gameJsonCodec.writeJson(game.privateState),
            game.id,
            game.version - 1
        )
        if (updatedRows == 0) {
            throw ConcurrentGameUpdateException(game.id)
        }
    }

    override fun putIfAbsent(game: GameRecord): Boolean =
        try {
            jdbcTemplate.update(
                """
                insert into games (
                    id,
                    version,
                    created_at,
                    updated_at,
                    last_accessed_at,
                    lifecycle,
                    game_slug,
                    created_by_user_id,
                    public_state_json,
                    private_state_json
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                game.id,
                game.version,
                Timestamp.from(game.createdAt),
                Timestamp.from(game.updatedAt),
                Timestamp.from(game.lastAccessedAt),
                game.lifecycle,
                game.gameSlug,
                game.createdByUserId,
                gameJsonCodec.writeJson(game.publicState),
                gameJsonCodec.writeJson(game.privateState)
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        }

    override fun touch(gameId: String, accessedAt: Instant): GameRecord? {
        val updatedRows = jdbcTemplate.update(
            """
            update games
            set last_accessed_at = ?
            where id = ?
            """.trimIndent(),
            Timestamp.from(accessedAt),
            gameId
        )
        if (updatedRows == 0) {
            return null
        }
        return get(gameId)
    }

    override fun entries(): List<GameRecord> =
        jdbcTemplate.query(selectStoredGameColumns, storedGameRowMapper)

    override fun staleEntries(): List<StoredGameAccess> =
        jdbcTemplate.query(
            """
            select id, last_accessed_at
            from games
            """.trimIndent()
        ) { resultSet, _ ->
            StoredGameAccess(
                gameId = resultSet.getString("id"),
                lastAccessedAt = resultSet.getTimestamp("last_accessed_at").toInstant()
            )
        }

    override fun remove(gameId: String): Boolean =
        jdbcTemplate.update(
            """
            delete from games
            where id = ?
            """.trimIndent(),
            gameId
        ) > 0

    private val storedGameRowMapper = RowMapper { resultSet: ResultSet, _: Int ->
        GameRecord(
            id = resultSet.getString("id"),
            gameSlug = resultSet.getString("game_slug"),
            version = resultSet.getLong("version"),
            createdAt = resultSet.getTimestamp("created_at").toInstant(),
            updatedAt = resultSet.getTimestamp("updated_at").toInstant(),
            lastAccessedAt = resultSet.getTimestamp("last_accessed_at").toInstant(),
            lifecycle = resultSet.getString("lifecycle"),
            publicState = gameJsonCodec.readJson(resultSet.getString("public_state_json")),
            privateState = gameJsonCodec.readJson(resultSet.getString("private_state_json")),
            createdByUserId = resultSet.getString("created_by_user_id")
        )
    }
}
