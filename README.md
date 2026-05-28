# Ravens and Dragons

Ravens and Dragons is a Spring Boot and Kotlin web app for playing browser-based games with a React and Redux frontend. Games are stored in the app database, each game has its own URL, and connected players stay in sync through server-sent events.

## Highlights

- Create a new game from a draft setup or open an existing game by ID
- Play the included Tic-Tac-Toe game, where X moves first on a 3x3 board and the game ends on a win or draw
- Play the included Gin Rummy game with human seats, configurable match/scoring rules, drag-reorderable hands, draw/discard turns, end-of-turn stock draw handling, knocking, gin, Big Gin, hand-result summaries, and in-game rule references
- Use a shared `Ayazian Games` app shell with compact fixed header/footer chrome, lobby-linked header title after login, route-aware browser tab titles, a turn-aware username menu, gradient-styled public lobby rows, and scrollable page content
- Play in the browser with live updates shared across tabs and clients, including header turn badges for unfinished games where you have a seat
- When the server is unavailable, the frontend shows a server-down notice and closes live streams instead of silently clearing lists or polling until the server returns
- Persist games in the configured database so they survive app restarts
- Reopen older persisted Ravens and Dragons games whose stored state predates the current multi-game session payload shape
- Sign in as a guest or local user, with optional Google OAuth support
- Claim the ravens or dragons side in a live game through the game command flow
- In `Free Play`, setup clicks now cycle `raven -> dragon -> gold -> empty`, and the starting-side picker lists Ravens first and defaults to Ravens
- In a supported preset game, use the live-game seat picker to add yourself, another existing player, or a server-driven bot to an open seat; bots can be assigned to your opposite open seat for `Original Game`, `Sherwood Rules`, `Square One`, `Sherwood x 9`, or `Square One x 9`
- `Michelle` appears for `Sherwood Rules` from an evolved schema-5 ruleset-scoped artifact with side-specific dragon/raven weight vectors, compact tactical board features, and a lower-allocation runtime scoring path
- The offline Kotlin training pipeline can generate Sherwood-only Michelle datasets, train side-specific per-position move-ranking weights, deduplicate repeated move examples, write runtime-compatible artifacts with run provenance, evolve candidate populations with mutation/crossover, and smoke-evaluate Michelle against baseline bots through `botMatchHarnessTest`
- `Maxine` stays on the existing minimax search, while `Alphie` uses a deeper optimized alpha-beta search with subtree caching and reused child snapshots
- Undo against a bot reverses one full exchange, still works after a game-ending human move or bot reply when that last exchange is undoable, and can now be repeated across multiple consecutive undo steps
- Streamed move updates now avoid an extra full game-view refresh unless seat, bot, or ruleset metadata changed
- The runnable app assembles Ravens and Dragons through a code-enforced game module contract and platform runtime that route and persist opaque game-owned JSON without owning Ravens board, side, bot, or undo semantics
- The app-owned React shell renders Ravens and Dragons through a shared frontend package contract that owns reusable auth helpers, browser shell hooks, and game entry typing while Ravens keeps its own create/play screens and lifecycle wiring
- Logging out while a game stream is open lets the SSE teardown finish without noisy Spring Security access-denied stack traces

## Requirements

- Java 21
- Internet access the first time Gradle runs so dependencies can be downloaded

You do not need a separate Gradle or Node installation. The Gradle wrapper is included, and the frontend toolchain is managed through Gradle.

The Gradle wrapper is pinned to Gradle 9.4.1 so local runs on newer JDKs avoid Gradle's Java 25 native-access warning, and the Spring dependency-management Gradle plugin is kept on 1.1.7 to avoid Gradle 10 deprecation warnings.

The frontend build uses Vite 7.3.2 with a patched PostCSS lockfile resolution so the Gradle-managed npm install/test flow reports no audited vulnerabilities.

## Run Locally

Start the app:

