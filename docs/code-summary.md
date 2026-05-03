# Code Summary

## Overview

This project is a small Spring Boot 3.3 + Kotlin 2.1 web app that serves a browser-based board game prototype. The backend supports multiple persisted game sessions, addressed by game id, and broadcasts updates over server-sent events per game. The frontend now opens on a lobby screen, can route into a client-only `/create` draft flow backed by local Redux draft state or open games by id, and then talks to the per-game backend API for the active session. The `/create` page now has a dedicated three-panel draft layout with the board on the left, configuration controls in the middle, and the rules panel on the right, and its Start Game action submits the draft payload to `POST /api/games` so the backend can create the persisted session directly in live play before opening `/g/{gameId}`. The create configuration block now lives in a dedicated `GameSetupControls.tsx` component, keeps its free-play guidance immediately above `Start Game`, wraps its rules text in the same outer panel shell used on the live game screen, lists Ravens before Dragons in the free-play starting-side picker, defaults that picker to Ravens, and now cycles free-play setup clicks as raven, dragon, gold, then empty. The live `/g/{gameId}` screen now uses a three-column layout with the board on the left, the move list and its controls in the center, and the rules panel on the right, while seat ownership now lives in the page header above the status line. Finished-game status messaging now mirrors the terminal outcome, so the header explains who won, why a game was drawn, or that it ended manually.

The backend now also includes session-cookie authentication for guest and local users, optional OAuth login wiring, persisted seat ownership on games, request-scoped game-view metadata, and self-service local-account profile management. The frontend now consumes that auth-aware view data, surfaces guest/local auth controls, requires authentication before entering the lobby or a game, gates gameplay actions by claimed side and active turn, and exposes a local-only profile page for display-name updates plus account deletion. Dual-seat ownership is now supported on live games, so the same user can claim both sides, keep the remaining open claim action visible, and retain undo/active-play access when the current state allows it. Google OAuth availability is now configuration-aware, and successful Google login returns to the original `/login?next=...` destination.

Bot opponents now support grouped undo and four selectable strategies. A fresh supported preset game with exactly one authenticated claimed human seat can choose `Randall`, `Simon`, `Maxine`, or `Alphie` from a seat-panel dropdown and assign it to the opposite open seat for `Original Game`, `Sherwood Rules`, `Square One`, `Sherwood x 9`, or `Square One x 9`; bot seat ids persist separately from human ownership, the seat panel renders assigned bot seats as `Bot: Randall`, `Bot: Simon`, `Bot: Maxine`, or `Bot: Alphie`, bot-controlled seats are treated as occupied for later human claim attempts, server-side bot turns run synchronously from canonical Kotlin move generation, and undo now reverses the last human move plus the immediate bot reply. Multi-step undo remains available across consecutive exchanges, and each undo entry now stores a compact restore state instead of a full `GameSnapshot` so per-game retained history stays smaller without changing undo behavior. `Maxine` remains on the existing bounded-depth minimax strategy, while `Alphie` now uses a dedicated alpha-beta strategy with exact-score subtree caching, reused child snapshots, and cached evaluation ordering; `Simon` also reuses the shared evaluation layer instead of keeping a parallel scoring path. The supporting board-geometry and legal-move helpers now cache board-size-specific geometry, reuse stable square identities, avoid several hot-path sequence and set allocations in mutable search, and expose cheaper move-count paths so the stronger bots can search the same depth faster. The bot runner now validates bot-selected moves against the current legal move list with a deterministic fallback if a strategy returns an illegal move or throws mid-search. If the human move ends the game before a bot reply, or the bot reply ends the game, undo still remains available for that last exchange. The old bot-only undo helper sentence has also been removed from the controls panel, leaving undo availability to speak for itself through the button state.

