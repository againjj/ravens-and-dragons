package com.dragonsvsravens.game

import com.dragonsvsravens.auth.AuthSessionSupport
import com.dragonsvsravens.auth.ForbiddenActionException
import com.dragonsvsravens.auth.UserAccountService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.MediaType
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

@RestController
class GameController(
    private val gameSessionService: GameSessionService,
    private val userAccountService: UserAccountService,
    private val authSessionSupport: AuthSessionSupport
) {
    @PostMapping("/api/games")
    fun createGame(
        @RequestBody(required = false) request: CreateGameRequest?,
        servletRequest: HttpServletRequest
    ): CreateGameResponse =
        CreateGameResponse(
            gameSessionService.createGame(
                request ?: CreateGameRequest(),
                createdByUserId = authSessionSupport.currentUserId(servletRequest.getSession(false))
            )
        )

    @GetMapping("/api/games/{gameId}")
    fun getGame(@PathVariable gameId: String): GameSession = gameSessionService.getGame(gameId)

    @GetMapping("/api/games/{gameId}/view")
    fun getGameView(
        @PathVariable gameId: String,
        request: HttpServletRequest
    ): GameViewResponse {
        val game = gameSessionService.getGame(gameId)
        val currentUserId = authSessionSupport.currentUserId(request.getSession(false))
        val currentUser = userAccountService.currentUserSummary(currentUserId)
        return GameViewResponse(
            game = game,
            currentUser = currentUser,
            dragonsPlayer = game.dragonsPlayerUserId?.let { userAccountService.findUser(it) }?.let { GamePlayerSummary(it.id, it.displayName) },
            ravensPlayer = game.ravensPlayerUserId?.let { userAccountService.findUser(it) }?.let { GamePlayerSummary(it.id, it.displayName) },
            viewerRole = when (currentUserId) {
                null -> ViewerRole.anonymous
                game.dragonsPlayerUserId -> ViewerRole.dragons
                game.ravensPlayerUserId -> ViewerRole.ravens
                else -> ViewerRole.spectator
            }
        )
    }

    @PostMapping("/api/games/{gameId}/commands")
    fun applyCommand(
        @PathVariable gameId: String,
        @RequestBody command: GameCommandRequest,
        request: HttpServletRequest
    ): GameSession = gameSessionService.applyCommand(
        gameId,
        command,
        authSessionSupport.currentUserId(request.getSession(false))
            ?: throw ForbiddenActionException("You must sign in before submitting commands.")
    )

    @PostMapping("/api/games/{gameId}/claim-side")
    fun claimSide(
        @PathVariable gameId: String,
        @RequestBody request: ClaimSideRequest,
        servletRequest: HttpServletRequest
    ): GameSession = gameSessionService.claimSide(
        gameId,
        request.side,
        authSessionSupport.currentUserId(servletRequest.getSession(false))
            ?: throw ForbiddenActionException("You must sign in before claiming a side.")
    )

    @GetMapping("/api/games/{gameId}/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamGame(@PathVariable gameId: String): ResponseEntity<SseEmitter> =
        try {
            ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(gameSessionService.createEmitter(gameId))
        } catch (_: GameNotFoundException) {
            ResponseEntity.notFound().build()
        }

    @ExceptionHandler(GameNotFoundException::class)
    fun handleGameNotFound(exception: GameNotFoundException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse(exception.message ?: "Game not found."))

    @ExceptionHandler(InvalidCommandException::class, IllegalArgumentException::class)
    fun handleInvalidCommand(exception: RuntimeException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ErrorResponse(exception.message ?: "Invalid command."))

    @ExceptionHandler(VersionConflictException::class)
    fun handleVersionConflict(exception: VersionConflictException): ResponseEntity<GameSession> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(exception.latestGame)

    @ExceptionHandler(ForbiddenActionException::class)
    fun handleForbiddenAction(exception: ForbiddenActionException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(ErrorResponse(exception.message ?: "Forbidden."))
}
