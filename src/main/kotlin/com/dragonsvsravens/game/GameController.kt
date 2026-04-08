package com.dragonsvsravens.game

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
    private val gameSessionService: GameSessionService
) {
    @PostMapping("/api/games")
    fun createGame(@RequestBody(required = false) request: CreateGameRequest?): CreateGameResponse =
        CreateGameResponse(gameSessionService.createGame(request ?: CreateGameRequest()))

    @GetMapping("/api/games/{gameId}")
    fun getGame(@PathVariable gameId: String): GameSession = gameSessionService.getGame(gameId)

    @PostMapping("/api/games/{gameId}/commands")
    fun applyCommand(
        @PathVariable gameId: String,
        @RequestBody command: GameCommandRequest
    ): GameSession = gameSessionService.applyCommand(gameId, command)

    @GetMapping("/api/games/{gameId}/stream")
    fun streamGame(@PathVariable gameId: String): SseEmitter = gameSessionService.createEmitter(gameId)

    @ExceptionHandler(GameNotFoundException::class)
    fun handleGameNotFound(exception: GameNotFoundException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse(exception.message ?: "Game not found."))

    @ExceptionHandler(InvalidCommandException::class, IllegalArgumentException::class)
    fun handleInvalidCommand(exception: RuntimeException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ErrorResponse(exception.message ?: "Invalid command."))

    @ExceptionHandler(VersionConflictException::class)
    fun handleVersionConflict(exception: VersionConflictException): ResponseEntity<GameSession> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(exception.latestGame)
}
