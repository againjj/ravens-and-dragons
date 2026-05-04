package com.ravensanddragons.game.session

import com.ravensanddragons.auth.UserReferenceCleanup
import org.springframework.stereotype.Component

@Component
class GameUserReferenceCleanup(
    private val gameSessionService: GameSessionService
) : UserReferenceCleanup {
    override fun clearUserReferences(userId: String) {
        gameSessionService.clearUserReferences(userId)
    }
}
