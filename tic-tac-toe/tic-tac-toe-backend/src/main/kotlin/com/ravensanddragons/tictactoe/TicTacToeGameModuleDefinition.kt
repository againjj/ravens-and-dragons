package com.ravensanddragons.tictactoe

import com.ravensanddragons.platform.game.GameModuleDefinition
import com.ravensanddragons.platform.game.GameModuleIdentity
import com.ravensanddragons.platform.game.GameModulePersistenceContract
import com.ravensanddragons.platform.game.GameModuleRoutes
import com.ravensanddragons.platform.game.GameModuleSmokeCheck

object TicTacToeGameModuleDefinition : GameModuleDefinition {
    private const val gameSlug = "tic-tac-toe"
    private const val createPath = "/$gameSlug/create"
    private const val apiCreatePath = "/api/games/$gameSlug"

    override val identity: GameModuleIdentity = GameModuleIdentity(
        slug = gameSlug,
        displayName = "Tic-Tac-Toe"
    )

    override val routes: GameModuleRoutes = GameModuleRoutes(
        browserCreatePath = createPath,
        browserPlayPathPattern = "/g/{gameId}",
        apiBasePath = "/api/games/{gameSlug}"
    )

    override val persistence: GameModulePersistenceContract = GameModulePersistenceContract(
        migrationNamespace = gameSlug,
        platformMetadataFields = setOf(
            "id",
            "game_slug",
            "version",
            "created_at",
            "updated_at",
            "last_accessed_at",
            "lifecycle",
            "created_by_user_id",
            "publicly_listed"
        ),
        opaquePayloadNames = setOf(
            "public_state_json",
            "private_state_json"
        )
    )

    override val smokeCheck: GameModuleSmokeCheck = GameModuleSmokeCheck(
        browserEntryPath = createPath,
        apiEntryPath = apiCreatePath
    )
}
