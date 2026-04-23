package com.ravensanddragons.game

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class StaleGameCleanupScheduler(
    private val gameSessionService: GameSessionService
) {
    @Scheduled(fixedDelayString = "\${ravens-and-dragons.games.cleanup-fixed-delay-ms:300000}")
    fun removeStaleGames() {
        gameSessionService.removeStaleGames()
    }
}
