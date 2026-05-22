# Code Summary

## Overview

This repository is a Spring Boot 3.3 + Kotlin 2.1 service that hosts browser-based games. It is organized as a Gradle multi-project build with four top-level projects:

- `app/`: runnable Spring Boot application, deployed frontend shell, and deployable jar assembly.
- `platform/`: shared service infrastructure such as auth, web error handling, route fallback, the game module contract, and shared frontend package code.
- `clicker/`: the Clicker game module, including backend counter rules/API handling and frontend create/play UI.
- `ravens-and-dragons/`: the Ravens and Dragons game module, including backend rules/APIs, frontend UI, bots, machine training, assets, and tests.

The backend supports multiple persisted game sessions addressed by game id and broadcasts live updates over server-sent events per game. The frontend opens on a lobby, can route into `/{gameSlug}/create` for a local draft setup flow, and opens live games at `/g/{gameId}`. Game creation now posts through a slugged API path so the hosting service can distinguish the game type from the session id.
Games can be marked as publicly listed at creation time. Publicly listed unfinished games appear in the lobby join panel through a shared platform listing endpoint. Signed-in users can also load and stream the unfinished games where they have a seat so the app header can show turn-aware navigation across browser windows.
The platform auth surface exposes signed-in player summaries for shared player pickers, and the game runtime verifies newly added player-seat account ids inside the command persistence transaction before writing game state.

The runnable app now assembles Ravens and Dragons through a platform-owned game module contract and opaque game runtime. Platform owns generic game ids, persistence, REST/SSE routing, stale cleanup, and handler dispatch. Game handlers supply client-facing public state for generic game reads and initial stream snapshots so a module can normalize older persisted payloads before the frontend resolves the game entry. Ravens and Dragons owns every Ravens-shaped concept, including board pieces, sides, snapshots, command semantics, undo payloads, bot turns, and game-view metadata.

The repository is structured so each game lives in its own sub-project. The current checkout contains two game modules, Clicker and Ravens and Dragons, and the app registers each module explicitly.

The React app shell now lives under `app/app-frontend` and renders Clicker and Ravens and Dragons through a frontend game entry contract supplied by the shared `@ravensanddragons/platform-frontend` package. The package also owns shared auth wire types, auth API helpers, and browser shell hooks that future frontend game bundles can reuse.
Frontend API helpers classify unauthorized, domain, and network/server failures so shell and game surfaces can redirect expired sessions to login, show server-down notices, and avoid silently replacing failed loads with empty lists. Live SSE streams are closed on errors; menu and game streams wait for a later user action or reload before reconnecting instead of polling the server while it is down.

## Project Files

- `settings.gradle.kts`
  - Includes `:platform`, `:clicker`, `:clicker:clicker-backend`, `:clicker:clicker-frontend`, `:ravens-and-dragons`, `:ravens-and-dragons:ravens-and-dragons-backend`, `:ravens-and-dragons:ravens-and-dragons-frontend`, `:app`, and `:app:app-frontend`.
- `build.gradle.kts`
  - Owns shared plugin versions, repositories, aggregate lifecycle tasks, root convenience tasks, and deployment-facing jar copy behavior.
- `app/local-env.gradle.kts`
  - Owns local `.env.local` parsing for `bootRun` and the parser verification task.
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
  - Runs the assembled Spring Boot app from `app/`, loading `.env.local` into the local app process when the file exists.
- `./gradlew testBackend`
  - Runs backend/JVM tests across backend-capable projects.
- `./gradlew testFrontend`
  - Runs frontend tests across frontend-capable projects.
- `./gradlew test`
  - Runs the aggregate backend and frontend suites, including app build-script coverage for local `.env.local` parsing.
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
  - `/{gameSlug}/create`: create route for the selected game identity.
  - `/profile`: local-account profile route.
  - `/g/{gameId}`: live game route.
- Auth endpoints live under `/api/auth`.
- Game creation uses `POST /api/games/{gameSlug}`.
- Game reads use `GET /api/games/{gameId}` and `GET /api/games/{gameId}/view`.
- Public unfinished games use `GET /api/games/public`.
- Signed-in player game navigation uses `GET /api/games/mine` and live menu updates use `GET /api/games/mine/stream`.
- Game commands use `POST /api/games/{gameId}/commands`.
- Clicker commands increment the shared counter until the game reaches `10`.
- Seat and bot actions are Ravens command types sent through the command endpoint. Ravens uses a platform-owned player picker to add the current user, another existing player, or a legal bot opponent to open seats.
- Live updates use `GET /api/games/{gameId}/stream`.

Games persist in the configured database, so clients can reopen the same game after server restart. SSE fanout remains in memory per app instance, and frontend streams close on connection errors rather than retrying automatically.

The shared browser chrome keeps the `Ayazian Games` header title linked back to the lobby after login, renders route-specific browser tab titles under the `Ayazian Games` brand, renders the signed-in username as a turn-aware menu, uses compact button/dropdown styling, styles public lobby game-list rows with per-row gradients and a darker selected row, and switches the phone layout breakpoint at 500px.

## Runtime Configuration

- `server.port` reads `${PORT:8080}`.
- `spring.datasource.*` defaults to a local H2 file database and may be overridden for PostgreSQL deploys.
- `server.servlet.session.timeout` defaults to `2h`.
- `platform.games.stale-threshold` defaults to `1008h`; the previous `ravens-and-dragons.games.stale-threshold` property is still accepted as a fallback.
- The stale cleanup delay is derived as one tenth of the stale threshold.
- Optional Google OAuth appears only when Spring OAuth Google client registration environment variables are configured.
- Railway deploys run the Spring Boot fat jar named `ravens-and-dragons.jar`.
- Local `bootRun` loads standard dotenv-style `KEY=value` entries from `.env.local` in the repository root when the file exists and fails on unsupported syntax; packaged jars and deployment startup continue to use their ambient process environment.

## Project Summaries

Read these before changing the corresponding project:

- `app/AGENTS.md` and `app/code-summary.md`
- `clicker/AGENTS.md` and `clicker/code-summary.md`
- `platform/AGENTS.md` and `platform/code-summary.md`
- `ravens-and-dragons/AGENTS.md` and `ravens-and-dragons/code-summary.md`
