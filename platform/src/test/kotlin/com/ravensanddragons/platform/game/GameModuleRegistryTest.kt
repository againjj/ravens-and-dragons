package com.ravensanddragons.platform.game

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class GameModuleRegistryTest {
    @Test
    fun requiresRegisteredModules() {
        val exception = assertThrows<IllegalArgumentException> {
            GameModuleRegistry(emptyList())
        }

        assertEquals("At least one game module must be registered.", exception.message)
    }

    @Test
    fun rejectsDuplicateSlugs() {
        val module = testModule("ravens-and-dragons")
        val exception = assertThrows<IllegalArgumentException> {
            GameModuleRegistry(listOf(module, module))
        }

        assertEquals("Game module slugs must be unique.", exception.message)
    }

    @Test
    fun resolvesRegisteredModulesBySlug() {
        val module = testModule("ravens-and-dragons")
        val registry = GameModuleRegistry(listOf(module))

        assertEquals(module, registry.requireModule("ravens-and-dragons"))
    }

    private fun testModule(slug: String): GameModuleDefinition =
        object : GameModuleDefinition {
            override val identity: GameModuleIdentity = GameModuleIdentity(
                slug = slug,
                displayName = "Ravens and Dragons"
            )
            override val routes: GameModuleRoutes = GameModuleRoutes(
                browserCreatePath = "/create",
                browserPlayPathPattern = "/g/{gameId}",
                apiBasePath = "/api/games"
            )
            override val persistence: GameModulePersistenceContract = GameModulePersistenceContract(
                migrationNamespace = slug,
                platformMetadataFields = setOf("id"),
                opaquePayloadNames = setOf("snapshot_json")
            )
            override val smokeCheck: GameModuleSmokeCheck = GameModuleSmokeCheck(
                browserEntryPath = "/create",
                apiEntryPath = "/api/games"
            )
        }
}
