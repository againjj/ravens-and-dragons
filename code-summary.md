# Code Summary

## Overview

This repository is a Spring Boot 3.3 + Kotlin 2.1 service that hosts browser-based games. It is organized as a Gradle multi-project build with five top-level projects:

- `app/`: parent project for the runnable Spring Boot backend, deployed frontend shell, and deployable jar assembly.
- `platform/`: parent project for shared service infrastructure such as auth, web error handling, route fallback, the game module contract, and shared frontend package code.
- `tic-tac-toe/`: the Tic-Tac-Toe game module, including backend 3x3 board rules/API handling and frontend create/play UI.
- `gin-rummy/`: the Gin Rummy game module, including backend card rules/scoring/API handling and frontend create/play UI.
- `ravens-and-dragons/`: the Ravens and Dragons game module, including backend rules/APIs, frontend UI, bots, machine training, assets, and tests.

The backend supports multiple persisted game sessions addressed by game id and broadcasts live updates over server-sent events per game. The frontend opens on a lobby, can route into `/{gameSlug}/create` for a local draft setup flow, and opens live games at `/g/{gameId}`. Game creation now posts through a slugged API path so the hosting service can distinguish the game type from the session id.
Games can be marked as publicly listed at creation time. Publicly listed unfinished games appear in the lobby join panel through a shared platform listing endpoint. Signed-in users can also load and stream the unfinished games where they have a seat so the app header can show turn-aware navigation across browser windows.
The platform auth surface exposes signed-in player summaries for shared player pickers, and the game runtime verifies newly added player-seat account ids inside the command persistence transaction before writing game state.

The runnable app now assembles Ravens and Dragons through a platform-owned game module contract and opaque game runtime. Platform owns generic game ids, persistence, REST/SSE routing, stale cleanup, and handler dispatch. Game handlers supply client-facing public state for generic game reads and initial stream snapshots so a module can normalize older persisted payloads before the frontend resolves the game entry. Ravens and Dragons owns every Ravens-shaped concept, including board pieces, sides, snapshots, command semantics, undo payloads, bot turns, and game-view metadata.
Command-triggered game and player-list stream events are sent after the database transaction commits. Game handlers can mark parts of a command result as command-only public state, so immediate command responses and SSE events may include transient details while later reads load the persisted state without them. Game handlers can also schedule post-commit follow-up work through the runtime; Ravens and Dragons uses this to return the human command state immediately and then persist/broadcast bot replies separately. Follow-up work computes outside the per-game lock and stale follow-up results are discarded if another command updates the game first.

The repository is structured so each game lives in its own sub-project. The current checkout contains three game modules, Tic-Tac-Toe, Gin Rummy, and Ravens and Dragons, and the app registers each module explicitly.

The React app shell now lives under `app/frontend` and renders Tic-Tac-Toe, Gin Rummy, and Ravens and Dragons through a frontend game entry contract supplied by the shared `@ravensanddragons/platform-frontend` package. The package also owns shared auth wire types, auth API helpers, browser shell hooks, and generic create-option typing that future frontend game bundles can reuse.
Frontend API helpers classify unauthorized, domain, and network/server failures so shell and game surfaces can redirect expired sessions to login, show server-down notices, and avoid silently replacing failed loads with empty lists. Live SSE streams are closed on errors; menu and game streams wait for a later user action or reload before reconnecting instead of polling the server while it is down.

## Project Files

- `settings.gradle.kts`
  - Includes `:platform`, `:platform:backend`, `:platform:frontend`, `:tic-tac-toe`, `:tic-tac-toe:backend`, `:tic-tac-toe:frontend`, `:gin-rummy`, `:gin-rummy:backend`, `:gin-rummy:frontend`, `:ravens-and-dragons`, `:ravens-and-dragons:backend`, `:ravens-and-dragons:frontend`, `:app`, `:app:backend`, and `:app:frontend`.
- `build.gradle.kts`
  - Owns shared plugin versions, repositories, aggregate lifecycle tasks, root convenience tasks, and deployment-facing jar copy behavior.
  - Gives subproject jar artifacts path-derived names so the assembled Spring Boot jar can include multiple `backend` modules without duplicate `BOOT-INF/lib` entries.
