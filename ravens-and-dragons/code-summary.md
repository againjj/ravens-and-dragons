# Ravens And Dragons Code Summary

## Overview

`ravens-and-dragons/` is the Ravens and Dragons game module. It owns the game's backend rules and APIs, React frontend, static assets, bots, machine-training pipeline, and game-specific tests.
It is intentionally a single-game sub-project rather than a shared home for multiple games.

The parent project has two child projects:

- `ravens-and-dragons/backend`
- `ravens-and-dragons/frontend`

## Backend Project

- `ravens-and-dragons/backend/build.gradle.kts`
  - Kotlin/JVM backend module with Java 21.
  - Depends on `:platform:backend`.
  - Uses Spring web/JDBC, Jackson Kotlin, Flyway, H2, and PostgreSQL.
  - Defines the `train` source set and `runMachineTraining` task.
  - Disables executable `bootJar`/`bootRun` because the runnable app lives in `app/`.
  - Leaves deployed frontend asset packaging to `app/`; this backend jar contains Ravens backend code and resources only.
- `src/main/kotlin/com/ravensanddragons/game/RavensAndDragonsGameModuleDefinition.kt`
  - Ravens and Dragons implementation of the platform game module contract.
  - Records current `/ravens-and-dragons/create`, `/g/{gameId}`, and `/api/games/{gameSlug}` ownership.
  - Declares the `ravens-and-dragons` migration namespace.
  - Draws the persistence line between platform-owned session metadata fields and game-owned opaque payloads.
- `src/main/kotlin/com/ravensanddragons/game/model/*.kt`
  - Ravens and Dragons game/session DTOs, board pieces, sides, phases, rule summaries, turn records, undo restore-state models, and Ravens command/view request models.
- `src/main/kotlin/com/ravensanddragons/game/RavensAndDragonsGameHandler.kt`
  - Implements the platform `GameHandler` port for Ravens and Dragons.
  - Converts opaque platform JSON records into Ravens `GameSession` plus undo state, delegates create/command/view behavior to Ravens services, schedules post-commit bot replies, and serializes Ravens-owned public/private state back into the platform record.
  - Normalizes legacy snapshot-only public payloads into full `GameSession` responses for generic game reads and initial stream snapshots, allowing older persisted Ravens games to reopen through the current multi-game shell.
  - Supplies public-listing display data, including open Ravens/Dragons seat counts, while preserving platform-owned listing flags on game updates.
  - Supplies player-game menu data for signed-in users by reporting seated users and whether the active side belongs to the current user.
- `src/main/kotlin/com/ravensanddragons/game/rules/*.kt`
  - Canonical board coordinates, rule metadata, snapshot creation, rule-engine contracts, and free-play/trivial/original-style rule execution.
- `src/main/kotlin/com/ravensanddragons/game/session/*.kt`
  - `GameCommandService.kt` owns command authorization, validation, undo handling, seat-claim transitions, explicit player-seat assignment, and bot-opponent assignment rules.
  - `GameUserReferenceCleanup.kt` implements the platform cleanup port for account deletion.
- `src/main/kotlin/com/ravensanddragons/game/persistence/*.kt`
  - Ravens-owned stored-game state envelope and Ravens JSON encoding/decoding.
- `src/main/kotlin/com/ravensanddragons/game/bot/*.kt`
  - Bot value types, bot registry, random-index source, and synchronous bot-turn execution plus grouped human-plus-bot undo handling.
- `src/main/kotlin/com/ravensanddragons/game/bot/strategy/*.kt`
  - Strategy/search implementations for `Randall`, `Simon`, `Maxine`, and `Alphie`, plus shared Kotlin-only evaluation and simulation helpers.
- `src/main/kotlin/com/ravensanddragons/game/bot/machine/*.kt`
  - Machine-trained runtime scaffolding for `Michelle`, including artifact loading, registry support, feature encoding, move scoring, and strategy integration.
- `src/train/kotlin/com/ravensanddragons/training`
  - Offline Sherwood self-play, dataset generation, ranking trainer, artifact read/write, evolution loop, and CLI.
- `src/main/resources/bots/machine-trained/*.json`
  - Bundled per-ruleset machine-trained artifacts. The Sherwood artifact for `Michelle` uses schema version 5.

## Frontend Project

