# Ravens And Dragons Code Summary

## Overview

`ravens-and-dragons/` is the Ravens and Dragons game module. It owns the game's backend rules and APIs, React frontend, static assets, bots, machine-training pipeline, and game-specific tests.

The parent project has two child projects:

- `ravens-and-dragons/ravens-and-dragons-backend`
- `ravens-and-dragons/ravens-and-dragons-frontend`

## Backend Project

- `ravens-and-dragons/ravens-and-dragons-backend/build.gradle.kts`
  - Kotlin/JVM backend module with Java 21.
  - Depends on `:platform`.
  - Uses Spring web/JDBC, Jackson Kotlin, Flyway, H2, and PostgreSQL.
  - Defines the `train` source set and `runMachineTraining` task.
  - Disables executable `bootJar`/`bootRun` because the runnable app lives in `app/`.
  - Copies generated frontend assets into backend static resources during `processResources`.
- `src/main/kotlin/com/ravensanddragons/game/RavensAndDragonsGameModuleDefinition.kt`
  - Ravens and Dragons implementation of the platform game module contract.
  - Records current `/ravens-and-dragons/create`, `/g/{gameId}`, and `/api/games/{gameSlug}` ownership.
  - Declares the `ravens-and-dragons` migration namespace.
  - Draws the persistence line between platform-owned session metadata fields and game-owned opaque payloads.
- `src/main/kotlin/com/ravensanddragons/game/model/*.kt`
  - Shared game/session DTOs, rule summaries, turn records, undo restore-state models, and game exceptions.
- `src/main/kotlin/com/ravensanddragons/game/rules/*.kt`
  - Canonical board coordinates, rule metadata, snapshot creation, rule-engine contracts, and free-play/trivial/original-style rule execution.
- `src/main/kotlin/com/ravensanddragons/game/session/*.kt`
  - `GameSessionService.kt` owns persisted-game loading, create-payload seeding, broadcasting, emitter lifecycle, and stale cleanup coordination.
  - `GameCommandService.kt` owns command authorization, validation, undo handling, and seat-claim transitions.
  - `GameUserReferenceCleanup.kt` implements the platform cleanup port for account deletion.
- `src/main/kotlin/com/ravensanddragons/game/persistence/*.kt`
  - Game store contracts, JDBC persistence, and game JSON encoding/decoding.
- `src/main/kotlin/com/ravensanddragons/game/web/*.kt`
  - REST/SSE game controller endpoints.
- `src/main/kotlin/com/ravensanddragons/game/bot/*.kt`
  - Bot value types, bot registry, random-index source, and synchronous bot-turn execution plus grouped human-plus-bot undo handling.
- `src/main/kotlin/com/ravensanddragons/game/bot/strategy/*.kt`
  - Strategy/search implementations for `Randall`, `Simon`, `Maxine`, and `Alphie`, plus shared Kotlin-only evaluation and simulation helpers.
- `src/main/kotlin/com/ravensanddragons/game/bot/machine/*.kt`
  - Machine-trained runtime scaffolding for `Michelle`, including artifact loading, registry support, feature encoding, move scoring, and strategy integration.
- `src/train/kotlin/com/ravensanddragons/training`
  - Offline Sherwood self-play, dataset generation, ranking trainer, artifact read/write, evolution loop, and CLI.
- `src/main/resources/db/migration/*.sql`
  - Flyway migrations for the current persistent game and auth schema.
- `src/main/resources/bots/machine-trained/*.json`
  - Bundled per-ruleset machine-trained artifacts. The Sherwood artifact for `Michelle` uses schema version 5.
- `src/main/resources/static/styles.css`
  - App shell layout, header/footer styling, board sizing variables, responsive behavior, fullscreen styling, and board highlight color.

## Frontend Project

- `ravens-and-dragons/ravens-and-dragons-frontend/build.gradle.kts`
  - Frontend build and test project using Gradle-managed Node/npm.
- `src/main/frontend/index.html`
  - Frontend HTML entry for the Vite build.
- `src/main/frontend/App.tsx`
  - Top-level React layout and shell composition.
  - Renders the shared `Ayazian Games` header, scrollable page content area, and footer.
  - Handles auth bootstrap plus switching between login, lobby, profile, and the registered game entry's create/active screens.