- `buildSrc/src/main/kotlin/FrontendProjectConventionPlugin.kt`
  - Owns the shared Gradle convention for frontend Node/npm setup, `buildFrontend`, `test`, common inputs, and verification wiring.
- `gradle/paired-project.gradle.kts`
  - Owns the shared Gradle convention for parent projects with `backend` and `frontend` children, including `testBackend`, `testFrontend`, `test`, and `check` wiring.
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
- `docs/adding-a-new-game.md`
  - Canonical implementation guide for adding a new top-level game module without reading existing game implementations.
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
  - `/profile`: local/OAuth account profile route.
  - `/g/{gameId}`: live game route.
- Auth endpoints live under `/api/auth`.
- Game creation uses `POST /api/games/{gameSlug}`.
- Game reads use `GET /api/games/{gameId}` and `GET /api/games/{gameId}/view`.
- Public unfinished games use `GET /api/games/public`.
- Signed-in player game navigation uses `GET /api/games/mine` and live menu updates use `GET /api/games/mine/stream`.
- Game commands use `POST /api/games/{gameId}/commands`.
- Tic-Tac-Toe commands place alternating X/O marks on an empty 3x3 square until a row, column, diagonal, or draw finishes the game.
- Gin Rummy commands claim human seats, reveal the dealer on the first seated player, draw/pass/discard, reorder hands, knock, gin, big gin, and advance immediately dealt alternating-dealer hands/games/matches while scoring with configured bonuses and sending the just-completed hand result as transient command/stream state for browser-local popups. Gin Rummy public state also exposes the discard card below the top card so the frontend can keep the discard pile visually accurate while the top discard is being dragged.
- Seat and bot actions are Ravens command types sent through the command endpoint. Ravens uses a platform-owned player picker to add the current user, another existing player, or a legal bot opponent to open seats.
- Live updates use `GET /api/games/{gameId}/stream`.

Games persist in the configured database, so clients can reopen the same game after server restart. SSE fanout remains in memory per app instance, and frontend streams close on connection errors rather than retrying automatically.

The shared browser chrome keeps an `Ayazian Games` logo linked back to the lobby after login, renders route-specific browser tab titles under the `Ayazian Games` brand, keeps the signed-in display name as plain text, and exposes profile/lobby/game/logout navigation through a turn-aware hamburger menu beside the header brand. App-owned bundled styles keep compact button/dropdown styling, public lobby game-list row gradients with a darker selected row, and the shared 500px phone layout breakpoint; game modules own their detailed game-specific UI styling.

## Runtime Configuration

- `server.port` reads `${PORT:8080}`.
- `spring.datasource.*` defaults to a local H2 file database and may be overridden for PostgreSQL deploys.
- `server.servlet.session.timeout` defaults to `2h`.
- `platform.games.stale-threshold` defaults to `1008h`; the previous `ravens-and-dragons.games.stale-threshold` property is still accepted as a fallback.
- The stale cleanup delay is derived as one tenth of the stale threshold.
- Optional Google OAuth appears only when Spring OAuth Google client registration environment variables are configured.
- Railway deploys run the Spring Boot fat jar named `ravens-and-dragons.jar`.
- Local `bootRun` loads standard dotenv-style `KEY=value` entries from `.env.local` in the repository root when the file exists and fails on unsupported syntax; packaged jars and deployment startup continue to use their ambient process environment.
- Railway startup supplies default JVM memory flags through `JAVA_TOOL_OPTIONS`: a small initial/minimum heap, an 80% container-relative max heap, G1 GC, and periodic concurrent idle GC so the app can reclaim quiet-period heap while still growing during bot-search bursts.

## Project Summaries

Read these before changing the corresponding project:

- `app/AGENTS.md` and `app/code-summary.md`
- `tic-tac-toe/AGENTS.md` and `tic-tac-toe/code-summary.md`
- `gin-rummy/AGENTS.md` and `gin-rummy/code-summary.md`
- `platform/AGENTS.md` and `platform/code-summary.md`
- `ravens-and-dragons/AGENTS.md` and `ravens-and-dragons/code-summary.md`
