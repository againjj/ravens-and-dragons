package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.ravensanddragons.auth.AuthSessionSupport
import com.ravensanddragons.auth.ForbiddenActionException
import jakarta.servlet.DispatcherType
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
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
    private val authSessionSupport: AuthSessionSupport,
    private val objectMapper: ObjectMapper
) {
    @PostMapping("/api/games/{gameSlug}")
    fun createGame(
        @PathVariable gameSlug: String,
        @RequestBody(required = false) request: JsonNode?,
        servletRequest: HttpServletRequest
    ): JsonNode {
        val game = gameSessionService.createGame(
            gameSlug,
            request ?: objectMapper.createObjectNode(),
            createdByUserId = authSessionSupport.currentUserId(servletRequest.getSession(false))
        )
        return objectMapper.createObjectNode().set<JsonNode>("game", game)
    }

    @GetMapping("/api/games/public")
    fun listPublicGames(): List<PublicGameListing> = gameSessionService.listPublicGames()

    @GetMapping("/api/games/mine")
    fun listPlayerGames(request: HttpServletRequest): List<PlayerGameListing> =
        gameSessionService.listPlayerGames(
            authSessionSupport.currentUserId(request.getSession(false))
                ?: throw ForbiddenActionException("You must sign in before loading your games.")
        )

    @GetMapping("/api/games/mine/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamPlayerGames(request: HttpServletRequest): ResponseEntity<SseEmitter> {
        if (request.dispatcherType == DispatcherType.ERROR) {
            return ResponseEntity.noContent().build()
        }

        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(
                gameSessionService.createPlayerGamesEmitter(
                    authSessionSupport.currentUserId(request.getSession(false))
                        ?: throw ForbiddenActionException("You must sign in before loading your games.")
                )
            )
    }

    @GetMapping("/api/games/{gameId}")
    fun getGame(@PathVariable gameId: String): JsonNode = gameSessionService.getGame(gameId)

    @GetMapping("/api/games/{gameId}/view")
    fun getGameView(
        @PathVariable gameId: String,
        request: HttpServletRequest
    ): JsonNode =
        gameSessionService.getGameView(
            gameId,
            authSessionSupport.currentUserId(request.getSession(false))
        )

    @PostMapping("/api/games/{gameId}/commands")
    fun applyCommand(
        @PathVariable gameId: String,
        @RequestBody command: JsonNode,
        request: HttpServletRequest
    ): JsonNode = gameSessionService.applyCommand(
        gameId,
        command,
        authSessionSupport.currentUserId(request.getSession(false))
            ?: throw ForbiddenActionException("You must sign in before submitting commands.")
    )

    @GetMapping("/api/games/{gameId}/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamGame(
        @PathVariable gameId: String,
        request: HttpServletRequest
    ): ResponseEntity<SseEmitter> {
        if (request.dispatcherType == DispatcherType.ERROR) {
            return ResponseEntity.noContent().build()
        }

        return try {
            ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(gameSessionService.createEmitter(gameId))
        } catch (_: GameNotFoundException) {
            ResponseEntity.notFound().build()
        }
    }

    @ExceptionHandler(GameNotFoundException::class)
    fun handleGameNotFound(exception: GameNotFoundException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse(exception.message ?: "Game not found."))

    @ExceptionHandler(PlayerAccountMissingException::class)
    fun handlePlayerAccountMissing(exception: PlayerAccountMissingException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(ErrorResponse(exception.message ?: "The chosen player account no longer exists."))

    @ExceptionHandler(InvalidCommandException::class, IllegalArgumentException::class)
    fun handleInvalidCommand(exception: RuntimeException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ErrorResponse(exception.message ?: "Invalid command."))

    @ExceptionHandler(VersionConflictException::class)
    fun handleVersionConflict(exception: VersionConflictException): ResponseEntity<JsonNode> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(exception.latestState)

    @ExceptionHandler(ForbiddenActionException::class)
    fun handleForbiddenAction(exception: ForbiddenActionException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(ErrorResponse(exception.message ?: "Forbidden."))
}
