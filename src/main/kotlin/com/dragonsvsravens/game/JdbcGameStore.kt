package com.dragonsvsravens.game

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
    private val gameJsonCodec: GameJsonCodec
) : GameStore {
    companion object {
        private val selectStoredGameColumns = """
            select id, version, created_at, updated_at, last_accessed_at, lifecycle,
                   selected_rule_configuration_id, selected_starting_side, selected_board_size,
                   dragons_player_user_id, ravens_player_user_id, created_by_user_id,
                   snapshot_json, undo_snapshots_json
            from games
        """.trimIndent()
    }

    override fun get(gameId: String): StoredGame? =
        jdbcTemplate.query(
            """
            $selectStoredGameColumns
            where id = ?
            """.trimIndent(),
            storedGameRowMapper,
            gameId
        ).firstOrNull()

    override fun put(game: StoredGame) {
        val updatedRows = jdbcTemplate.update(
            """
            update games
            set version = ?,
                updated_at = ?,
                last_accessed_at = ?,
                lifecycle = ?,
                selected_rule_configuration_id = ?,
                selected_starting_side = ?,
                selected_board_size = ?,
                dragons_player_user_id = ?,
                ravens_player_user_id = ?,
                created_by_user_id = ?,
                snapshot_json = ?,
                undo_snapshots_json = ?
            where id = ?
              and version = ?
            """.trimIndent(),
            *updateArguments(game)
        )
        if (updatedRows == 0) {
            throw ConcurrentGameUpdateException(game.session.id)
        }
    }

    override fun putIfAbsent(game: StoredGame): Boolean =
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
                    selected_rule_configuration_id,
                    selected_starting_side,
                    selected_board_size,
                    dragons_player_user_id,
                    ravens_player_user_id,
                    created_by_user_id,
                    snapshot_json,
                    undo_snapshots_json
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                *insertArguments(game)
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        }

    override fun touch(gameId: String, accessedAt: Instant): StoredGame? {
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

    override fun entries(): List<StoredGame> =
        jdbcTemplate.query(
            selectStoredGameColumns,
            storedGameRowMapper
        )

    override fun remove(gameId: String): Boolean =
        jdbcTemplate.update(
            """
            delete from games
            where id = ?
            """.trimIndent(),
            gameId
        ) > 0

    override fun clearUserReferences(userId: String): List<StoredGame> {
        val affectedGameIds = jdbcTemplate.queryForList(
            """
            select id
            from games
            where dragons_player_user_id = ?
               or ravens_player_user_id = ?
               or created_by_user_id = ?
            """.trimIndent(),
            String::class.java,
            userId,
            userId,
            userId
        )
        if (affectedGameIds.isEmpty()) {
            return emptyList()
        }
        jdbcTemplate.update(
            """
            update games
            set dragons_player_user_id = case when dragons_player_user_id = ? then null else dragons_player_user_id end,
                ravens_player_user_id = case when ravens_player_user_id = ? then null else ravens_player_user_id end,
                created_by_user_id = case when created_by_user_id = ? then null else created_by_user_id end
            where dragons_player_user_id = ?
               or ravens_player_user_id = ?
               or created_by_user_id = ?
            """.trimIndent(),
            userId,
            userId,
            userId,
            userId,
            userId,
            userId
        )
        return affectedGameIds.mapNotNull(::get)
    }

    private val storedGameRowMapper = RowMapper { resultSet: ResultSet, _: Int ->
        GameSessionFactory.createStoredGame(
            gameId = resultSet.getString("id"),
            snapshot = gameJsonCodec.readSnapshot(resultSet.getString("snapshot_json")),
            undoSnapshots = gameJsonCodec.readUndoSnapshots(resultSet.getString("undo_snapshots_json")),
            version = resultSet.getLong("version"),
            createdAt = resultSet.getTimestamp("created_at").toInstant(),
            updatedAt = resultSet.getTimestamp("updated_at").toInstant(),
            lastAccessedAt = resultSet.getTimestamp("last_accessed_at").toInstant(),
            lifecycle = GameLifecycle.valueOf(resultSet.getString("lifecycle")),
            selectedRuleConfigurationId = resultSet.getString("selected_rule_configuration_id"),
            selectedStartingSide = Side.valueOf(resultSet.getString("selected_starting_side")),
            selectedBoardSize = resultSet.getInt("selected_board_size"),
            dragonsPlayerUserId = resultSet.getString("dragons_player_user_id"),
            ravensPlayerUserId = resultSet.getString("ravens_player_user_id"),
            createdByUserId = resultSet.getString("created_by_user_id")
        )
    }

    private fun insertArguments(game: StoredGame): Array<Any?> = arrayOf(
        game.session.id,
        game.session.version,
        Timestamp.from(game.session.createdAt),
        Timestamp.from(game.session.updatedAt),
        Timestamp.from(game.lastAccessedAt),
        game.session.lifecycle.name,
        game.session.selectedRuleConfigurationId,
        game.session.selectedStartingSide.name,
        game.session.selectedBoardSize,
        game.session.dragonsPlayerUserId,
        game.session.ravensPlayerUserId,
        game.session.createdByUserId,
        gameJsonCodec.writeSnapshot(game.session.snapshot),
        gameJsonCodec.writeUndoSnapshots(game.undoSnapshots)
    )

    private fun updateArguments(game: StoredGame): Array<Any?> = arrayOf(
        game.session.version,
        Timestamp.from(game.session.updatedAt),
        Timestamp.from(game.lastAccessedAt),
        game.session.lifecycle.name,
        game.session.selectedRuleConfigurationId,
        game.session.selectedStartingSide.name,
        game.session.selectedBoardSize,
        game.session.dragonsPlayerUserId,
        game.session.ravensPlayerUserId,
        game.session.createdByUserId,
        gameJsonCodec.writeSnapshot(game.session.snapshot),
        gameJsonCodec.writeUndoSnapshots(game.undoSnapshots),
        game.session.id,
        game.session.version - 1
    )
}
