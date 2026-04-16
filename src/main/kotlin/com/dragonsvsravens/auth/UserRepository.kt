package com.dragonsvsravens.auth

import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Repository
class UserRepository(
    private val jdbcTemplate: JdbcTemplate
) {
    fun createUser(
        displayName: String,
        authType: AuthType,
        username: String? = null,
        email: String? = null,
        passwordHash: String? = null,
        createdAt: Instant = Instant.now()
    ): UserRecord {
        val user = UserRecord(
            id = UUID.randomUUID().toString(),
            displayName = displayName,
            username = username,
            email = email,
            passwordHash = passwordHash,
            authType = authType,
            createdAt = createdAt
        )
        try {
            jdbcTemplate.update(
                """
                insert into users (id, display_name, username, email, password_hash, auth_type, created_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                user.id,
                user.displayName,
                user.username,
                user.email,
                user.passwordHash,
                user.authType.name,
                Timestamp.from(user.createdAt)
            )
        } catch (_: DuplicateKeyException) {
            throw IllegalArgumentException("That username or email is already in use.")
        }
        return user
    }

    fun findById(userId: String): UserRecord? =
        jdbcTemplate.query(
            """
            select id, display_name, username, email, password_hash, auth_type, created_at
            from users
            where id = ?
            """.trimIndent(),
            userRowMapper,
            userId
        ).firstOrNull()

    fun findByUsername(username: String): UserRecord? =
        jdbcTemplate.query(
            """
            select id, display_name, username, email, password_hash, auth_type, created_at
            from users
            where lower(username) = lower(?)
            """.trimIndent(),
            userRowMapper,
            username
        ).firstOrNull()

    fun updateDisplayName(userId: String, displayName: String) {
        jdbcTemplate.update(
            """
            update users
            set display_name = ?
            where id = ?
            """.trimIndent(),
            displayName,
            userId
        )
    }

    fun createIdentity(userId: String, provider: String, providerSubject: String, createdAt: Instant = Instant.now()) {
        jdbcTemplate.update(
            """
            insert into user_identities (id, user_id, provider, provider_subject, created_at)
            values (?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            userId,
            provider,
            providerSubject,
            Timestamp.from(createdAt)
        )
    }

    fun findByProviderIdentity(provider: String, providerSubject: String): UserRecord? =
        jdbcTemplate.query(
            """
            select u.id, u.display_name, u.username, u.email, u.password_hash, u.auth_type, u.created_at
            from user_identities identities
            join users u on u.id = identities.user_id
            where identities.provider = ?
              and identities.provider_subject = ?
            """.trimIndent(),
            userRowMapper,
            provider,
            providerSubject
        ).firstOrNull()

    fun deleteById(userId: String): Boolean =
        jdbcTemplate.update(
            """
            delete from users
            where id = ?
            """.trimIndent(),
            userId
        ) > 0

    fun deleteAllGuests(): Int =
        jdbcTemplate.update(
            """
            delete from users
            where auth_type = ?
            """.trimIndent(),
            AuthType.guest.name
        )

    private val userRowMapper = RowMapper { resultSet: ResultSet, _: Int ->
        UserRecord(
            id = resultSet.getString("id"),
            displayName = resultSet.getString("display_name"),
            username = resultSet.getString("username"),
            email = resultSet.getString("email"),
            passwordHash = resultSet.getString("password_hash"),
            authType = AuthType.valueOf(resultSet.getString("auth_type")),
            createdAt = resultSet.getTimestamp("created_at").toInstant()
        )
    }
}
