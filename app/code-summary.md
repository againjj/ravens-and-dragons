# App Code Summary

## Overview

`app/` owns the runnable Spring Boot application that assembles the platform project and the included game modules into one deployable service. It produces the executable jar used locally and on Railway.

The app keeps the included-game list declarative by registering each game module through the shared platform contract and letting the game module provide its own slug-derived routes and metadata.

## Key Files

- `app/build.gradle.kts`
  - Applies Spring Boot and Kotlin plugins.
  - Depends directly on `:platform` and `:ravens-and-dragons:ravens-and-dragons-backend`.
  - Configures Java 21 for Kotlin, JavaExec, and tests.
  - Keeps `bootRun` working from the repository root.
  - Names the executable jar `ravens-and-dragons.jar`.
- `app/src/main/kotlin/com/ravensanddragons/RavensAndDragonsApplication.kt`
  - Spring Boot entrypoint.
  - Enables scheduling.
  - Provides the UTC `Clock` bean.
  - Provides the `GameModuleRegistry` bean that currently registers `RavensAndDragonsGameModuleDefinition`.
  - Derives `staleGameCleanupDelay` from `ravens-and-dragons.games.stale-threshold`.
- `app/src/test/kotlin/com/ravensanddragons/RavensAndDragonsApplicationTests.kt`
  - Verifies the Spring application context loads.
  - Verifies default servlet session timeout and stale cleanup delay.
  - Verifies the assembled app registers the Ravens and Dragons game module with the expected routes and persistence boundary metadata.

## Responsibilities

- Assemble the deployable app from platform and selected game modules.
- Own top-level application beans and deployment jar packaging.
- Keep `:app:test` focused on assembled-service wiring and context behavior.
- Limit app-level game wiring to registering each included game module once.
- Leave game-specific behavior to game modules and shared infrastructure to `platform/`.

## Runtime Notes

- Running `./gradlew bootRun` serves the Vite-built frontend bundle plus static CSS through Spring Boot.
- `server.port` defaults to `8080` unless overridden by `PORT`.
- Railway deployment starts `ravens-and-dragons.jar`.
