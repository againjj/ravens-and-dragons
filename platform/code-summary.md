# Platform Code Summary

## Overview

`platform/` owns shared service infrastructure used by the runnable app and game modules. It is a Kotlin/JVM library project, not the Spring Boot entrypoint. It also publishes the local `@ravensanddragons/platform-frontend` package for browser code that is shared by multiple frontend game bundles.

## Key Files

- `platform/build.gradle.kts`
  - Kotlin/JVM library project with Java 21.
  - Exposes Spring web, JDBC, security, OAuth client, Jackson Kotlin, and Kotlin reflection dependencies.
  - Configures JUnit Platform tests.
- `platform/src/main/kotlin/com/ravensanddragons/auth/*.kt`
  - Session auth models and helpers.
  - JDBC-backed user persistence.
  - Guest and local login flows.
  - Optional OAuth login integration.
  - Local-account profile management.
  - Temporary guest-user cleanup hooks.
  - `UserReferenceCleanup` port used by game modules to release game-owned references during account deletion.
- `platform/src/main/kotlin/com/ravensanddragons/web/*.kt`
  - Shared web-layer exception handling.
  - Normalizes expected disconnected-client SSE exceptions such as logout-time broken-pipe writes.
- `platform/src/main/kotlin/com/ravensanddragons/AppRoutesController.kt`
  - Shared browser route fallback behavior.
- `platform/src/main/kotlin/com/ravensanddragons/platform/game/GameModuleContract.kt`
  - Platform-owned `GameModuleDefinition` contract.
  - Validating `GameModuleRegistry` for assembled game metadata.
  - Records game identity, slug-derived create routing, the active-game browser route pattern, slugged API entry points, persistence boundary metadata, and smoke-check entry points.
- `platform/src/main/kotlin/com/ravensanddragons/platform/game/runtime/*.kt`
  - Shared opaque game runtime infrastructure.
  - Defines the `GameHandler` port implemented by game modules.
  - Owns generated game ids, persisted game records, public listing metadata, JDBC storage, session locking, stale cleanup, REST/SSE game routing, and generic JSON request/response delegation.
  - Exposes public unfinished game listings and signed-in player-game listings/streams, with shared sorting for both list surfaces.
  - Lets game handlers supply display names, open-seat counts, player-seat user ids, current-user turn flags, and normalized client-facing public state without moving game-specific seat rules or legacy payload conversion into platform.
  - Stores game-owned public/private state as JSON without understanding board pieces, sides, captures, rule configurations, bot turns, or undo semantics.
- `platform/src/main/resources/db/migration/*.sql`
  - Flyway migrations for shared auth tables and the game record table used by the platform runtime.
- `platform/frontend`
  - Local npm package `@ravensanddragons/platform-frontend`.
  - Exports shared auth wire types, auth API helpers, frontend game-entry contracts, route helpers, and reusable browser shell hooks.
- `platform/src/test/kotlin/com/ravensanddragons/platform/game/GameModuleRegistryTest.kt`
  - Verifies registry validation, duplicate slug rejection, and lookup behavior.
- `platform/src/test/kotlin/com/ravensanddragons/web/DisconnectedClientExceptionHandlerTest.kt`
  - Verifies shared disconnected-client exception handling.

## Responsibilities

- Own shared auth/session/account infrastructure.
- Own reusable web exception and route fallback behavior.
- Own the platform side of game module registration.
- Own shared game runtime mechanics that can operate on opaque game-owned JSON state stored as `public_state_json` and `private_state_json`.
- Own platform-level public listing metadata while delegating game-specific listing details to the registered game handler.
- Delegate client-facing public game payload normalization to the registered game handler before generic game reads and initial stream snapshots leave the runtime.
- Own frontend shell/auth contracts that are not tied to a specific game's pieces, rules, or UI.
- Define small ports for game-owned cleanup or adapter behavior where shared services need to call into game modules.

## Boundaries

`platform/` should not own Ravens and Dragons board rules, bot logic, command semantics, snapshot structure, undo payload structure, frontend components, or visual assets. Game-specific concepts should stay in `ravens-and-dragons/` unless a second concrete game proves a shared abstraction is needed.