Recent organization work is now reflected directly in the codebase: the old `game.ts` helper module has been split into focused files for shared types, board geometry, client-side rules helpers, and move-history formatting. The backend `GameRules.kt` module has been split into a rule catalog, snapshot factory, shared rule-engine contract, and dedicated free-play, trivial, and original-style rule-engine files while preserving the existing `GameRules` facade for callers. Repeated game-view fetch, auth-session patching, selection normalization, and `401`/`403` recovery logic in `gameThunks.ts` has been consolidated into shared thunk helpers so open, refresh, command, and seat-claim flows stay aligned, and the SSE stream path now only forces a full auth-aware game-view refresh when streamed seat, bot, or ruleset metadata actually changes. The game-only layout and wiring have been extracted from `App.tsx` into a dedicated `GameScreen.tsx` container so the app shell stays focused on auth bootstrap, shared chrome, and route selection. The create flow now has its own frontend-only Redux slice, selectors, and helper module so `/create` can hold a local draft board, rule selection, board size, and starting-side state without touching the persisted game session. The create-rule catalog in `createGameState.ts` is now driven from shared frontend preset definitions instead of repeated handwritten config objects, and `useGameRoute.ts` now centralizes route parsing plus the “clear draft / clear active game / navigate” side effects used across lobby, create, profile, and game transitions. On the backend, command authorization, validation, undo transitions, and side-claim logic have been extracted into `GameCommandService.kt`, leaving `GameSessionService.kt` focused on store orchestration, SSE lifecycle, and metadata-first stale-game cleanup. User-triggered game actions now also funnel frontend request failures into the same dismissible error-box pattern used by auth/profile flows, with a specific server-down message for network failures where the backend does not respond.
The web layer now also includes a dedicated controller advice that recognizes expected disconnected-client I/O during SSE teardown, such as logout-time `Broken pipe` writes, and lets Spring log them as normal client disconnects instead of noisy application errors. Spring Security also permits servlet async redispatches so an already-open game stream can finish teardown after logout without producing access-denied stack traces while initial `/api/games/**` requests remain authenticated.
The follow-up bot refactor has now split the old single `GameBots.kt` file into focused bot model, registry, strategy, and shared evaluation modules, extracted bot-turn execution plus grouped-undo handling into `BotTurnRunner.kt`, centralized frontend bot-assignment derivation into one selector model used by both the seat panel and thunk logic, and added direct bot-runner coverage plus a deterministic minimax node-budget regression test. `GameBotsTest.kt` now also carries two disabled manual-only checks for comparing representative depth-2 `MinimaxGameBotStrategy` versus `AlphaBetaGameBotStrategy` behavior and relative timing without slowing or destabilizing the default suite. The old `docs/bot-implementation-plan.md` planning document has also been removed, with no remaining in-repo references. Machine-trained runtime scaffolding is now live: the server can load bundled per-ruleset machine-trained artifacts, expose `Michelle` only for rulesets with a matching artifact, and score legal moves through backend loader, registry, feature-encoding, scoring, and strategy helpers. The offline Kotlin pipeline can run Sherwood self-play, serialize expert-labeled datasets, train Michelle with side-specific per-position ranking updates instead of a global positive-minus-negative average, deduplicate repeated `(position, move)` examples, write or reread runtime-compatible JSON through a shared artifact payload contract, parallelize per-game training work across all available CPUs by default, and report coarse decile progress while generating datasets and training models. The encoder contract is schema version 5 with raw mover/opponent/gold features, no raven-turn sign flipping, side-specific dragon/raven weight vectors, compact tactical mobility/material/threat signals, and structural uncapturability features; the bundled Sherwood artifact has been promoted to an evolved schema-5 artifact, Michelle now reuses a per-turn scoring context and direct `FloatArray` feature fills to reduce runtime scoring allocation, and the bot match harness includes a Sherwood-only Michelle-vs-baselines smoke evaluation. The evolution loop can evolve Michelle candidates through candidate-only round-robins, survivor selection, mutation, and crossover across both side vectors, then rank the surviving population against the incumbent and configured baselines without feeding those non-candidate games back into selection; evolution mode parallelizes match work across the configured worker count defaulting to all available CPUs, supports multiple repeated seed artifacts, and writes both the best survivor-comparison artifact and every final survivor artifact under the configured output directory. Generated artifacts embed run provenance, training parameters, and evolution promotion summaries; the CLI accepts `--run-id` and defaults generated dataset, artifact, survivor, and report names to a run-id convention; `docs/machine-training-runbook.md` documents the schema-5 training/evolution/release workflow; `docs/machine-trained-bot-improvements.md` captures higher-leverage improvement ideas for the evolved bot; and `docs/machine-trained-feature-schema-plan.md` records the completed migration plan for the schema-5 side-specialized feature vector.

## Current Architecture

- `src/main/kotlin/com/ravensanddragons/RavensAndDragonsApplication.kt`
  - Spring Boot entrypoint.
- `src/main/kotlin/com/ravensanddragons/game/model/*.kt`
  - Shared game/session DTOs, rule summaries, turn records, undo restore-state models, and game exceptions.
- `src/main/kotlin/com/ravensanddragons/game/rules/*.kt`
  - Canonical board coordinates, rule metadata, snapshot creation, rule-engine contracts, and free-play/trivial/original-style rule execution.
- `src/main/kotlin/com/ravensanddragons/game/bot/*.kt`
  - Shared bot value types, bot registry, random-index source, and synchronous bot-turn execution plus grouped human-plus-bot undo handling.
- `src/main/kotlin/com/ravensanddragons/game/bot/strategy/*.kt`
  - Dedicated strategy/search implementations for `Randall`, `Simon`, `Maxine`, and `Alphie`, plus shared Kotlin-only bot evaluation and simulation helpers.
- `src/main/kotlin/com/ravensanddragons/game/bot/machine/*.kt`
  - Machine-trained runtime scaffolding now lives in `MachineTrainedModel.kt`, `MachineTrainedModelLoader.kt`, `MachineTrainedRegistry.kt`, `MachineTrainedFeatureEncoder.kt`, `MachineTrainedMoveScorer.kt`, and `MachineTrainedBotStrategy.kt`, with `BotRegistry.kt` loading `Michelle` from bundled artifacts at startup.
  - Machine-trained phase 2 offline training now lives under `src/train/kotlin/com/ravensanddragons/training`, with dataset generation, self-play, artifact read/write, per-position example keys plus deduplication, a ranking-based trainer, decile progress reporting for the training CLI, and a CLI entrypoint. `MachineTrainedArtifactSupport.kt` now centralizes the shared artifact payload and validation contract used by both runtime loading and offline training.
  - Machine-trained phase 3 now uses schema version 5 with named raw move-local/resulting-position features for gold progress, raven pressure, mobility, material, immediate replies, opponent capture threats, structural uncapturability, and repetition risk, plus side-specific dragon and raven weight vectors.
  - Machine training phase 4 now uses `MachineTrainedEvolutionLoop.kt` for population-based Michelle improvement with parallelized candidate-only round-robins, survivor selection, mutation, crossover, opening diversity controls, survivor/incumbent/baseline comparison rankings, progress reporting, and final promotion-threshold decisions.
  - Machine training phase 5 operational metadata now extends generated artifacts with run provenance, training-parameter summaries, and evolution-promotion summaries.
