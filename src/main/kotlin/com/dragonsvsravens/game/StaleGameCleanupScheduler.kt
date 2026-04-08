package com.dragonsvsravens.game

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class StaleGameCleanupScheduler(
    private val gameSessionService: GameSessionService
) {
    @Scheduled(fixedDelayString = "\${dragons-vs-ravens.games.cleanup-fixed-delay-ms:300000}")
    fun removeStaleGames() {
        gameSessionService.removeStaleGames()
    }
}
