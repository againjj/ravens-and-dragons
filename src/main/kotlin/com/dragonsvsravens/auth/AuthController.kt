package com.dragonsvsravens.auth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class AuthController(
    private val userAccountService: UserAccountService,
    private val authSessionSupport: AuthSessionSupport,
    private val oauthProviderCatalog: OAuthProviderCatalog
) {
    private fun currentUserId(request: HttpServletRequest): String =
        authSessionSupport.currentUserId(request.getSession(false))
            ?: throw AuthenticationFailedException("You must sign in before managing your profile.")

    private fun signedInSession(user: UserRecord): AuthSessionResponse =
        AuthSessionResponse(
            authenticated = true,
            user = AuthUserSummary(user.id, user.displayName, user.authType),
            oauthProviders = oauthProviderCatalog.availableProviders()
        )

    @GetMapping("/api/auth/session")
    fun session(request: HttpServletRequest): AuthSessionResponse {
        val user = userAccountService.currentUserSummary(authSessionSupport.currentUserId(request.getSession(false)))
        return AuthSessionResponse(
            authenticated = user != null,
            user = user,
            oauthProviders = oauthProviderCatalog.availableProviders()
        )
    }

    @GetMapping("/api/auth/profile")
    fun profile(request: HttpServletRequest): LocalProfileResponse =
        userAccountService.getLocalProfile(currentUserId(request))

    @PostMapping("/api/auth/guest")
    fun guestLogin(request: HttpServletRequest, response: HttpServletResponse): AuthSessionResponse {
        val user = userAccountService.createGuestUser()
        authSessionSupport.signIn(request, response, user)
        return signedInSession(user)
    }

    @PostMapping("/api/auth/signup")
    fun signup(
        @RequestBody signupRequest: SignupRequest,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): AuthSessionResponse {
        val user = userAccountService.signup(signupRequest)
        authSessionSupport.signIn(request, response, user)
        return signedInSession(user)
    }

    @PostMapping("/api/auth/login")
    fun login(
        @RequestBody loginRequest: LoginRequest,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): AuthSessionResponse {
        val user = userAccountService.authenticateLocal(loginRequest)
        authSessionSupport.signIn(request, response, user)
        return signedInSession(user)
    }

    @PostMapping("/api/auth/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<Unit> {
        val session = request.getSession(false)
        val currentUserId = authSessionSupport.currentUserId(session)
        if (authSessionSupport.currentAuthType(session) == AuthType.guest && currentUserId != null) {
            userAccountService.deleteGuestUser(currentUserId)
        }
        authSessionSupport.signOut(session)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/api/auth/profile")
    fun updateProfile(
        @RequestBody updateProfileRequest: UpdateProfileRequest,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): AuthSessionResponse {
        val user = userAccountService.updateLocalDisplayName(
            currentUserId(request),
            updateProfileRequest
        )
        authSessionSupport.signIn(request, response, user)
        return signedInSession(user)
    }

    @PostMapping("/api/auth/delete-account")
    fun deleteAccount(
        @RequestBody deleteAccountRequest: DeleteAccountRequest,
        request: HttpServletRequest
    ): ResponseEntity<Unit> {
        val session = request.getSession(false)
        userAccountService.deleteLocalAccount(
            currentUserId(request),
            deleteAccountRequest
        )
        authSessionSupport.signOut(session)
        return ResponseEntity.noContent().build()
    }

    @ExceptionHandler(AuthenticationFailedException::class)
    fun handleAuthenticationFailure(exception: AuthenticationFailedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("message" to (exception.message ?: "Authentication failed.")))

    @ExceptionHandler(ForbiddenActionException::class)
    fun handleForbiddenFailure(exception: ForbiddenActionException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("message" to (exception.message ?: "Forbidden.")))

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleValidationFailure(exception: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("message" to (exception.message ?: "Invalid request.")))
}