- `src/main/kotlin/com/ravensanddragons/game/session/*.kt`
  - `GameCommandService.kt` now owns command authorization, validation, undo handling, and seat-claim transitions, while `GameSessionService.kt` keeps persisted-game loading, create-payload seeding, broadcasting, emitter lifecycle, metadata-first stale cleanup, and top-level coordination with `BotTurnRunner.kt`.
- `src/main/kotlin/com/ravensanddragons/game/persistence/*.kt`
  - Game store contracts, JDBC persistence, and game JSON encoding/decoding.
- `src/main/kotlin/com/ravensanddragons/game/web/*.kt`
  - REST/SSE game controller endpoints.
- `src/main/kotlin/com/ravensanddragons/auth/*.kt`
  - Session auth models, JDBC-backed user persistence, guest and local login flows, optional OAuth login integration, local-account profile management, and session cleanup hooks for temporary guest users.
- `src/main/kotlin/com/ravensanddragons/web/*.kt`
  - Shared web-layer exception handling, including normalization of expected disconnected-client SSE exceptions.
- `src/main/resources/db/migration/*.sql`
  - Flyway migrations for the persistent game schema.
- `docs/profiling-runbook.md`
  - Repeatable local memory-profiling runbook for idle baselines, human-play retention, bot-search churn, and SSE-connected checks.
- `docs/multi-game-service-structure-plan.md`
  - Staged architecture plan for evolving this app into a multi-game service with shared platform infrastructure, an assembling app project, and top-level game modules such as `ravens-and-dragons/`.
- `docs/machine-trained-bot-improvements.md`
  - Planning notes for making the evolved `machine-trained` bot `Michelle` stronger, including shallow search, richer fitness, outcome learning, game-stage specialization, and evaluation reliability.
- `docs/machine-trained-feature-schema-plan.md`
  - Completed implementation plan for migrating Michelle to schema 5 with side-specific weight vectors, a compact tactical feature set, structural uncapturability features, artifact/data migration guidance, and rollout tests.
- `docs/machine-training-runbook.md`
  - Runbook for training, validating, installing, and rolling back a locally generated Sherwood `Michelle` artifact, including run-id naming and artifact provenance metadata.
- `src/main/resources/bots/machine-trained/*.json`
  - Bundled per-ruleset machine-trained artifacts. The Sherwood artifact for `Michelle` is now an evolved schema-5 artifact and matches the side-specialized feature encoder.
- `src/main/frontend/index.html`
  - Frontend HTML entry for the Vite build.
  - Loads `/styles.css` and mounts the React app.
- `src/main/resources/static/styles.css`
  - Owns layout, board sizing variables, responsive behavior, fullscreen styling, and the `#c274c8` highlight color used for the board's corner and center squares.
- `src/main/frontend/game-types.ts`
  - Frontend wire types, auth/game DTOs, the local create-draft state shape, and the create-game request payload.
- `src/main/frontend/board-geometry.ts`
  - Board coordinate helpers, dimension helpers, center-square helpers, and highlighted-square helpers.
- `src/main/frontend/features/game/createGameState.ts`
  - Local `/create` draft configuration data, pure snapshot helpers, and the draft-to-create-request mapper.
- `src/main/frontend/game-rules-client.ts`
  - Client-side ownership, capture, targeting, and local-selection helpers used by selectors and board rendering.
- `src/main/frontend/move-history.ts`
  - Turn notation and grouped move-history row helpers.
- `src/main/frontend/game-client.ts`
  - Transport helpers for REST commands, create-game submission, bot assignment, and SSE subscription setup.
- `src/main/frontend/App.tsx`
  - Top-level React layout and shell composition.
  - Handles auth bootstrap plus switching between the login, lobby, create, profile, and active game screens.
- `src/main/frontend/components/GameScreen.tsx`
  - Owns the active game screen layout, board sizing hookup, header seat summary, move-list header controls, rules legend, and game-specific feedback dialog.
- `src/main/frontend/components/CreateGameScreen.tsx`
  - Owns the local `/create` draft layout and composes the draft board, configuration controls, and rules panel.
- `src/main/frontend/components/MoveList.tsx`
  - Owns the scrollable move-history area for the live game screen.
- `src/main/frontend/components/SeatPanel.tsx`
  - Compact live-game seat ownership summary, side claim actions, and bot-selection dropdown plus assignment button for the page header.
- `src/main/frontend/components/Board.tsx`
  - Shared board rendering plus connected and controlled click handling.
- `src/main/frontend/components/ControlsPanel.tsx`
  - Live-game control wiring only, without the removed bot-specific undo helper sentence.
- `src/main/frontend/components/GameSetupControls.tsx`
  - Owns the create-screen configuration block and `Start Game` affordances.
- `src/main/frontend/components/RulesPanel.tsx`
  - Shared rules-description renderer for live and draft screens.
- `src/main/frontend/app/*.ts`
  - Redux store setup and typed hooks.
- `src/main/frontend/features/game/*.ts`
  - Game slice, selectors, thunks, and stream lifecycle wiring.
  - Includes current-game and current-view state, auth-aware game metadata, the local draft-create slice/selectors/helpers, exact undo availability and ownership, a shared selector-level bot-assignment model for target-side/availability/pending-bot rendering, create-game submission from the draft payload, command/claim-side/bot thunks, and shared helpers for applying fetched game views plus auth-failure refresh recovery.
- `src/main/frontend/features/auth/*.ts`
  - Auth session slice, selectors, profile state, and guest/local auth thunks.
