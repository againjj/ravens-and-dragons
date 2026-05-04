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
            { assertEquals(listOf("ravens-and-dragons"), gameModuleRegistry.modules.map { it.identity.slug }) },
            { assertEquals("Ravens and Dragons", module.identity.displayName) },
            { assertEquals("/create", module.routes.browserCreatePath) },
            { assertEquals("/g/{gameId}", module.routes.browserPlayPathPattern) },
            { assertEquals("/api/games", module.routes.apiBasePath) },
            { assertEquals("ravens-and-dragons", module.persistence.migrationNamespace) },
            {
                assertEquals(
                    setOf(
                        "id",
                        "version",
                        "created_at",
                        "updated_at",
                        "last_accessed_at",
                        "lifecycle",
                        "dragons_player_user_id",
                        "ravens_player_user_id",
                        "dragons_bot_id",
                        "ravens_bot_id",
                        "created_by_user_id"
                    ),
                    module.persistence.platformMetadataFields
                )
            },
            {
                assertEquals(
                    setOf(
                        "snapshot_json",
                        "undo_snapshots_json",
                        "selected_rule_configuration_id",
                        "selected_starting_side",
                        "selected_board_size"
                    ),
                    module.persistence.opaquePayloadNames
                )
            },
            { assertEquals("/create", module.smokeCheck.browserEntryPath) },
            { assertEquals("/api/games", module.smokeCheck.apiEntryPath) }
        )
    }
}
