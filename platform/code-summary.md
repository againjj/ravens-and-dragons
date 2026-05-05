# Platform Code Summary

## Overview

`platform/` owns shared service infrastructure used by the runnable app and game modules. It is a Kotlin/JVM library project, not the Spring Boot entrypoint.

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
- `platform/src/test/kotlin/com/ravensanddragons/platform/game/GameModuleRegistryTest.kt`
  - Verifies registry validation, duplicate slug rejection, and lookup behavior.
- `platform/src/test/kotlin/com/ravensanddragons/web/DisconnectedClientExceptionHandlerTest.kt`
  - Verifies shared disconnected-client exception handling.

## Responsibilities

- Own shared auth/session/account infrastructure.
- Own reusable web exception and route fallback behavior.
- Own the platform side of game module registration.
- Define small ports for game-owned cleanup or adapter behavior where shared services need to call into game modules.

## Boundaries

`platform/` should not own Ravens and Dragons board rules, bot logic, command semantics, snapshot JSON, undo payloads, frontend components, or visual assets. Game-specific concepts should stay in `ravens-and-dragons/` unless a second concrete game proves a shared abstraction is needed.