- `src/main/frontend/features/ui/*.ts`
  - Local-only UI state such as selected square.
- `src/main/frontend/components/*.tsx`
  - React components for the lobby screen, auth panel, local profile screen, live game screen, create screen, seat summary, board rendering, create controls, rules panels, move list, and status text.
- `src/main/frontend/hooks/*.ts`
  - Browser hooks for responsive sizing, fullscreen behavior, and URL-to-page routing.
  - `useBoardSizing.ts` now measures the padded board panel so the board can shrink and grow without overflowing the panel.
  - `useGameRoute.ts` now parses browser routes centrally and initializes or clears the local `/create` draft state as the browser enters or leaves that route.
- `src/test/frontend/game.test.js`
  - Frontend helper tests for server-backed snapshots and local-only selection behavior.
- `src/test/frontend/game-thunks.test.ts`
  - Verifies create/open/claim/bot flows, shared auth-refresh behavior, and server-down feedback handling in the game thunks.
- `src/test/frontend/game-screen.test.tsx`
  - Verifies the game-screen feedback dialog renders and dismisses correctly.
- `src/test/frontend/create-game-draft.test.ts`
  - Verifies the local `/create` draft defaults, board cycling, rule switching, and reset behavior.
- `src/test/kotlin/com/ravensanddragons/game/GameRulesTest.kt`
  - Verifies backend rule transitions plus deterministic Sherwood legal-move generation.
- `src/test/kotlin/com/ravensanddragons/game/GameControllerTest.kt`
  - Verifies the shared game API, version conflicts, and validation errors.
- `src/test/kotlin/com/ravensanddragons/game/BotTurnRunnerTest.kt`
  - Verifies synchronous bot replies, grouped undo entries, and no-op exits for finished or no-legal-move bot states.
- `src/test/kotlin/com/ravensanddragons/game/MachineTrainedBotPhaseOneTest.kt`
  - Verifies machine-trained artifact validation, Sherwood-only registration, legal move selection, immediate-win preference, and ruleset scoping.
- `src/test/kotlin/com/ravensanddragons/game/BotMatchHarnessTest.kt`
  - Verifies long-running bot match smoke coverage outside the default test suite, now including Sherwood-only Michelle-vs-baselines evaluation games.
- `src/test/kotlin/com/ravensanddragons/RavensAndDragonsApplicationTests.kt`
  - Verifies the Spring application context loads.

## Build And Runtime Flow

- Gradle is the primary build entrypoint.
- The Gradle wrapper is pinned to Gradle 9.4.1, the first tested 9.x latest-patch release that removes the Java 25 restricted native-access warning during wrapper runs.
- `build.gradle.kts` uses:
  - Spring Boot for serving the app.
  - Kotlin/JVM with Java 21.
  - Spring JDBC plus Flyway for persistence.
  - The Spring dependency-management Gradle plugin at 1.1.7 to avoid the Gradle 10 module-coordinate deprecation warning seen with 1.1.6.
  - `com.github.node-gradle.node` to download Node and npm automatically.
- Frontend build flow:
  - `npm run build` runs `tsc && vite build`.
  - `tsconfig.json` typechecks the frontend TypeScript and TSX source and emits test-facing JS modules into `build/generated/frontend-test`.
  - `vite.config.ts` builds the frontend entry and bundle into `build/generated/frontend` and clears that generated directory before each build so stale hashed assets do not accumulate.
  - `processResources` depends on the frontend build and copies the generated assets into the app's `static` resources.
- Frontend test flow:
  - `npm run test` runs Node's built-in test runner against the shared helper tests and Vitest against the React/Redux frontend tests.
  - Gradle task `testFrontend` runs the frontend tests.
  - `./gradlew test` runs the frontend tests plus the default Kotlin/Spring test task.
  - Filtered backend runs such as `./gradlew test --tests ...` skip the frontend test suite.
  - `./gradlew botMatchHarnessTest` runs the long bot-vs-bot soak harness separately from the default `test` task, including the Sherwood-only Michelle evaluation smoke test.
- Runtime flow:
- The browser lobby lives at `/`.
- The browser treats `/create` as a local-only draft-entry route and `/g/{gameId}` as the canonical active-game URL.
- Loading `/create` or `/g/{gameId}` directly opens that page in the browser.
  - Session inspection uses `GET /api/auth/session`.
  - Guest login uses `POST /api/auth/guest`.
  - Local signup and login use `POST /api/auth/signup` and `POST /api/auth/login`.
  - Local and guest logout use `POST /api/auth/logout`.
  - Local-account profile load uses `GET /api/auth/profile`.
  - Local-account display-name updates use `POST /api/auth/profile`.
  - Local-account deletion uses `POST /api/auth/delete-account`.
  - Creating a game uses `POST /api/games`.
  - Opening a game by id uses `GET /api/games/{gameId}`.
  - Seat claiming uses `POST /api/games/{gameId}/claim-side`.
  - Bot assignment uses `POST /api/games/{gameId}/assign-bot-opponent`.
  - A request-scoped auth-aware game view is available at `GET /api/games/{gameId}/view`.
- The active game screen sends mutations to `POST /api/games/{gameId}/commands`.
- The create screen sends its drafted setup to `POST /api/games`, which creates the persisted session directly in move phase before the browser opens `/g/{gameId}`.
- The active game screen subscribes to `GET /api/games/{gameId}/stream` for live updates.
  - Games are stored in the configured database and are automatically evicted when they have not been accessed longer than the configured stale threshold and no SSE viewers are connected.
