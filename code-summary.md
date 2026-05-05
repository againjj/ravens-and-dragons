# Code Summary

## Overview

This repository is a Spring Boot 3.3 + Kotlin 2.1 service that hosts a browser-based Ravens and Dragons board game. It is organized as a Gradle multi-project build with three top-level projects:

- `app/`: runnable Spring Boot application and deployable jar assembly.
- `platform/`: shared service infrastructure such as auth, web error handling, route fallback, and the game module contract.
- `ravens-and-dragons/`: the Ravens and Dragons game module, including backend rules/APIs, frontend UI, bots, machine training, assets, and tests.

The backend supports multiple persisted game sessions addressed by game id and broadcasts live updates over server-sent events per game. The frontend opens on a lobby, can route into `/{gameSlug}/create` for a local draft setup flow, and opens live games at `/g/{gameId}`. Game creation now posts through a slugged API path so the hosting service can distinguish the game type from the session id.

The runnable app now assembles Ravens and Dragons through a platform-owned game module contract. That contract records current browser/API route ownership, the Ravens and Dragons migration namespace, and the boundary between platform-owned session metadata and game-owned opaque payloads.

The React app shell renders Ravens and Dragons through a frontend game entry contract that supplies display metadata, create/play route helpers, create/play components, and lifecycle actions for the current single-game bundle.

## Project Files

- `settings.gradle.kts`
  - Includes `:platform`, `:ravens-and-dragons`, `:ravens-and-dragons:ravens-and-dragons-backend`, `:ravens-and-dragons:ravens-and-dragons-frontend`, and `:app`.
- `build.gradle.kts`
  - Owns shared plugin versions, repositories, aggregate lifecycle tasks, root convenience tasks, and deployment-facing jar copy behavior.
- `AGENTS.md`
  - Repository-wide agent instructions.
- `code-summary.md`
  - Repository-wide architecture, build, and runtime summary.
- `docs/todo.md`
  - Canonical list of planned work that is not being implemented immediately.
- `docs/multi-game-service-structure-plan.md`
  - Staged plan for evolving the app into a multi-game service with top-level game modules.
- `docs/profiling-runbook.md`
  - Local memory-profiling workflow.
- `docs/machine-training-runbook.md`
  - Human-facing workflow for the current Michelle machine-training pipeline.
- `docs/machine-trained-bot-improvements.md`
  - Planning notes for improving the evolved Michelle bot.

## Build And Test Flow

- `./gradlew bootRun`
  - Runs the assembled Spring Boot app from `app/`.
- `./gradlew testBackend`
  - Runs backend/JVM tests across backend-capable projects.
- `./gradlew testFrontend`
  - Runs frontend tests across frontend-capable projects.
- `./gradlew test`
  - Runs the aggregate backend and frontend suites.
- `./gradlew check`
  - Runs the full default verification suite plus packaging checks.
- `./gradlew botMatchHarnessTest`
  - Runs the long bot-vs-bot soak harness outside the default test suite.
- `./gradlew runMachineTraining`
  - Runs the offline machine-training CLI for Michelle artifacts.

The Gradle wrapper is pinned to Gradle 9.4.1. Java 21 is the project toolchain. Node/npm for the frontend are managed through Gradle.

## Runtime Flow

- Browser routes:
  - `/`: lobby redirect/entry.
  - `/login`: auth entry with `next` redirect support.
  - `/lobby`: lobby screen.
  - `/{gameSlug}/create`: local draft-create route for the selected game identity.
  - `/profile`: local-account profile route.
  - `/g/{gameId}`: live Ravens and Dragons game route.
- Auth endpoints live under `/api/auth`.
- Game creation uses `POST /api/games/{gameSlug}`.
- Game reads use `GET /api/games/{gameId}` and `GET /api/games/{gameId}/view`.
- Game commands use `POST /api/games/{gameId}/commands`.
- Seat and bot actions use dedicated game endpoints.
- Live updates use `GET /api/games/{gameId}/stream`.

Games persist in the configured database, so clients can reopen the same game after server restart. SSE fanout remains in memory per app instance.

## Runtime Configuration

- `server.port` reads `${PORT:8080}`.
- `spring.datasource.*` defaults to a local H2 file database and may be overridden for PostgreSQL deploys.
- `server.servlet.session.timeout` defaults to `2h`.
- `ravens-and-dragons.games.stale-threshold` defaults to `1008h`.
- The stale cleanup delay is derived as one tenth of the stale threshold.
- Optional Google OAuth appears only when Spring OAuth Google client registration environment variables are configured.
- Railway deploys run the Spring Boot fat jar named `ravens-and-dragons.jar`.

## Project Summaries

Read these before changing the corresponding project:

- `app/AGENTS.md` and `app/code-summary.md`
- `platform/AGENTS.md` and `platform/code-summary.md`
- `ravens-and-dragons/AGENTS.md` and `ravens-and-dragons/code-summary.md`