- `src/main/frontend/game-entry.ts`
  - Defines the frontend game entry contract used by the app shell.
  - Records game display metadata, create/play route helpers, create/play components, and lifecycle actions needed to open and run a game UI.
- `src/main/frontend/ravens-and-dragons-entry.ts`
  - Registers the current Ravens and Dragons frontend entry.
  - Wires `/{gameSlug}/create`, `/g/{gameId}`, `CreateGameScreen`, `GameScreen`, create-game submission, open-game loading, lobby return cleanup, create-draft state, and SSE lifecycle behavior into the shell contract.
- `src/main/frontend/game-types.ts`
  - Frontend wire types, auth/game DTOs, local create-draft state, and create-game request payload.
- `src/main/frontend/board-geometry.ts`
  - Board coordinate helpers, dimension helpers, center-square helpers, and highlighted-square helpers.
- `src/main/frontend/game-rules-client.ts`
  - Client-side ownership, capture, targeting, and local-selection helpers used by selectors and board rendering.
- `src/main/frontend/move-history.ts`
  - Turn notation and grouped move-history row helpers.
- `src/main/frontend/game-client.ts`
  - REST command helpers, create-game submission, bot assignment, auth requests, and SSE subscription setup.
- `src/main/frontend/components/*.tsx`
  - React components for the lobby, auth panel, local profile screen, active game screen, create screen, seat panel, board, controls, rules panel, move list, and status text.
- `src/main/frontend/features/game/*.ts`
  - Game Redux slice, selectors, thunks, create-draft state, bot-assignment derivation, and stream lifecycle wiring.
- `src/main/frontend/features/auth/*.ts`
  - Auth session slice, selectors, profile state, and guest/local auth thunks.
- `src/main/frontend/features/ui/*.ts`
  - Browser-local UI state such as selected square.
- `src/main/frontend/hooks/*.ts`
  - Browser hooks for responsive board sizing, fullscreen behavior, and game-entry-aware URL route parsing.

## Game Model

The canonical board is represented on the server as `Map<String, Piece>` and on the wire as a JSON object keyed by square name like `e5`.

- `Piece = "dragon" | "raven" | "gold"`
- `Side = "dragons" | "ravens"`
- `Phase = "none" | "move" | "capture"`
- `TurnType = "move" | "gameOver"`

`GameSnapshot` contains board state, board size, special square, phase, active side, pending move, turn history, rule configuration id, and position keys.

`GameSession` wraps the snapshot with id/version/timestamps, lifecycle, undo availability, available rule configurations, selected setup metadata, player seat ids, bot seat ids, and creator id.

Server-only undo history stores compact restore-state entries instead of full snapshots.

## Current Gameplay And UI Behavior

- The create screen sends its drafted setup to `POST /api/games/ravens-and-dragons`.
- The app shell renders Ravens and Dragons through the registered frontend game entry while keeping auth, lobby, profile, header/footer, and fullscreen wiring in the shell.
- The create and active game screens show `Ravens and Dragons` inside the content area. The create screen splits its configuration and board panels evenly on wide screens, while the active game screen places its information panel left of the board and spans its rules panel below the main panels.
- Live games open at `/g/{gameId}`.
- Create flows open at `/ravens-and-dragons/create`.
- Active games send mutations to `POST /api/games/{gameId}/commands`.
- Active games subscribe to `GET /api/games/{gameId}/stream`.
- Request-scoped auth-aware game metadata is loaded from `GET /api/games/{gameId}/view`.
- Seat ownership gates gameplay actions by claimed side and active turn.
- Supported preset games can assign bots to the opposite open seat.
- Undo against a bot reverses one full human-plus-bot exchange when available.

## Tests

- Backend rule tests live under `ravens-and-dragons-backend/src/test/kotlin/com/ravensanddragons/game`.
- Frontend helper and React/Redux tests live under `ravens-and-dragons-frontend/src/test/frontend`.
- `GameRulesTest.kt` verifies backend rule transitions and deterministic Sherwood legal-move generation.
- `GameControllerTest.kt`, `GameCommandControllerTest.kt`, and authorization tests verify game API behavior.
- `BotTurnRunnerTest.kt` verifies bot replies and grouped undo.
- `MachineTrainedBotPhaseOneTest.kt` verifies Michelle artifact validation and legal move selection.
- `BotMatchHarnessTest.kt` is excluded from the default suite and runs through `./gradlew botMatchHarnessTest`.