- Runtime configuration:
  - `server.port` reads `${PORT:8080}` so the app keeps its local default while also working on Railway-style platforms that inject the listen port at runtime.
  - `spring.datasource.*` defaults to an H2 file database for local persistence and may be overridden for PostgreSQL deploys.
  - `server.servlet.session.timeout` now defaults to `2h`, so authenticated servlet sessions expire more aggressively and keep Railway runtime memory lower.
  - `ravens-and-dragons.games.stale-threshold` controls how long an inactive game can sit before eviction, and defaults to six weeks (`1008h`).
  - The stale-game cleanup scheduler now derives its fixed delay from that threshold and runs every one-tenth of the configured stale window instead of using a separate cleanup-delay property.
  - Google OAuth is enabled only when the environment defines a `google` Spring client registration through `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET`, and typically `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email`.
  - Google callback URLs should use `/login/oauth2/code/google`, such as `http://localhost:8080/login/oauth2/code/google` locally or `https://<deploy-host>/login/oauth2/code/google` in production.
  - The app now honors forwarded proxy headers when building Google OAuth authorization requests, so Railway deployments keep the public `https` callback host instead of generating the internal `http` service URL.
  - Railway deploys should set `SPRING_DATASOURCE_URL` to a JDBC host-only URL such as `jdbc:postgresql://<host>:<port>/<db>` and pass username/password separately through `SPRING_DATASOURCE_USERNAME` and `SPRING_DATASOURCE_PASSWORD`.
  - `railway up` uploads the current local workspace, while `railway service redeploy` only restarts the latest already-uploaded deployment.
  - Flyway runs startup migrations from `classpath:db/migration`, and the Gradle build now pins Flyway to `10.22.0` plus `flyway-database-postgresql` so Railway's PostgreSQL 18 startup is accepted.
  - `railway.json` overrides Railway's deploy start command to launch the Spring Boot fat jar with a default `JAVA_TOOL_OPTIONS` profile that caps heap as a fraction of container RAM and enables periodic idle-time G1 collection, points Railway health checks at `GET /health`, and matches the produced `ravens-and-dragons.jar`.
- Result:
  - Running `./gradlew bootRun` serves the Vite-built frontend bundle plus static CSS through Spring Boot.

## Game Model

The canonical board is represented on the server as `Map<String, Piece>` and on the wire as a JSON object keyed by square name like `e5`.

- `Piece = "dragon" | "raven" | "gold"`
- `Side = "dragons" | "ravens"`
- `Phase = "none" | "move" | "capture"`
- `TurnType = "move" | "gameOver"`

`GameSnapshot` currently contains:

- `board`
- `boardSize`
- `specialSquare`
- `phase`
- `activeSide`
- `pendingMove`
- `turns`
- `ruleConfigurationId`
- `positionKeys`

`turns` now stores typed turn history entries, so the shared history can include both completed moves and a terminal `gameOver` marker. The frontend reuses that terminal turn to format both the final move-list row and the finished-game header status text.

`GameSession` currently also contains:

- `lifecycle` (`new`, `active`, or `finished`)
- `canUndo`
- `availableRuleConfigurations`
- `selectedRuleConfigurationId`
- `selectedStartingSide`
- `selectedBoardSize`
- `dragonsPlayerUserId`
- `ravensPlayerUserId`
- `dragonsBotId`
- `ravensBotId`
- `createdByUserId`

The backend also now exposes auth-oriented DTOs outside the canonical session payload:

- `AuthSessionResponse`
- `LocalProfileResponse`
- `GameViewResponse`
- `viewerRole`
- player summaries for the claimed ravens and dragons seats
- bot summaries for assigned bot seats plus the frontend-visible bot catalog for the current ruleset
- configured OAuth provider ids for the login UI

Important implication: game state is now persisted in the configured database, so clients can reopen the same game after server restart. SSE subscriptions and live fanout remain in memory per app instance, so persistence does not by itself add cross-instance push delivery.

Server-only undo history now stores `UndoSnapshotState` entries instead of full snapshots. Each entry keeps only the fields needed to restore the previous playable state, so repeated undos still work while per-game retained history stays smaller.

## Responsibilities By File

### Backend game module

The Kotlin game module is now the source of truth for game rules and state transitions.

- Creates fresh idle snapshots for edit-only draft or test helpers, and live snapshots for created games.
- Owns turn transitions.
- Owns rule-configuration lookup, movement validation, capture resolution, and automatic game-over checks.
- Wraps each snapshot in a versioned persisted game session.
- Keeps server-only typed undo-entry history alongside the public shared session payload.
- Stores undo history as compact restore-state entries so multiple undos in a row still work without retaining full snapshots per step.
- Serializes snapshots and undo history into the `games` table, with backward-compatible decoding for older snapshot-only undo records.
- Broadcasts updated snapshots to SSE clients scoped by game id.
- Tracks last access time server-side for stale-game eviction.
- Uses lightweight `id` plus `last_accessed_at` scans before loading full stored games during stale cleanup.
- Persists which local user, if any, currently owns each side.
- Persists bot-controlled seats separately from human seat ownership.
- Treats bot-controlled seats as occupied, so humans cannot later claim a seat that already belongs to a bot.
- Enforces that only authenticated claimed players may submit commands, with active-side enforcement once turn-based play begins.
- Runs any active bot side synchronously through `BotTurnRunner.kt`, using the canonical Kotlin legal move list and broadcasting each intermediate session through `GameSessionService`.
- Splits command-transition logic into `GameCommandService.kt`, bot-turn execution into `BotTurnRunner.kt`, and session/store orchestration into `GameSessionService.kt`.

