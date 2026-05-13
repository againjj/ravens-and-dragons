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
            { assertEquals(listOf("clicker", "ravens-and-dragons"), gameModuleRegistry.modules.map { it.identity.slug }) },
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
                        "created_by_user_id"
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
    fun assemblesClickerGameModule() {
        val module = gameModuleRegistry.requireModule("clicker")

        assertAll(
            { assertEquals("Clicker", module.identity.displayName) },
            { assertEquals("/clicker/create", module.routes.browserCreatePath) },
            { assertEquals("/g/{gameId}", module.routes.browserPlayPathPattern) },
            { assertEquals("/api/games/{gameSlug}", module.routes.apiBasePath) },
            { assertEquals("clicker", module.persistence.migrationNamespace) },
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
                        "created_by_user_id"
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
            { assertEquals("/clicker/create", module.smokeCheck.browserEntryPath) },
            { assertEquals("/api/games/clicker", module.smokeCheck.apiEntryPath) }
        )
    }
}
