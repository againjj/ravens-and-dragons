package com.ravensanddragons.game.session

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*


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