Most gameplay changes should start on the backend here.

### Backend auth module

The auth module now owns identity and session concerns without moving canonical game rules out of the game module.

- Creates persisted guest and local users.
- Supports session-cookie sign-in and sign-out.
- Wires optional OAuth login so configured providers can resolve to the same local user model.
- Lets authenticated local password users load their profile, update their display name, and delete their own account after password confirmation.
- Stores only request-scoped viewer identity in auth/session DTOs instead of persisting viewer role on the game session.
- Deletes session-only guest users on logout or session destruction and releases any seats they held without ending the game.
- Deletes local accounts transactionally while releasing claimed seats and clearing nullable game ownership references without deleting games.

### React frontend

The React frontend is now split by responsibility.

- `App.tsx` composes the page shell, auth bootstrap, and top-level route selection.
- `game-types.ts` is the dependency-light home for shared frontend wire types.
- `board-geometry.ts` owns board coordinate helpers without depending on browser or Redux code.
- `game-rules-client.ts` layers client-side targeting and local-selection rules on top of shared types and board geometry.
- `move-history.ts` owns turn-label and grouped-history formatting helpers.
- `GameScreen.tsx` owns the active game view container and connects that layout to Redux thunks and selectors.
- Redux owns shared client state such as the latest server session, auth session, loading/submission state, connection state, feedback messages, and local selection.
- Redux also owns the persisted game/session view state plus the current game id, while the route hook initializes or clears the separate `/create` draft state from the browser URL.
- `gameThunks.ts` coordinates lobby create/open actions, game-view refreshes, seat claiming, and command submission against the backend API.
- The streamed-session path now refreshes the auth-aware game view only when seat, bot, or ruleset metadata changes, rather than after every SSE move update.
- `gameThunks.ts` also translates network failures from user-triggered game requests into friendly feedback messages for the shared game UI.
- `authThunks.ts` coordinates current-session loading plus guest/local login and logout flows.
- `gameStream.ts` plus `useGameSession.ts` open and maintain the SSE subscription only for the active game screen, applying ordinary move updates without forcing a redundant full game-view fetch.
- `useGameRoute.ts` maps browser URLs to lobby, create, or game state and keeps the address bar in sync with the active game id.
- `Board.tsx`, `ControlsPanel.tsx`, `MoveList.tsx`, `SeatPanel.tsx`, and `StatusBanner.tsx` render the current UI from Redux state, while the create screen uses controlled board editing through the local draft slice.
- `LobbyScreen.tsx` renders the create-or-open entry flow before a game is active.
- `useBoardSizing.ts` and `useFullscreen.ts` wrap browser-specific layout and fullscreen behavior.

Most UI-only changes should start in the relevant component, selector, or browser hook.

## Current Rules Implemented

### Lobby and game entry

- The browser initially loads into a lobby screen.
- The lobby can open an existing game by id or route to the client-only `/create` draft flow.
- The page shell now also shows auth controls for guest access, local signup/login, logout, and an OAuth sign-in link for supported deployments.
- Local password accounts now also see a `Profile` button in the upper-right app chrome that opens `/profile`.
- The lobby presents separate create and rejoin cards, uppercases typed game ids locally, and keeps `Open Game` disabled until an id is present. Clicking `Start Fresh` now opens `/create` instead of immediately creating a persisted game.
- Loading `/create` shows the local three-panel draft screen, and loading `/g/{gameId}` directly enters that game's board screen.
- Once a game is opened, the browser enters that game's board screen and updates the URL to `/g/{gameId}`.
- The game screen shows the current game id and includes a `Back to Lobby` button, a compact seat ownership line in the header, and a center-column move list whose action buttons stay above the scrollable history.
- The `/profile` page is available only to local password accounts, prefills the current display name, allows display-name updates, and requires password confirmation before deleting the account.
- Returning to the lobby closes the active SSE stream, clears browser-local selection and the local draft, and returns the URL to `/`.
- If the browser entered the app directly on `/g/{gameId}`, returning to the lobby replaces that direct-entry history slot so browser Back still leaves the app instead of reopening the same game route.

### Free Play

- Free Play configuration now happens entirely on `/create`.
- Free Play board size may be selected from `3x3` through `26x26`.
- Clicking a draft square on `/create` still cycles `empty -> dragon -> raven -> gold -> empty`.
- Any square, including `d4`, can be edited in the draft, and any number of gold pieces may be placed.
- Clicking `Start Game` persists that drafted board and opens the live game directly in `move`.
- The selected starting side moves first, dragons may move dragons or gold, ravens may move ravens, and movement allows any owned piece to move to any empty square.
- If an opposing piece exists after a move, the game enters `capture`, where dragons may capture one raven and ravens may capture one dragon or gold.
- Capture can still be skipped.
- Active play still exposes `End Game`, which appends a terminal `gameOver` turn and marks the session finished.
- Finished games stay viewable on the same game id, and `Undo` can roll back the terminal game-over state to resume the previous playable snapshot when undo history exists.
- Manually ending `Free Play` renders the terminal history entry as `Game Over`.
- Finished games still cannot be restarted or reconfigured on the same game id while they remain finished.

### Trivial Configuration