```bash
./gradlew bootRun
```

Then open [http://localhost:8080](http://localhost:8080).

By default, the app uses a local H2 database stored under `build/db/ravens-and-dragons`.

The default servlet session timeout is `2h`.

## Run Tests

```bash
./gradlew test
```

That command runs the backend and frontend test suites for the included subprojects.

Run only the backend or frontend tests with:

```bash
./gradlew testBackend
./gradlew testFrontend
```

Run the full default verification suite with:

```bash
./gradlew check
```

That runs the same backend and frontend suites plus any other default verification checks. Filtered backend test runs such as `./gradlew :ravens-and-dragons:backend:test --tests ...` stay focused on JVM tests and do not run frontend tests.

The Randall-vs-Maxine soak harness now runs separately:

```bash
./gradlew botMatchHarnessTest
```

To run a larger head-to-head batch, pass `botMatchHarnessGamesPerMatchup` to Gradle. For example, `-DbotMatchHarnessGamesPerMatchup=10` runs the release-two Randall/Maxine coverage plus the Sherwood-only Michelle baseline smoke evaluation at ten games per ordered matchup.

`ravens-and-dragons/backend/src/test/kotlin/com/ravensanddragons/game/GameBotsTest.kt` also keeps two disabled manual bot-comparison checks: one for representative depth-2 move agreement between `MinimaxGameBotStrategy` and `AlphaBetaGameBotStrategy`, and one for timing those same representative searches without making the regular suite flaky.

## Profiling

A repeatable local memory-profiling runbook lives at [docs/profiling-runbook.md](/Users/jrayazian/code/ravens-and-dragons/docs/profiling-runbook.md). It covers idle baselines, human-play retention checks, bot-search allocation churn, and SSE-connected profiling passes.

## Design Docs

- [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md): staged plan for evolving the app into a multi-game service with top-level game modules such as `ravens-and-dragons/`
- [docs/adding-a-new-game.md](/Users/jrayazian/code/ravens-and-dragons/docs/adding-a-new-game.md): canonical guide for adding a new top-level game module
- [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md): planning notes for making the evolved, ruleset-scoped `machine-trained` bot `Michelle` stronger
- [docs/todo.md](/Users/jrayazian/code/ravens-and-dragons/docs/todo.md): canonical list of unfinished follow-up work, updated at explicit wrap-up points rather than during exploratory planning
- [docs/machine-training-runbook.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-training-runbook.md): human-facing guide to the current Michelle pipeline, including runtime behavior, schema-5 features, training, evolution, validation, installation, rollback, and troubleshooting

## Offline Training

Run the current Sherwood-only offline training pipeline with:

```bash
./gradlew runMachineTraining
```

That command writes a run-id-named dataset plus a generated Michelle artifact under `build/machine-trained-candidate` by default, uses all available CPUs unless you override `--worker-count`, reports coarse `0%..10%..100%` progress for dataset generation and model training, and emits schema-5 artifacts with the run id, command arguments, portable paths, seed, worker count, and training parameters embedded in `trainingSummary`.

Run the local evolution loop with `--mode evolve`, an explicit incumbent artifact path, and any number of repeated `--seed-artifact` inputs before installing a generated artifact as the bundled Sherwood model. Evolution writes the best survivor-comparison artifact plus one artifact for each final survivor, all named from the run id unless explicit filename overrides are provided.

For installation and validation steps, use [docs/machine-training-runbook.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-training-runbook.md).

## Local Authentication Setup

Guest and local-account sign-in work without extra setup.

Google sign-in appears only when a Google OAuth client registration is configured. To enable it locally:

1. Copy `.env.local.example` to `.env.local`.
2. Fill in your Google OAuth client values.
3. Start the app from the repository root.

```bash
./gradlew bootRun
```

Expected environment variables:

```text
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email
```

Use standard dotenv `KEY=value` syntax in `.env.local`; shell-only prefixes such as `export` are not supported.

Use these redirect URIs in Google Cloud:

- `http://localhost:8080/login/oauth2/code/google` for local development
- `https://<your-domain>/login/oauth2/code/google` for deployment

## Deployment Notes

The app is set up to run on Railway and other platforms that provide the runtime port through `PORT`.

Railway startup now also defaults `JAVA_TOOL_OPTIONS` to:

```text
-XX:InitialRAMPercentage=5 -XX:MinRAMPercentage=5 -XX:MaxRAMPercentage=80 -XX:+UseG1GC -XX:G1PeriodicGCInterval=30000 -XX:+G1PeriodicGCInvokesConcurrent
```

That keeps the idle heap small, allows the heap to grow under active search load while leaving native headroom inside the container, and asks G1 to run periodic concurrent collections while idle so the JVM is more willing to return unused heap pages after quiet periods. You can still override `JAVA_TOOL_OPTIONS` in Railway if you want different limits for a specific memory tier.

For PostgreSQL deployments, configure these datasource settings:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/<database>
SPRING_DATASOURCE_USERNAME=<username>
SPRING_DATASOURCE_PASSWORD=<password>
SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver
```

Flyway migrations run automatically on startup.

The stale-game eviction threshold defaults to six weeks, and the cleanup scheduler now runs every one-tenth of that configured threshold.

## Project Layout

- `app`: parent application project that aggregates backend and frontend child projects
- `app/backend`: runnable Spring Boot application project that assembles the deployed jar and browser shell
- `app/frontend`: app-owned React shell for auth, lobby, profile, routing, and game-entry registration
- `tic-tac-toe`: parent game module for the Tic-Tac-Toe game
- `tic-tac-toe/backend`: Tic-Tac-Toe game module definition, place-mark command handling, and JVM tests
- `tic-tac-toe/frontend`: Tic-Tac-Toe frontend game entry, create/play UI, and frontend tests
- `gin-rummy`: parent game module for the Gin Rummy game
- `gin-rummy/backend`: Gin Rummy game module definition, card rules, meld/deadwood solving, scoring, command handling, and JVM tests
- `gin-rummy/frontend`: Gin Rummy frontend game entry, create/play UI, hand interactions, and frontend tests
- `platform`: parent shared-service project that aggregates backend and frontend child projects
- `platform/backend`: shared-service backend project for auth, OAuth provider metadata, route fallback, generic web exception handling, the game module contract, and opaque game runtime
- `platform/frontend`: shared frontend package for auth API helpers, game-entry contracts, player picking, and browser hooks
- `buildSrc/src/main/kotlin/FrontendProjectConventionPlugin.kt`: shared Gradle convention for frontend Node/npm build and test wiring
- `gradle/paired-project.gradle.kts`: shared Gradle convention for paired `backend`/`frontend` parent projects
- `ravens-and-dragons`: parent game module that aggregates backend and frontend child projects
- `ravens-and-dragons/backend`: Ravens and Dragons gameplay, game APIs, resources, JVM tests, and training code
- `ravens-and-dragons/frontend`: Ravens and Dragons React game entry, Redux state, browser-side game helpers, and game frontend tests
- `ravens-and-dragons/backend/src/main/kotlin/com/ravensanddragons/game`: backend game rules, bot strategies/orchestration, Ravens session semantics, and the game handler adapter
- `platform/backend/src/main/kotlin/com/ravensanddragons/auth`: authentication and account management
- `ravens-and-dragons/frontend/src/main/frontend`: Ravens game frontend entry, create/play UI, Redux state, and browser-side helpers
- `code-summary.md`: service-wide architecture and implementation summary
- `app/code-summary.md`, `platform/code-summary.md`, `tic-tac-toe/code-summary.md`, `gin-rummy/code-summary.md`, and `ravens-and-dragons/code-summary.md`: project-level implementation summaries
