package com.dragonsvsravens.auth

import com.dragonsvsravens.game.GameSessionService
import com.dragonsvsravens.game.GameStore
import jakarta.annotation.PostConstruct
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Service
class UserAccountService(
    private val userRepository: UserRepository,
    private val gameStore: GameStore,
    private val gameSessionService: GameSessionService,
    private val passwordEncoder: PasswordEncoder,
    private val clock: Clock
) {
    @PostConstruct
    fun purgeGuestsFromPreviousServerSessions() {
        releaseSeatsForGuests()
        userRepository.deleteAllGuests()
    }

    fun currentUserSummary(userId: String?): AuthUserSummary? =
        userId?.let { findUser(it)?.toSummary() }

    fun findUser(userId: String): UserRecord? = userRepository.findById(userId)

    @Transactional
    fun createGuestUser(): UserRecord =
        userRepository.createUser(
            displayName = "Guest ${UUID.randomUUID().toString().take(6).uppercase()}",
            authType = AuthType.guest,
            createdAt = Instant.now(clock)
        )

    @Transactional
    fun signup(request: SignupRequest): UserRecord {
        val username = request.username.trim()
        val displayName = request.displayName.trim()
        if (username.isBlank()) {
            throw IllegalArgumentException("Username is required.")
        }
        if (displayName.isBlank()) {
            throw IllegalArgumentException("Display name is required.")
        }
        if (request.password.length < 8) {
            throw IllegalArgumentException("Password must be at least 8 characters.")
        }
        return userRepository.createUser(
            displayName = displayName,
            username = username,
            email = request.email?.trim().takeUnless { it.isNullOrBlank() },
            passwordHash = passwordEncoder.encode(request.password),
            authType = AuthType.local,
            createdAt = Instant.now(clock)
        )
    }

    fun authenticateLocal(request: LoginRequest): UserRecord {
        val user = userRepository.findByUsername(request.username.trim())
            ?: throw AuthenticationFailedException("Invalid username or password.")
        if (user.authType != AuthType.local || user.passwordHash == null || !passwordEncoder.matches(request.password, user.passwordHash)) {
            throw AuthenticationFailedException("Invalid username or password.")
        }
        return user
    }

    @Transactional
    fun findOrCreateOAuthUser(
        provider: String,
        providerSubject: String,
        displayName: String,
        email: String?
    ): UserRecord {
        userRepository.findByProviderIdentity(provider, providerSubject)?.let { return it }
        val user = userRepository.createUser(
            displayName = displayName.ifBlank { provider.replaceFirstChar(Char::titlecase) + " User" },
            email = email,
            authType = AuthType.oauth,
            createdAt = Instant.now(clock)
        )
        userRepository.createIdentity(user.id, provider, providerSubject, Instant.now(clock))
        return user
    }

    @Transactional
    fun deleteGuestUser(userId: String) {
        val user = userRepository.findById(userId) ?: return
        if (user.authType != AuthType.guest) {
            return
        }
        gameSessionService.clearUserReferences(userId)
        userRepository.deleteById(userId)
    }

    private fun releaseSeatsForGuests() {
        // Release guest-owned seats before startup cleanup removes the orphaned guest users.
        gameStore.entries()
            .flatMap { storedGame ->
                listOfNotNull(
                    storedGame.session.dragonsPlayerUserId,
                    storedGame.session.ravensPlayerUserId,
                    storedGame.session.createdByUserId
                )
            }
            .distinct()
            .forEach { userId ->
                val user = userRepository.findById(userId) ?: return@forEach
                if (user.authType == AuthType.guest) {
                    gameSessionService.clearUserReferences(userId)
                }
            }
    }

    private fun UserRecord.toSummary(): AuthUserSummary =
        AuthUserSummary(
            id = id,
            displayName = displayName,
            authType = authType
        )
}