- `Trivial Configuration` starts from a preset board with dragons at `a1` and `g7`, gold at `a2` and `g6`, and ravens at `a7` and `g1`.
- There is no setup phase.
- Movement uses the same broad empty-square movement as `Free Play`.
- Captures are automatic: any opposing piece orthogonally adjacent to the moved piece is removed.
- Dragons win if any gold reaches `d4` or all ravens are removed.
- Ravens win if all gold pieces are removed.

### Original Game

- `Original Game` starts from the published cross-shaped setup with ravens moving first.
- Pieces move any distance orthogonally without jumping over occupied squares, and the gold is moved by the dragons.
- No piece may land on `d4`, and only the gold may land on the corner squares.
- Moving between two enemy pieces is illegal.
- Captures resolve automatically after each move.
- Non-gold pieces are captured by orthogonal sandwiches, by an enemy plus the empty center, or by an enemy plus a corner.
- The gold is captured by four ravens in the center, by three ravens when beside the center, and otherwise like another piece.
- Dragons win when the gold reaches a corner.
- Ravens win when the gold is captured.
- The game is drawn on repeated positions or when the side to move has no legal move.
- Original Game and Sherwood Rules now record the draw cause in turn history as `Game Over: Draw by repetition` or `Game Over: Draw by no legal move`.

### Sherwood Rules

- `Sherwood Rules` starts from the same published cross-shaped setup as `Original Game`, with ravens moving first.
- Ravens and dragons move any distance orthogonally without jumping over occupied squares.
- The gold is moved by the dragons and may move only one orthogonal square at a time.
- Landing restrictions, self-capture prevention, automatic capture rules, win conditions, and draw conditions otherwise match `Original Game`.

### Square One

- `Square One` uses the same rules as `Sherwood Rules` on a `7x7` board.
- The setup keeps the gold in the center with dragons around it, but places eight ravens at `b6`, `d6`, `f6`, `b4`, `f4`, `b2`, `d2`, and `f2`.
- Ravens move first.

### Sherwood x 9

- `Sherwood x 9` uses the Sherwood Rules movement, capture, win, and draw behavior on a `9x9` board.
- The special square is `e5`.
- The setup is the Sherwood cross formation shifted one file right and one rank up so the gold starts on `e5`.
- Ravens move first.

### Square One x 9

- `Square One x 9` uses the Square One movement, capture, win, and draw behavior on a `9x9` board.
- The special square is `e5`.
- The setup shifts the Square One formation one file right and one rank up so the gold starts on `e5` and the ravens start at `c7`, `e7`, `g7`, `c5`, `g5`, `c3`, `e3`, and `g3`.
- Ravens move first.

### Shared play behavior

- Clients connected to the same game id see the same server-owned game session.
- The backend can create additional persisted games with generated ids.
- Opening the lobby, loading `/create` or a game, and SSE subscription now require an authenticated session.
- Command submission and seat claiming also require an authenticated session.
- Authenticated users may claim one open side on a game; unclaimed viewers remain spectators.
- The game screen now shows current seat ownership, keeps the remaining open claim button visible when one seat is already claimed, and suppresses gameplay affordances when the viewer is spectating or on the wrong side once turn-based play begins unless the same user owns both seats.
- In a fresh supported preset game, a single claimed human player may also assign `Randall` to the opposite open seat for `Original Game`, `Sherwood Rules`, `Square One`, `Sherwood x 9`, or `Square One x 9`, and assigned seats render as `Bot: Randall`.
- If a guest session ends, that guest user is deleted and any seats they held become unclaimed while the game itself stays active and viewable.
- Generated game ids now use 7 characters from the Open Location Code ("PLUS code") alphabet `23456789CFGHJMPQRVWX`, which is the shortest fixed width that still covers more than 1,000,000,000 possible games.
- Mutation requests include an expected version.
- On a version conflict, the server returns `409` with the latest snapshot for that game only.
- Freshly loaded clients receive an exact `canUndo` flag plus the side that currently owns undo, including after a finished game if undo can still roll back the terminal game-over state.
- Bot games now report grouped undo availability from the backend. Undo reverses the last human-plus-bot exchange during play, and remains available after a game-ending human move or game-ending bot reply when that final exchange can still be rolled back.
- Freshly loaded clients also receive whether the shared session is `new`, `active`, or `finished`.
- Freshly loaded clients also receive the shared selected play style and the full list of available rule configurations.
- Freshly loaded clients also receive the shared selected starting side for `Free Play`.
- The browser keeps piece selection local; other clients do not see half-finished selections.
- In the no-game phase, the board remains visible but is not interactive.
- The board now renders the center and corner squares with light-gray highlighting, and even-sized boards highlight all four middle squares instead of only one.
- Only actionable squares show hover/pointer affordances; inactive and non-actionable squares stay visually still on mouseover.
- The move list now shows an empty-state message before any moves exist and auto-scrolls to the latest entry when history changes.
- The move-list empty state now uses the same panel surface instead of a contrasting inset tile.
- Move-list autoscroll is now container-only, so new turns no longer pull the entire page downward.
- The move list now groups completed moves into numbered two-column display rows while still rendering a terminal `Game Over` entry separately.
- The desktop game layout now allocates a wider third column to the move-list panel.
- Games that have not been loaded, mutated, or watched longer than the configured stale threshold are evicted from the persistent store.
- An active SSE subscription keeps a game alive even if no commands are sent during that threshold window.
- Board sizing now subtracts board-panel padding when computing `--board-size`, which keeps the board inside its panel and lets it re-expand after the window grows.
- Original-style terminal win checks now resolve a captured gold as `Ravens win` and a last captured raven as `Dragons win` before evaluating post-turn draw conditions such as no legal move.

## Rendering Strategy

