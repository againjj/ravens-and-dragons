package com.ravensanddragons.platform.game

data class GameModuleIdentity(
    val slug: String,
    val displayName: String
)

data class GameModuleRoutes(
    val browserCreatePath: String,
    val browserPlayPathPattern: String,
    val apiBasePath: String
)

data class GameModulePersistenceContract(
    val migrationNamespace: String,
    val platformMetadataFields: Set<String>,
    val opaquePayloadNames: Set<String>
)

data class GameModuleSmokeCheck(
    val browserEntryPath: String,
    val apiEntryPath: String
)

interface GameModuleDefinition {
    val identity: GameModuleIdentity
    val routes: GameModuleRoutes
    val persistence: GameModulePersistenceContract
    val smokeCheck: GameModuleSmokeCheck
}

class GameModuleRegistry(
    modules: List<GameModuleDefinition>
) {
    val modules: List<GameModuleDefinition> = modules.toList()
    private val modulesBySlug: Map<String, GameModuleDefinition> = this.modules.associateBy { it.identity.slug }

    init {
        require(this.modules.isNotEmpty()) {
            "At least one game module must be registered."
        }
        this.modules.forEach(::validateModule)
        require(modulesBySlug.size == this.modules.size) {
            "Game module slugs must be unique."
        }
    }

    fun requireModule(slug: String): GameModuleDefinition =
        modulesBySlug[slug] ?: throw IllegalArgumentException("Game module '$slug' is not registered.")

    private fun validateModule(module: GameModuleDefinition) {
        require(module.identity.slug.matches(slugPattern)) {
            "Game module slug '${module.identity.slug}' must use lowercase letters, numbers, and dashes."
        }
        require(module.identity.displayName.isNotBlank()) {
            "Game module '${module.identity.slug}' must have a display name."
        }
        require(module.routes.browserCreatePath.startsWith("/")) {
            "Game module '${module.identity.slug}' must use an absolute browser create path."
        }
        require(module.routes.browserPlayPathPattern.startsWith("/")) {
            "Game module '${module.identity.slug}' must use an absolute browser play path pattern."
        }
        require(module.routes.apiBasePath.startsWith("/api/")) {
            "Game module '${module.identity.slug}' must use an API base path under /api."
        }
        require(module.persistence.migrationNamespace.isNotBlank()) {
            "Game module '${module.identity.slug}' must declare a migration namespace."
        }
        require(module.persistence.platformMetadataFields.isNotEmpty()) {
            "Game module '${module.identity.slug}' must declare platform-owned metadata fields."
        }
        require(module.persistence.opaquePayloadNames.isNotEmpty()) {
            "Game module '${module.identity.slug}' must declare game-owned opaque payloads."
        }
        require(module.smokeCheck.browserEntryPath.startsWith("/")) {
            "Game module '${module.identity.slug}' must use an absolute smoke browser path."
        }
        require(module.smokeCheck.apiEntryPath.startsWith("/api/")) {
            "Game module '${module.identity.slug}' must use an API smoke path under /api."
        }
    }

    private companion object {
        private val slugPattern = Regex("[a-z0-9]+(?:-[a-z0-9]+)*")
    }
}
