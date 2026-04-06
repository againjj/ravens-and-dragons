package com.dragonsvsravens.game

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

@RestController
@RequestMapping("/api/game")
class GameController(
    private val gameSessionService: GameSessionService
) {
    @GetMapping
    fun getGame(): GameSession = gameSessionService.getGame()

    @PostMapping("/commands")
    fun applyCommand(@RequestBody command: GameCommandRequest): GameSession =
        gameSessionService.applyCommand(command)

    @GetMapping("/stream")
    fun streamGame(): SseEmitter = gameSessionService.createEmitter()

    @ExceptionHandler(InvalidCommandException::class, IllegalArgumentException::class)
    fun handleInvalidCommand(exception: RuntimeException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ErrorResponse(exception.message ?: "Invalid command."))

    @ExceptionHandler(VersionConflictException::class)
    fun handleVersionConflict(exception: VersionConflictException): ResponseEntity<GameSession> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(exception.latestGame)
}
