# Multi-Game Service Structure Plan

## Goal

Evolve the current single-game application toward a service that can host multiple games, where each game can eventually be built independently and may live in its own repository. The service should keep shared infrastructure in one place while letting `ravens-and-dragons` remain a top-level game module, not nested under `games/`.

## Target Shape

The long-term Gradle structure should make these boundaries visible:

```text
settings.gradle.kts
build.gradle.kts

platform/
  build.gradle.kts
  src/main/kotlin/...
  src/main/frontend/...
  src/test/...

ravens-and-dragons/
  build.gradle.kts
  src/main/kotlin/...
  src/main/frontend/...
  src/main/resources/...
  src/test/...

app/
  build.gradle.kts
  src/main/kotlin/...
  src/main/resources/...
  src/test/...
```

- `platform/` owns shared service capabilities: authentication, shared web error handling, lobby-level models, common routing conventions, persistence conventions, and reusable frontend shell code.
- `ravens-and-dragons/` owns this game's canonical rules, bots, game-specific persistence payloads, game-specific API adapters, game-specific frontend screens, assets, and tests.
- `app/` owns the runnable Spring Boot application. It wires the platform and the selected game modules into one deployable service.
- The root project owns orchestration tasks such as aggregate build, aggregate test, formatting, and deployment-facing packaging.

This layout keeps game modules as first-class top-level projects. If a future game is added locally, it can sit beside `ravens-and-dragons/` with its own name. If a game moves to a separate repository later, the same boundary can be preserved through a Gradle composite build or published artifact.

## Build Semantics

The target command vocabulary should be explicit:

```bash
./gradlew :ravens-and-dragons:test
./gradlew :platform:test
./gradlew :app:test
./gradlew test
./gradlew check
```

- `:ravens-and-dragons:test` runs only this game's tests.
- `:platform:test` runs only shared infrastructure tests.
- `:app:test` runs only wiring and integration tests for the assembled service.
- Root `test` depends on the test tasks for all included modules.
- Root `check` depends on full verification, including frontend tests and any packaging checks.
- Parallel test execution should be enabled at the Gradle scheduling level first, then within individual test tasks only when the tests are isolated enough.

For the near term, the current `testFrontend` task should stop being executed manually inside the JVM `test` task. Frontend and backend tests should become normal Gradle tasks so filtered backend test runs do not accidentally run frontend tests.

## Game Module Contract

Before adding a second game, define a small contract between `platform/`, `app/`, and each game module. The contract should cover:

- Stable game id, slug, display name, and route prefix.
- Backend command and query endpoints, or an adapter that can register game-specific routes with the app.
- Canonical game session payloads and serialization boundaries.
- Seat ownership and auth expectations shared with the platform.
- Frontend entry metadata so the app can load the right UI for a game route.
- Static asset contribution rules.
- Database migration ownership and naming conventions.
- Test fixtures or smoke checks that prove the game can be loaded through the assembled app.

The first version of this contract should be minimal and should be extracted from real `ravens-and-dragons` needs, not designed around hypothetical games too early.

## Persistence And Routes

The current app has game sessions stored under one `games` table and routes such as `/g/{gameId}`. A multi-game service will need to distinguish the hosting service's session id from the type of game being played.

Likely route direction:

```text
/
/games
/games/{gameSlug}/create
/games/{gameSlug}/{gameId}
/api/games/{gameSlug}
/api/games/{gameSlug}/{gameId}
```

The existing `/g/{gameId}` route can remain as a compatibility route during migration if needed.

Likely persistence direction:

- Add a `game_slug` or equivalent discriminator to stored sessions before multiple game types share the same service database.
- Keep shared session metadata in platform-owned tables.
- Keep game-specific snapshot payloads opaque to the platform where possible.
- Give each game module a migration namespace or clear migration file prefix so independent game schemas do not collide.

## Frontend Boundary

The current frontend mixes app shell, auth, lobby, game-specific UI, and game-specific local rules helpers in one source tree. The future structure should separate:

- Shared shell and auth UI in `platform/`.
- Game-specific components, board rendering, move formatting, local selection helpers, and create-game flows in `ravens-and-dragons/`.
- App-level route selection and bundle assembly in `app/`.

The first frontend extraction should be conservative. Move code only when the boundary is obvious, such as auth/session shell code versus `ravens-and-dragons` board and rules UI.

## Migration Plan

1. Clean up current test task wiring.
   - Make JVM tests and frontend tests separate Gradle tasks.
   - Make root `check` or root `test` aggregate the full suite.
   - Preserve the ability to run filtered Kotlin tests without running frontend tests.

2. Introduce top-level subprojects without changing behavior.
   - Create `platform/`, `ravens-and-dragons/`, and `app/` Gradle projects.
   - Move files mechanically, keeping package names stable at first where practical.
   - Wire `app` to produce the same Spring Boot jar currently produced by the root project.

3. Move obvious platform code out of the game module.
   - Auth, OAuth provider metadata, generic web exception handling, and route fallback behavior belong in `platform/`.
   - Keep canonical Ravens and Dragons rules, bots, board helpers, and game-specific UI in `ravens-and-dragons/`.

4. Define the first game module contract.
   - Start with the adapter points needed by `ravens-and-dragons`.
   - Avoid designing for unrelated game mechanics until a second game reveals the need.

5. Update routing and persistence to include game identity.
   - Add game slug handling at API, browser route, and database boundaries.
   - Keep compatibility routes only as long as they reduce migration risk.

6. Prepare for external game repos.
   - Make `ravens-and-dragons` buildable and testable as an independent Gradle project.
   - Decide later between composite builds, published artifacts, or source checkouts for external games.
   - Keep the app's included-game list declarative.

## Risks And Guardrails

- Do not split canonical Ravens and Dragons gameplay rules between frontend and backend.
- Do not redesign gameplay or UX as part of the build restructure.
- Keep each step behavior-preserving unless a route or persistence migration explicitly requires compatibility handling.
- Keep tests independent so Gradle and test runners can safely parallelize them.
- Prefer small mechanical moves with green tests over broad rewrites.
- Update `docs/code-summary.md` and `README.md` when implementation begins and the actual structure changes.

## Open Questions

- Should root `test` mean the full aggregate suite, or should root `check` be the only full-suite command while each project keeps its own `test` task?
- Should `platform/` include shared frontend code immediately, or should frontend extraction wait until after backend Gradle modules are stable?
- Should game-specific database migrations live inside each game module, or should `app/` collect and order all migrations centrally?
- How long should compatibility routes like `/g/{gameId}` remain after game slugs are introduced?
