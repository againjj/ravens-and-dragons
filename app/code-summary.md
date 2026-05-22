# App Code Summary

## Overview

`app/` owns the runnable Spring Boot application and deployed browser shell that assemble the platform project and the included game modules into one deployable service. It produces the executable jar used locally and on Railway.

The app keeps the included-game list declarative by registering each game module through the shared platform contract and letting the game module provide its own slug-derived routes and metadata. Each game is expected to live in its own sub-project.

## Key Files

- `app/build.gradle.kts`
  - Applies Spring Boot and Kotlin plugins.
  - Depends directly on `:platform`, `:clicker:clicker-backend`, and `:ravens-and-dragons:ravens-and-dragons-backend`.
  - Configures Java 21 for Kotlin, JavaExec, and tests.
  - Copies the app-owned Vite frontend bundle from `:app:app-frontend` into Spring Boot static resources during `processResources`.
  - Applies `app/local-env.gradle.kts` so `bootRun` works from the repository root and local env loading stays isolated.
  - Names the executable jar `ravens-and-dragons.jar`.
- `app/local-env.gradle.kts`
  - Loads standard dotenv `KEY=value` entries from root `.env.local` into the local `bootRun` process when present.
  - Adds `testLocalEnvParser` coverage for `.env.local` parsing and runs it before `:app:test`.
- `app/app-frontend/build.gradle.kts`
  - Builds and tests the deployed React shell with Gradle-managed Node/npm.
  - Produces the static frontend bundle consumed by `app:processResources`.
- `app/app-frontend/src/main/frontend/App.tsx`
  - Owns the shared browser shell, auth bootstrap, lobby/profile/login routing, public game list loading, signed-in user menu/player-game stream wiring, fullscreen action, and game-entry selection for create/play screens.
  - Classifies shell-level async failures so expired sessions redirect to login, server/network failures show a server-unavailable dialog, and failed lobby/menu loads are not silently rendered as empty lists.
  - Registers the Clicker and Ravens and Dragons frontend entries for the lobby.
- `app/app-frontend/src/main/frontend/features/playerGames/playerGamesClient.ts`
  - Loads the signed-in user's unfinished seated games and opens the player-game SSE stream used by the header menu turn badges after the initial list load succeeds.
  - Closes the player-game stream on errors so the browser does not keep retrying while the server is down; the stream is reopened only by a later user action or auth/session change.
- `app/app-frontend/src/main/frontend/app/store.ts`
  - Assembles the Redux store from app-owned auth state plus the registered game frontend reducers.
- `app/app-frontend/src/main/frontend/features/auth/*.ts`
  - Owns browser auth state, auth thunks, local profile state, and selectors used by the app shell.
- `app/src/main/kotlin/com/ravensanddragons/RavensAndDragonsApplication.kt`
  - Spring Boot entrypoint.
  - Enables scheduling.
  - Provides the UTC `Clock` bean.
  - Provides the `GameModuleRegistry` bean that currently registers `ClickerGameModuleDefinition` and `RavensAndDragonsGameModuleDefinition`.
  - Derives `staleGameCleanupDelay` from `platform.games.stale-threshold`, with the previous Ravens-branded property still accepted by the platform runtime as a fallback.
- `app/src/test/kotlin/com/ravensanddragons/RavensAndDragonsApplicationTests.kt`
  - Verifies the Spring application context loads.
  - Verifies default servlet session timeout and stale cleanup delay.
  - Verifies the assembled app registers the Clicker and Ravens and Dragons game modules with the expected routes and persistence boundary metadata.
- `:app:testLocalEnvParser`
  - Verifies the `bootRun` `.env.local` parser handles standard dotenv `KEY=value` entries, quoted values, unquoted values, comments, blank lines, missing files, and fails unsupported syntax.

## Responsibilities

- Assemble the deployable app from platform and selected game modules.
- Own the deployed frontend shell and static asset packaging.
- Own top-level application beans and deployment jar packaging.
- Keep `:app:test` focused on assembled-service wiring and context behavior.
- Keep `:app:app-frontend:test` focused on shell, auth, lobby, profile, and route behavior.
- Limit app-level game wiring to registering each included game module once.
- Leave game-specific behavior to game modules and shared infrastructure to `platform/`.

## Runtime Notes

- Running `./gradlew bootRun` serves the Vite-built frontend bundle plus static CSS through Spring Boot and loads standard dotenv `KEY=value` entries from `.env.local` in the repository root when present.
- `server.port` defaults to `8080` unless overridden by `PORT`.
- Railway deployment starts `ravens-and-dragons.jar`.
- The lobby can open a selected public game or a typed game id; public game rows use per-row gradients with a darker selected state, and missing typed ids report feedback without navigating away from the lobby.
- The shared app header keeps the `Ayazian Games` title visually unchanged while linking it back to `/lobby` after login, leaves it inert on the login page, and turns the signed-in username into a menu containing profile/lobby/game/logout navigation plus live turn badges.
- The browser tab title uses `Ayazian Games` for the lobby and loading states, then adds route-specific specifiers for login, profile, create flows, and live games.
- Navigating to the lobby from the header/menu rechecks auth so stale client sessions redirect to login instead of showing an empty lobby.
