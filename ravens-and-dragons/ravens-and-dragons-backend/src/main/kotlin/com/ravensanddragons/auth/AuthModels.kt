package com.ravensanddragons.auth

import java.time.Instant

enum class AuthType {
    guest,
    local,
    oauth
}

data class UserRecord(
    val id: String,
    val displayName: String,
    val username: String? = null,
    val email: String? = null,
    val passwordHash: String? = null,
    val authType: AuthType,
    val createdAt: Instant
)

data class UserIdentityRecord(
    val id: String,
    val userId: String,
    val provider: String,
    val providerSubject: String,
    val createdAt: Instant
)

data class AuthUserSummary(
    val id: String,
    val displayName: String,
    val authType: AuthType
)

data class AuthSessionResponse(
    val authenticated: Boolean,
    val user: AuthUserSummary? = null,
    val oauthProviders: List<String> = emptyList()
)

data class SignupRequest(
    val username: String,
    val password: String,
    val displayName: String,
    val email: String? = null
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class LocalProfileResponse(
    val id: String,
    val username: String,
    val displayName: String
)

data class UpdateProfileRequest(
    val displayName: String
)

data class DeleteAccountRequest(
    val password: String
)

class AuthenticationFailedException(message: String) : RuntimeException(message)

class ForbiddenActionException(message: String) : RuntimeException(message)
