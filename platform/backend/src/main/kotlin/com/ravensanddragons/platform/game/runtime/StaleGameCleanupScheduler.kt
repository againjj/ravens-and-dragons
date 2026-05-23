package com.ravensanddragons.platform.game.runtime

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class StaleGameCleanupScheduler(
    private val gameSessionService: GameSessionService
) {
    @Scheduled(fixedDelayString = "#{@staleGameCleanupDelay.toMillis()}")
    fun removeStaleGames() {
        gameSessionService.removeStaleGames()
    }
}