The frontend now uses React components backed by Redux state.

- `main.tsx` bootstraps the React app and Redux provider.
- `App.tsx` is the top-level shell and route switcher.
- Selectors derive render-ready values from the latest server snapshot plus local UI state.
- Components rerender declaratively when Redux state changes after REST responses or SSE events.
- `App.tsx` now switches between route-level screens while `GameScreen.tsx` renders the main three-column game layout with the seat summary in the header and the move-list controls above the scrollable history.
- Visual highlights remain class-based:
  - `selected`
  - `targetable`
  - `capture-target`
- Move history is shown as simple notation like `a1-b2`, `a1-b2xc3`, or multi-capture variants, grouped into numbered two-column rows, plus a terminal `Game Over: ...` row when a game ends.
- Original-style draws now surface their specific cause in that terminal row.

Future UI changes should preserve the split of transport logic, Redux state, render derivations, and presentational components.

## Layout And UX Notes

- The board is a square CSS grid sized from the active server snapshot.
- The UI now displays numbered row labels on the left and lettered column labels along the bottom.
- Square names still use `letter + number` notation, so the bottom-left square is always `a1`.
- CSS custom properties drive sizing and proportions.
- `updateBoardSize()` computes `--board-size` from the available container space.
- A `ResizeObserver` and `window.resize` listener keep the board responsive.
- The resize hook is re-enabled when the app switches from the lobby into an active game so the board resumes responsive sizing after conditional mount.
- The page supports fullscreen via `requestFullscreen()` on the `.page` element.
- Mobile/narrow layouts collapse the three-column layout into stacked sections.

## Build Output Notes

- `build/generated/frontend-test` now holds the stable transpiled frontend modules used by the Node-based frontend tests.
- Frontend builds now leave `build/generated/frontend` with only the current Vite `index.html` plus the hashed assets it references.
- After `processResources`, `build/resources/main/static` likewise keeps only the current generated frontend files alongside authored static files such as `styles.css`.

## Testing Status

- Frontend helper tests now live in `src/test/frontend/game.test.js`.
- React/Redux component and selector tests now live alongside them in `src/test/frontend/*.test.ts(x)`.
- The backend now has dedicated rules and API tests.
- The frontend tests currently cover:
  - server-backed capturable squares
  - targetable square calculation for both free movement and Original Game orthogonal movement
  - board square-name mapping for lettered columns and numbered rows
  - local selection normalization
  - reading pieces from the wire snapshot
  - turn notation including captures and winner text
  - Redux-backed status and target derivation
  - controls enablement, play-style selection, and config-specific control visibility
  - lobby create/open interactions
  - browser route handling for `/`, `/create`, and `/g/{gameId}`
  - visible row and column labels on the rendered board
  - board selection behavior, idle-board no-op handling, and capture highlighting
  - stream connection and cleanup when entering or leaving a game screen
- The backend tests currently cover:
  - rule-configuration-specific setup and movement validation, including Original Game and Sherwood Rules variants
  - initial snapshot
  - create-game entry into move
  - draft-board seeding for free play
  - move-to-capture transitions
  - move commits when capture is unavailable
  - capture commits
  - skip-capture commits
  - end-game board preservation and `gameOver` history
  - multi-game creation and isolation
  - version increments
  - stale-version conflicts scoped to a single game
  - SSE delivery scoped to one game
  - persistence round-tripping for stored snapshots and undo history
  - stale-game eviction and active-viewer protection
  - removed legacy `/api/game*` routes
  - invalid command validation

## Extension Points For Future Changes

- To add or change gameplay rules:
  - Start in the Kotlin game module under `src/main/kotlin/com/ravensanddragons/game`.
  - Update `src/test/kotlin/com/ravensanddragons/game/GameRulesTest.kt`.
- To change UI behavior or display:
  - Start in the relevant React component, selector, thunk, or hook under `src/main/frontend`.
  - Update `src/main/resources/static/styles.css` if layout or styling is affected.
- To persist games or support richer multiplayer:
  - Extend the backend game store and session service further to add cross-instance event fanout behind the current game-id-based API.
- To support undo/redo or replay:
  - Expand the backend session model with richer history, then expose that through the API.

## Constraints And Gotchas

- Game state persists in the configured database, but SSE delivery remains local to each app instance.
- `Free Play` and `Trivial Configuration` still allow effectively teleporting a selected piece to any empty square, while `Original Game`, `Sherwood Rules`, `Square One`, `Sherwood x 9`, and `Square One x 9` use constrained orthogonal movement.
- Capture eligibility is global, not positional; if any opposing capturable piece exists anywhere, capture mode begins.
- Selection remains browser-local and may be cleared when a new server snapshot makes it invalid.
- The built frontend entry is now generated by Vite rather than assuming a fixed `/app.js` file.
- The frontend tests still run against the compiled output in `build/generated/frontend`, so TypeScript build success remains part of test success.
- If the default app port is busy during local runs, the preferred workflow is to report that conflict instead of switching ports unless the user explicitly asks for a different port.

## Suggested Priorities Before Larger Feature Work

1. Define undo/history semantics on top of the shared server-owned session model.
2. Decide whether the current snapshot-history undo model should stay as-is or evolve into a richer event/command history as rules grow.
3. Decide whether cross-instance live update delivery should use database notifications, Redis pub/sub, or another fanout layer.
4. Keep backend game rules centralized and avoid drifting gameplay logic into React components or Redux reducers.
5. Expand backend and frontend tests alongside any new move, capture, or win-condition logic.
