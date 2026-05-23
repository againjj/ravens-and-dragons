package com.ravensanddragons

import com.ravensanddragons.platform.game.GameModuleRegistry
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertAll
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.web.ServerProperties
import java.time.Duration
import kotlin.test.assertEquals

@SpringBootTest
class RavensAndDragonsApplicationTests(
    @Autowired private val serverProperties: ServerProperties,
    @Autowired private val staleGameCleanupDelay: Duration,
    @Autowired private val gameModuleRegistry: GameModuleRegistry
) {

    @Test
    fun contextLoads() {
    }

    @Test
    fun cleanupDelayAndSessionTimeoutFollowConfiguredDefaults() {
        assertAll(
            { assertEquals(Duration.ofHours(2), serverProperties.servlet.session.timeout) },
            { assertEquals(Duration.ofHours(1008).dividedBy(10), staleGameCleanupDelay) }
        )
    }

    @Test
    fun assemblesRavensAndDragonsGameModule() {
        val module = gameModuleRegistry.requireModule("ravens-and-dragons")

        assertAll(
            { assertEquals(listOf("tic-tac-toe", "gin-rummy", "ravens-and-dragons"), gameModuleRegistry.modules.map { it.identity.slug }) },
            { assertEquals("Ravens and Dragons", module.identity.displayName) },
            { assertEquals("/ravens-and-dragons/create", module.routes.browserCreatePath) },
            { assertEquals("/g/{gameId}", module.routes.browserPlayPathPattern) },
            { assertEquals("/api/games/{gameSlug}", module.routes.apiBasePath) },
            { assertEquals("ravens-and-dragons", module.persistence.migrationNamespace) },
            {
                assertEquals(
                    setOf(
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
                    module.persistence.platformMetadataFields
                )
            },
            {
                assertEquals(
                    setOf(
                        "public_state_json",
                        "private_state_json"
                    ),
                    module.persistence.opaquePayloadNames
                )
            },
            { assertEquals("/ravens-and-dragons/create", module.smokeCheck.browserEntryPath) },
            { assertEquals("/api/games/ravens-and-dragons", module.smokeCheck.apiEntryPath) }
        )
    }

    @Test
    fun assemblesTicTacToeGameModule() {
        val module = gameModuleRegistry.requireModule("tic-tac-toe")

        assertAll(
            { assertEquals("Tic-Tac-Toe", module.identity.displayName) },
            { assertEquals("/tic-tac-toe/create", module.routes.browserCreatePath) },
            { assertEquals("/g/{gameId}", module.routes.browserPlayPathPattern) },
            { assertEquals("/api/games/{gameSlug}", module.routes.apiBasePath) },
            { assertEquals("tic-tac-toe", module.persistence.migrationNamespace) },
            {
                assertEquals(
                    setOf(
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
                    module.persistence.platformMetadataFields
                )
            },
            {
                assertEquals(
                    setOf(
                        "public_state_json",
                        "private_state_json"
                    ),
                    module.persistence.opaquePayloadNames
                )
            },
            { assertEquals("/tic-tac-toe/create", module.smokeCheck.browserEntryPath) },
            { assertEquals("/api/games/tic-tac-toe", module.smokeCheck.apiEntryPath) }
        )
    }

    @Test
    fun assemblesGinRummyGameModule() {
        val module = gameModuleRegistry.requireModule("gin-rummy")

        assertAll(
            { assertEquals("Gin Rummy", module.identity.displayName) },
            { assertEquals("/gin-rummy/create", module.routes.browserCreatePath) },
            { assertEquals("/g/{gameId}", module.routes.browserPlayPathPattern) },
            { assertEquals("/api/games/{gameSlug}", module.routes.apiBasePath) },
            { assertEquals("gin-rummy", module.persistence.migrationNamespace) },
            {
                assertEquals(
                    setOf(
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
                    module.persistence.platformMetadataFields
                )
            },
            {
                assertEquals(
                    setOf(
                        "public_state_json",
                        "private_state_json"
                    ),
                    module.persistence.opaquePayloadNames
                )
            },
            { assertEquals("/gin-rummy/create", module.smokeCheck.browserEntryPath) },
            { assertEquals("/api/games/gin-rummy", module.smokeCheck.apiEntryPath) }
        )
    }
}
