# Platform Code Summary

## Overview

`platform/` owns shared service infrastructure used by the runnable app and game modules. It is split into `backend` and `frontend` child projects: the backend is a Kotlin/JVM library rather than the Spring Boot entrypoint, and the frontend publishes the local `@ravensanddragons/platform-frontend` package for browser code shared by multiple frontend game bundles.

## Key Files

- `platform/backend/build.gradle.kts`
  - Kotlin/JVM library project with Java 21.
  - Exposes Spring web, JDBC, security, OAuth client, Jackson Kotlin, and Kotlin reflection dependencies.
  - Configures JUnit Platform tests.
- `platform/build.gradle.kts`
  - Aggregates the platform backend and frontend child projects.
  - Exposes `testBackend`, `testFrontend`, and `test` tasks.
- `platform/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
  - Builds and tests the `@ravensanddragons/platform-frontend` package with Gradle-managed Node/npm.
- `platform/backend/src/main/kotlin/com/ravensanddragons/auth/*.kt`
  - Session auth models and helpers.
  - JDBC-backed user persistence.
  - Guest and local login flows.
  - Optional OAuth login integration.
  - Signed-in user listing for shared player-picking UI.
  - Local-account profile management.
  - Temporary guest-user cleanup hooks.
  - `PlayerAccountValidator` implementation that locks newly added player account rows before game command persistence.
  - `UserReferenceCleanup` port used by game modules to release game-owned references during account deletion.
- `platform/backend/src/main/kotlin/com/ravensanddragons/web/*.kt`
  - Shared web-layer exception handling.
  - Normalizes expected disconnected-client SSE exceptions such as logout-time broken-pipe writes.
- `platform/backend/src/main/kotlin/com/ravensanddragons/AppRoutesController.kt`
  - Shared browser route fallback behavior.
- `platform/backend/src/main/kotlin/com/ravensanddragons/platform/game/GameModuleContract.kt`
  - Platform-owned `GameModuleDefinition` contract.
  - Validating `GameModuleRegistry` for assembled game metadata.
  - Records game identity, slug-derived create routing, the active-game browser route pattern, slugged API entry points, persistence boundary metadata, and smoke-check entry points.
- `platform/backend/src/main/kotlin/com/ravensanddragons/platform/game/runtime/*.kt`
  - Shared opaque game runtime infrastructure.
  - Defines the `GameHandler` port implemented by game modules.
  - Owns generated game ids, persisted game records, public listing metadata, JDBC storage, session locking, stale cleanup, REST/SSE game routing, and generic JSON request/response delegation.
  - Rechecks newly added player-seat user ids through `PlayerAccountValidator` in the command transaction before writing opaque game JSON, so deleted accounts cannot be seated by stale picker data.
  - Exposes public unfinished game listings and signed-in player-game listings/streams, with shared sorting for both list surfaces.
  - Lets game handlers supply display names, open-seat counts, player-seat user ids, current-user turn flags, and normalized client-facing public state without moving game-specific seat rules or legacy payload conversion into platform.
  - Stores game-owned public/private state as JSON without understanding board pieces, sides, captures, rule configurations, bot turns, or undo semantics.
- `platform/backend/src/main/resources/db/migration/*.sql`
  - Flyway migrations for shared auth tables and the game record table used by the platform runtime.
- `platform/frontend`
  - Local npm package `@ravensanddragons/platform-frontend`.
  - Keeps source under `src/main/frontend`, generated package output under `dist`, and frontend tests under `src/test/frontend`.
  - Exports shared auth wire types, auth API helpers, frontend game-entry contracts including generic `GameStartOptions`, the shared player picker, route helpers, and reusable browser shell hooks.
  - Classifies frontend API failures with status-aware request errors plus shared session-expired and server-unavailable browser events used by the shell and game modules.
  - Tests API error classification, OAuth URL building, shared route helpers, and player-picker interaction behavior.
- `platform/docs/game-runtime-api.md`
  - Documents backend game runtime contracts, routes, player-game listing hooks, shared frontend game-entry APIs, player picker usage, and error helper expectations.
- `platform/backend/src/test/kotlin/com/ravensanddragons/platform/game/GameModuleRegistryTest.kt`
  - Verifies registry validation, duplicate slug rejection, and lookup behavior.
- `platform/backend/src/test/kotlin/com/ravensanddragons/web/DisconnectedClientExceptionHandlerTest.kt`
  - Verifies shared disconnected-client exception handling.

## Responsibilities

- Own shared auth/session/account infrastructure.
- Own signed-in user listing and player account existence validation used by game-seat assignment flows.
- Own reusable web exception and route fallback behavior.
- Own the platform side of game module registration.
- Own shared game runtime mechanics that can operate on opaque game-owned JSON state stored as `public_state_json` and `private_state_json`.
- Own platform-level public listing metadata while delegating game-specific listing details to the registered game handler.
- Delegate client-facing public game payload normalization to the registered game handler before generic game reads and initial stream snapshots leave the runtime.
- Own frontend shell/auth contracts and status-aware API helpers that are not tied to a specific game's pieces, rules, or UI.
- Define small ports for game-owned cleanup or adapter behavior where shared services need to call into game modules.

## Boundaries

`platform/` should not own Ravens and Dragons board rules, bot logic, command semantics, snapshot structure, undo payload structure, frontend components, or visual assets. Game-specific concepts should stay in `ravens-and-dragons/` unless a second concrete game proves a shared abstraction is needed.