- `ravens-and-dragons/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
  - Frontend build and test project using Gradle-managed Node/npm.
  - Depends on the local `@ravensanddragons/platform-frontend` package for shared frontend contracts and auth/browser helpers.
  - Typechecks the Ravens frontend package; the deployed browser shell and Vite bundle now live under `app/frontend`.
- `src/main/frontend/ravens-and-dragons-entry.ts`
  - Registers the current Ravens and Dragons frontend package entry.
  - Wires `/{gameSlug}/create`, `/g/{gameId}`, `CreateGameScreen`, `GameScreen`, create-game submission, open-game loading, lobby return cleanup, create-draft state, and SSE lifecycle behavior into the shell contract.
- `src/main/frontend/app-integration.ts`
  - Exposes the Ravens reducers, initial state, selectors, thunks, and wire types that the app shell needs without deep relative imports into the game source tree.
- `src/main/frontend/frontend-state.ts`
  - Defines the host state and typed hooks needed by Ravens components without importing the app shell back into the game package.
- `src/main/frontend/game-types.ts`
  - Ravens and Dragons frontend wire types, game DTOs, local create-draft state, and create-game request payload.
- `src/main/frontend/board-geometry.ts`
  - Board coordinate helpers, dimension helpers, center-square helpers, and highlighted-square helpers.
- `src/main/frontend/game-rules-client.ts`
  - Client-side ownership, capture, targeting, and local-selection helpers used by selectors and board rendering.
- `src/main/frontend/move-history.ts`
  - Turn notation and grouped move-history row helpers.
- `src/main/frontend/game-client.ts`
  - Ravens and Dragons game REST command helpers, create-game submission, player and bot assignment, SSE subscription setup, and compatibility re-exports for shared auth API helpers.
  - Preserves HTTP status information for load/create/view failures and closes SSE streams on errors so the browser does not auto-retry while the server is unavailable.
- `src/main/frontend/components/*.tsx`
  - React components for Ravens game create/play UI, including board, controls, rules panel, seat panel, move list, and status text.
- `src/main/frontend/features/game/*.ts`
  - Game Redux slice, selectors, thunks, create-draft state, bot-assignment derivation, and stream lifecycle wiring.
- `src/main/frontend/features/host/*.ts`
  - Small host integration adapters for generic auth state/actions needed by Ravens game metadata refreshes.
- `src/main/frontend/features/ui/*.ts`
  - Browser-local UI state such as selected square.
- `src/main/frontend/hooks/*.ts`
  - Ravens frontend hooks for responsive board sizing. Shared browser hooks such as fullscreen live in `@ravensanddragons/platform-frontend`.

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
- The create screen defaults to publicly listing new games and includes the selected public/private choice in the create request.
- The app shell renders Ravens and Dragons through the registered frontend game entry while using shared platform frontend contracts/helpers for auth, game-entry typing, and fullscreen wiring.
- The create and active game screens show `Ravens and Dragons` inside the content area. The create screen splits its configuration and board panels evenly on wide screens, while the active game screen places its information panel left of the board and spans its rules panel below the main panels.
- Shared browser styles now live in `app/frontend/src/main/frontend/styles/styles.css`; Ravens components continue using the shared game layout, board sizing, and board highlight classes from that app-owned bundle.
- Live games open at `/g/{gameId}`.
- Create flows open at `/ravens-and-dragons/create`.
- Active games send mutations to `POST /api/games/{gameId}/commands`.
- Seat claiming, explicit player-seat assignment, and bot assignment are Ravens command types sent through the same command endpoint.
- Active games subscribe to `GET /api/games/{gameId}/stream`.
- Bot replies run as post-command follow-up work: the human command response contains the human move state immediately, and the later bot move is persisted and broadcast over the game stream.
- Active-game streams close on connection errors and stay disconnected until a later user action or reload refreshes game state, rather than polling while the server is down.
- Request-scoped auth-aware game metadata is loaded from `GET /api/games/{gameId}/view`.
- Legacy Ravens games stored with snapshot-only public state are converted to full session-shaped responses when loaded or streamed.
- Seat ownership gates gameplay actions by claimed side and active turn.
- The live-game seat panel opens the platform player picker for open seats. The picker can add the current user, add another existing local/OAuth/guest player, or add a supported bot when the acting user owns exactly one human seat and the opposite seat is open. Bot assignment is allowed after play has started, but still requires that one-seat ownership rule.
- Undo against a bot is available after the human move while the bot reply is pending, and after the bot reply it reverses the full human-plus-bot exchange.

## Tests

- Backend rule tests live under `backend/src/test/kotlin/com/ravensanddragons/game`.
- Frontend helper and React/Redux tests live under `frontend/src/test/frontend`.
- `GameRulesTest.kt` verifies backend rule transitions and deterministic Sherwood legal-move generation.
- `GameControllerTest.kt`, `GameCommandControllerTest.kt`, and authorization tests verify game API behavior.
- `BotTurnRunnerTest.kt` verifies bot replies and grouped undo.
- `MachineTrainedBotPhaseOneTest.kt` verifies Michelle artifact validation and legal move selection.
- `BotMatchHarnessTest.kt` is excluded from the default suite and runs through `./gradlew botMatchHarnessTest`.
