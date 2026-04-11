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
    private val authSessionSupport: AuthSessionSupport
) {
    @GetMapping("/api/auth/session")
    fun session(request: HttpServletRequest): AuthSessionResponse {
        val user = userAccountService.currentUserSummary(authSessionSupport.currentUserId(request.getSession(false)))
        return AuthSessionResponse(authenticated = user != null, user = user)
    }

    @PostMapping("/api/auth/guest")
    fun guestLogin(request: HttpServletRequest, response: HttpServletResponse): GuestLoginResponse {
        val user = userAccountService.createGuestUser()
        authSessionSupport.signIn(request, response, user)
        return GuestLoginResponse(
            user = AuthUserSummary(
                id = user.id,
                displayName = user.displayName,
                authType = user.authType
            )
        )
    }

    @PostMapping("/api/auth/signup")
    fun signup(
        @RequestBody signupRequest: SignupRequest,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): AuthSessionResponse {
        val user = userAccountService.signup(signupRequest)
        authSessionSupport.signIn(request, response, user)
        return AuthSessionResponse(authenticated = true, user = AuthUserSummary(user.id, user.displayName, user.authType))
    }

    @PostMapping("/api/auth/login")
    fun login(
        @RequestBody loginRequest: LoginRequest,
        request: HttpServletRequest,
        response: HttpServletResponse
    ): AuthSessionResponse {
        val user = userAccountService.authenticateLocal(loginRequest)
        authSessionSupport.signIn(request, response, user)
        return AuthSessionResponse(authenticated = true, user = AuthUserSummary(user.id, user.displayName, user.authType))
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

    @ExceptionHandler(AuthenticationFailedException::class)
    fun handleAuthenticationFailure(exception: AuthenticationFailedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("message" to (exception.message ?: "Authentication failed.")))

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleValidationFailure(exception: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("message" to (exception.message ?: "Invalid request.")))
}
