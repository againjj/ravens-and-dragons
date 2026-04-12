# Implementation Plan

## Recommended Order

Implement these features in this order:

1. Multi-game support
2. Stale game cleanup
3. Database persistence
4. User login and side assignment

This order fits the current codebase because the app is still modeled as a shared in-memory game store. The main architectural shift is turning that singleton into an addressable game resource, then teaching that in-memory layer how to evict abandoned games before adding database persistence. Doing stale cleanup first keeps the one-hour retention rule in the existing in-memory layer instead of mixing a temporary cleanup concern into the first persistence pass. Authentication and player ownership should still come last because those rules depend on persisted game and seat data.

## Ticket Checklist

### Epic 1: Multi-Game Support

1. [x] Introduce a game store abstraction on the backend.
   - Goal: decouple game logic from singleton storage.
   - Change `GameSessionService.kt` so it depends on a `GameStore`-style interface instead of owning one `storedGame`.
   - Add a first in-memory implementation that stores multiple games by id.
   - Keep behavior identical for one game while refactoring internals.

2. [x] Make `GameSession` truly resource-oriented.
   - Goal: stop hardcoding `"default"`.
   - Update `GameModels.kt` so `id` is assigned per game creation path.
   - Add any small request/response models needed for game creation, such as `CreateGameRequest` or `CreateGameResponse`.

3. [x] Refactor service methods to be per-game.
   - Goal: every operation should accept `gameId`.
   - Change service methods from `getGame()`, `applyCommand(...)`, `createEmitter()` to `getGame(gameId)`, `applyCommand(gameId, ...)`, `createEmitter(gameId)`.
   - Keep version-conflict handling per game.
   - Scope SSE emitter lists per game instead of one global emitter list.

4. [x] Add per-game REST and SSE endpoints.
   - Goal: expose multi-game API shape.
   - Update `GameController.kt`.
   - Add:
     - `POST /api/games`
     - `GET /api/games/{gameId}`
     - `POST /api/games/{gameId}/commands`
     - `GET /api/games/{gameId}/stream`
   - Status: the new endpoints are live. The old `/api/game` endpoints still exist in code today, but they should be removed as part of Milestone C now that the frontend no longer depends on them.

5. [x] Add backend tests for game isolation.
   - Goal: prove two games do not interfere.
   - Extend `GameControllerTest.kt` and `GameSessionServiceTest.kt`.
   - Cover:
     - creating two games
     - mutating one game without affecting the other
     - version conflicts only within a single game
     - SSE snapshot delivery scoped to one game

6. [x] Thread `gameId` through the frontend transport layer.
   - Goal: client API calls target the selected game.
   - Update `game-client.ts` so load, command, and stream functions all take `gameId`.
   - Replace hardcoded `/api/game...` URLs with `/api/games/${gameId}...`.

7. [x] Add current-game selection to client state.
   - Goal: the app knows which game is open.
   - Update `gameSlice.ts` or add a small companion slice for `currentGameId`.
   - Update `gameThunks.ts` and `useGameSession.ts` to load and stream the active game only.

8. [x] Add a minimal create/open game UI.
   - Goal: make multi-game usable before building a full lobby.
   - Update `App.tsx` and add a dedicated lobby component instead of expanding `ControlsPanel.tsx`.
   - Implemented shape:
     - lobby at `/`
     - create game button
     - text input for a game ID or pasted link
     - open existing game by ID
     - active game route at `/g/{gameId}`
     - back-to-lobby path from an open game

9. [x] Add frontend tests for per-game routing.
   - Goal: keep client migration safe.
   - Extend `game-client.test.js` and related thunk tests.
   - Cover:
     - fetch URL includes game ID
     - command URL includes game ID
     - stream URL includes game ID
     - switching games reconnects correctly

10. [x] Update docs for the new game resource model.
   - Goal: avoid future confusion.
   - Update `README.md` and `docs/code-summary.md`.

### Epic 2: Stale Game Cleanup

11. [x] Add explicit last-looked-at tracking to stored games.
    - Goal: track staleness independently from gameplay mutation timestamps.
    - Update `GameStore.kt` so each `StoredGame` carries a server-owned `lastAccessedAt` timestamp in addition to the existing session `updatedAt`.
    - Keep `GameSession.updatedAt` meaning "last game state change" so existing optimistic-lock and client equality behavior stays intact.
    - Prefer keeping `lastAccessedAt` server-side for now instead of exposing it on the public session payload.
    - In the same milestone, remove the legacy `/api/game`, `/api/game/commands`, and `/api/game/stream` compatibility routes and the service shortcuts that only exist to support them.

12. [x] Touch games on reads and active viewing paths.
    - Goal: make "looked at within the last hour" match real usage.
    - Update `GameSessionService.kt` so the store touches `lastAccessedAt` when a game is:
      - loaded by `getGame(gameId)`
      - mutated by `applyCommand(gameId, ...)`
      - opened for SSE by `createEmitter(gameId)`
    - Remove the default-only service entry points once the compatibility routes are gone so the per-game methods are the only live API path.
    - Treat an active SSE subscription as non-stale even if no commands happen for more than an hour.
    - On emitter cleanup, refresh `lastAccessedAt` once more so a game that was being watched for a long time does not become immediately stale when the viewer disconnects.

13. [x] Add cleanup-friendly store operations and stale eviction logic.
    - Goal: remove abandoned in-memory games without disturbing active ones.
    - Extend the `GameStore` abstraction with the minimum extra operations needed for cleanup, such as:
      - listing or snapshotting stored games
      - removing a game by id
    - Add a service-level cleanup method, for example `removeStaleGames(now: Instant = Instant.now())`, that:
      - considers a game stale when `lastAccessedAt` is more than one hour old
      - skips any game that still has connected SSE emitters
      - removes per-game locks and emitter lists when a game is evicted
    - Once the compatibility routes are removed, the old `default` game no longer needs special treatment and can be evicted like any other stale game.
    - If a game disappears between selection and removal, treat that as a harmless cleanup race rather than an error.

14. [x] Run stale cleanup on a simple server-side schedule.
    - Goal: make stale eviction automatic without requiring client participation.
    - Add a small Spring scheduling component in the backend game module.
    - Enable scheduling and run stale-game cleanup on a modest cadence such as every 5 or 10 minutes.
    - Keep the one-hour stale threshold as a named constant or small configuration property so the rule is easy to find and adjust later.
    - Keep this milestone entirely in the in-memory layer. Do not introduce DB retention behavior yet.

15. [x] Add stale-game tests and docs.
    - Goal: lock down cleanup behavior before persistence starts.
    - Extend `GameSessionServiceTest.kt` and related controller tests.
    - Cover:
      - a game older than one hour with no viewers is removed
      - a recently loaded game is not removed
      - a game with an active SSE emitter is not removed
      - the legacy `/api/game*` routes are gone
      - loading a removed game returns `404`
    - Update `README.md` and `docs/code-summary.md` after implementation so the in-memory retention rule is documented alongside multi-game behavior.

### Epic 3: Database Persistence

16. Add database and migration dependencies.
    - Goal: introduce durable storage cleanly.
    - Update `build.gradle.kts`.
    - Recommended first pass:
      - Spring Data JDBC or JPA
      - Flyway
      - H2 for local and test
      - PostgreSQL driver for deploy

17. Add database configuration.
    - Goal: app can run locally and in deploy with persistent storage.
    - Update `application.properties`.
    - Add datasource settings with environment-variable overrides.

18. Create the initial games schema.
    - Goal: persist game state without over-modeling too early.
    - Add migration files under the standard resources migration path.
    - Recommended first schema:
      - `games` table
      - columns for `id`, `version`, `created_at`, `updated_at`
      - JSON or text columns for snapshot and undo snapshots
      - selected rule config and selected starting side columns

19. Implement a DB-backed game repository or store.
    - Goal: make database the source of truth for games.
    - Add repository and entity classes in the backend game module.
    - Replace the in-memory store with a DB-backed store behind the same interface.
    - Keep SSE emitters in memory. Only game state needs persistence.

20. Handle concurrency and versioning in persisted updates.
    - Goal: preserve optimistic locking semantics.
    - Enforce version checks in the database update path.
    - Make sure stale writes still surface as the existing `409` response behavior.

21. Add persistence integration tests.
    - Goal: prove save, load, and update behavior survives service restart boundaries.
    - Add repository tests and controller or service integration tests.
    - Cover:
      - create then reload game
      - command updates persist
      - undo snapshots persist
      - optimistic locking and version conflicts still work

22. Add a startup and reconnect smoke-test path.
    - Goal: ensure a user can reopen a persisted game after restart.
    - This can be an integration test or a manual checklist documented in the repo.

23. Document deployment data requirements.
    - Goal: make production persistence intentional.
    - Update `README.md` with DB environment variables and local run instructions.

### Epic 4: Login And Side Assignment

24. Add a user domain model.
    - Goal: establish identity before authorization rules.
    - Add user entity, repository, and basic service.
    - Support multiple authentication modes behind one local user model:
      - session-only guest users
      - local username or email plus password users
      - OAuth-backed users linked to an external provider identity
    - Keep fields minimal at first on the core user record:
      - `id`
      - `displayName`
      - optional `username` or `email`
      - optional `passwordHash`
      - `authType`
      - `createdAt`
    - If OAuth support is added in the same milestone, prefer a small companion identity-link table instead of overloading the main user record with provider-specific columns.
    - Guest users should be persisted only for the lifetime of their authenticated server session and deleted when that session ends.

25. Add Spring Security.
    - Goal: support authenticated sessions.
    - Update `build.gradle.kts` with security dependencies.
    - Add backend security configuration.
    - Recommended first pass: session-cookie auth, not JWT.
    - Require authentication for lobby access, game reads, and SSE watching in Milestone E.
    - Protect seat-claiming and command-mutation routes behind authentication as well.
    - Add the session-lifecycle hooks needed to detect guest-session destruction so temporary guest users can be cleaned up automatically.

26. Add signup, login, and logout endpoints.
    - Goal: make auth usable end to end.
    - Add controller classes for auth flows.
    - Support self-signup and session login for local accounts.
    - Add a guest-login entry point, for example `POST /api/auth/guest`, that creates a temporary guest user and authenticates that session immediately.
    - Add a current-session endpoint so the client can discover whether a viewer is signed out, a guest, or a signed-in user.
    - Add OAuth login initiation and callback handling through Spring Security for at least one provider, while still resolving the result to the same local session-cookie model used by local and guest auth.
    - Keep the frontend-facing auth shape consistent across guest, local, and OAuth logins.

27. Persist player-seat assignments on games.
    - Goal: connect users to sides.
    - Add schema changes for:
      - `dragons_user_id`
      - `ravens_user_id`
      - optional `created_by_user_id`
    - Update game models, repository, and store accordingly.
    - Keep all seat references nullable so a side may become unclaimed later.
    - If a guest user is deleted on session expiry, release any seats they held instead of deleting or ending the game.
    - If `created_by_user_id` is stored for guests, clear or null it safely during guest cleanup rather than preserving a dangling reference.

28. Add seat-claiming or invitation flow.
    - Goal: let a user join a side.
    - Recommended first pass:
      - creator makes a game
      - either side can be claimed explicitly if empty
      - unclaimed users are spectators
      - claiming a side does not happen automatically on first move
    - Add endpoints such as:
      - `POST /api/games/{gameId}/join`
      - or `POST /api/games/{gameId}/claim-side`
    - Prefer a dedicated `claim-side` route over invitation machinery in Milestone E.
    - Treat claiming a side you already own as an idempotent success if that simplifies retries.
    - Do not allow one user to hold both sides at once unless product requirements change later.
    - Consider adding a small `release-side` route if it simplifies testing or guest-session cleanup, but the key requirement is that cleanup can release abandoned seats automatically.

29. Enforce authorization on commands.
    - Goal: only the correct logged-in player can act.
    - In command handling, verify:
      - authenticated user is assigned to the active side
      - spectators cannot mutate
      - wrong-side users cannot mutate
    - Keep this enforcement in the backend game/service layer rather than in React components or controllers alone.
    - Reads and SSE should also require authentication for this milestone.
    - If a guest session expires while the game remains open in another tab or browser, later mutation attempts should fail cleanly until that viewer authenticates again.

30. Expose viewer identity and game seat info to the client.
    - Goal: frontend can render correct affordances.
    - Extend the game payload or add a companion endpoint with:
      - current user
      - dragons player
      - ravens player
      - viewer role for this game
    - Keep a clear separation between persisted canonical game state and request-scoped viewer metadata.
    - Prefer computing `viewerRole` from the authenticated request context rather than persisting it on the game session itself.
    - Make the response shape rich enough for Milestone F to distinguish signed-out viewers, guests, spectators, and the currently assigned player for each side.

31. Add login UI and auth state handling.
    - Goal: users can actually sign in and know who they are.
    - Update frontend state and add auth components.
    - Suggested location: a new auth feature folder under `src/main/frontend/features`.

32. Gate controls by user role and active side.
    - Goal: game UI reflects authorization rules.
    - Update selectors and components so only the assigned user on the active side can move.
    - Spectators should still see the board and history.

33. Add auth and authorization tests.
    - Goal: keep security behavior explicit.
    - Backend:
      - unauthenticated user cannot claim side if protected
      - wrong user cannot submit commands
      - correct user can act
    - Frontend:
      - controls disabled for spectator or wrong side
      - seat info rendered correctly

34. Document user and seat behavior.
    - Goal: make the multiplayer model clear.
    - Update `README.md` and `docs/code-summary.md`.

### Epic 5: Local Account Deletion

35. Add a self-service local account deletion flow.
    - Goal: let a password-based user remove their own account intentionally.
    - Keep this separate from guest-session cleanup so Milestone E stays focused on login and seat assignment.
    - Add an authenticated account-deletion endpoint for the current user.
    - Scope the first pass to local password accounts only; do not require guest or OAuth deletion flows in the same milestone.

36. Require explicit identity confirmation before deleting a local account.
    - Goal: prevent accidental or unauthorized deletion.
    - Require the logged-in local user to confirm their password again before deletion succeeds.
    - Treat account deletion as an explicit user action, not something tied to session expiry.
    - Admin-triggered deletion may be added later, but it is out of scope for this milestone unless product requirements change.

37. Release seats and preserve games when a local user is deleted.
    - Goal: remove the user without damaging active games.
    - On deletion:
      - release any claimed seats held by that user
      - clear nullable ownership references such as `created_by_user_id` if present
      - keep every game intact and readable
      - end the deleted user's authenticated session
    - Perform the cleanup in one transaction so seat release and user deletion cannot drift apart.
    - Add backend tests covering:
      - successful deletion with password confirmation
      - deletion releasing claimed seats
      - games remaining active after user deletion
      - rejected deletion when the password confirmation is wrong

## Milestone Cuts

- Milestone A: tickets 1-5
  - Status: complete.
  - Backend multi-game API works, even before the UI catches up.
  - The legacy `/api/game` routes were left in place during the frontend migration and are now slated for removal in Milestone C.
- Milestone B: tickets 6-10
  - Status: complete.
  - The browser now has a lobby at `/` and game URLs at `/g/{gameId}`.
  - The browser loads, commands, and SSE updates all target per-game endpoints.
  - Newly created games use 7-character IDs from the PLUS-code alphabet.
- Milestone C: tickets 11-15
  - Status: complete.
  - The backend now exposes only per-game routes under `/api/games`.
  - The server evicts in-memory games that have not been accessed for more than one hour, except for games that still have active viewers.
- Milestone D: tickets 16-23
  - Status: complete.
  - Game sessions now persist in the configured database instead of existing only in server memory.
  - Flyway migrations now create the initial `games` schema on startup.
  - The backend preserves optimistic locking and undo history through the DB-backed `GameStore`.
  - SSE emitter tracking remains in memory per app instance, while game state persists across restarts and reconnects.
- Milestone E: tickets 24-30
  - Auth and backend player ownership.
  - Includes session-cookie auth for guest, local, and OAuth login flows.
  - Guest accounts are intentionally session-scoped: when the session ends, the guest user is deleted and any seats they held are released without ending the game.
  - Seat claiming stays explicit and server-enforced, while reads and SSE remain public.
- Milestone F: tickets 31-34
  - Auth-complete user experience.
- Milestone F.5
  - OAuth login cleanup.
  - Hide OAuth provider buttons unless that provider is actually configured on the backend.
  - Preserve the `next` redirect target through OAuth login so provider sign-in returns the user to the requested lobby or game route.
- Milestone G: tickets 35-37
  - Self-service deletion for local password accounts.
  - Deleting a local user releases their seats and clears nullable ownership references without deleting or ending games.

## Milestone B Implementation Summary

Milestone B migrated the browser from the default shared game to an explicit per-game flow while preserving the current React/Redux split:

- keep REST and SSE URL construction in `src/main/frontend/game-client.ts`
- keep shared session and current-game state in `src/main/frontend/features/game`
- keep `src/main/frontend/App.tsx` focused on shell composition
- keep `src/main/frontend/components` focused on rendering and user input

Delivered phases:

### Phase 1: Thread `gameId` through transport and stream helpers

Files to update:

- `src/main/frontend/game-client.ts`
- `src/main/frontend/features/game/gameStream.ts`
- `src/main/frontend/features/game/gameThunks.ts`
- `src/main/frontend/features/game/useGameSession.ts`

Changes:

- Update `fetchGameSession`, `sendGameCommandRequest`, and `openGameStream` to accept a `gameId`.
- Point those helpers at `/api/games/{gameId}`, `/api/games/{gameId}/commands`, and `/api/games/{gameId}/stream`.
- Add a small create-game client helper for `POST /api/games`.
- Keep the transport layer responsible for raw request and response handling, including `409` conflict behavior and SSE event parsing.

Notes:

- This is the narrowest first step because the backend contract already exists.
- Avoid leaving any hardcoded `/api/game` URLs in the active frontend path after this phase.
- With the browser migration complete, the compatibility backend routes can be removed in the next milestone.

### Phase 2: Add current-game state and lifecycle wiring

Files to update:

- `src/main/frontend/features/game/gameSlice.ts`
- `src/main/frontend/features/game/gameSelectors.ts`
- `src/main/frontend/features/game/gameThunks.ts`
- `src/main/frontend/features/game/useGameSession.ts`
- `src/main/frontend/app/store.ts`

Changes:

- Extend the game feature state with a `currentGameId` field and a small set of reducers for:
  - selecting a game id to open
  - marking that a new game is being created or loaded
  - clearing stale feedback when the active game changes
- Update thunks so load, create, and command submission all resolve against `currentGameId`.
- Update `useGameSession` so the load-and-subscribe effect depends on `currentGameId` and reconnects when that id changes.
- Reset or normalize browser-local selection when switching games so a square selected in one game never leaks into another.

Notes:

- Keep `currentGameId` in the existing game slice unless the state shape becomes awkward; Milestone B does not need a separate routing feature.
- The reconnect path should close the previous SSE stream before opening the next one.
- A missing or invalid game id should surface as a normal load error rather than leaving the app half-connected.

### Phase 3: Add a minimal lobby screen, game URLs, and game-screen return path

Files to update:

- `src/main/frontend/App.tsx`
- a new small component under `src/main/frontend/components` for the lobby screen
- `src/main/frontend/hooks/useGameRoute.ts`
- `src/main/resources/static/styles.css` if the existing panel styles need a small extension
- a small backend route-forward so direct loads of `/g/{gameId}` serve the frontend app shell

Changes:

- Add a separate lobby screen for session entry with:
  - create game button
  - text input for game id
  - open game button
- Add browser URL handling so:
  - `/` shows the lobby
  - `/g/{gameId}` shows the requested game
  - direct loads of `/g/{gameId}` work
- Add a game-screen affordance to leave the active session and return to the lobby.
- After creating a game, immediately switch the client to the returned game id and load that session.
- Preserve the existing board, controls, move list, and rules display on the game screen once a game is open.
- Show the active game id on the game screen so copying or re-opening a game is straightforward.
- Treat lobby and active-game views as explicit client state so `App.tsx` can render one screen or the other cleanly.

Notes:

- Keep this flow intentionally lightweight; Milestone B still does not need a full multiplayer lobby with discovery or presence.
- Prefer a dedicated lobby component rather than expanding `ControlsPanel.tsx`, which should stay focused on in-game controls.
- Returning to the lobby should close the active SSE stream and clear browser-local selection so cross-game state does not leak.
- Do not redesign the in-game layout beyond adding a small, clear way back to the lobby.

### Phase 4: Add frontend safety tests for per-game behavior

Files to update:

- `src/test/frontend/game-client.test.js`
- thunk or lifecycle tests under `src/test/frontend/*.test.ts(x)`
- component tests such as `src/test/frontend/controls-panel.test.tsx` if the create/open UI lives there

Add coverage for:

- fetch URLs include the active game id
- command URLs include the active game id
- stream URLs include the active game id
- creating a game stores and uses the returned id
- switching game ids reconnects SSE and loads the new session
- returning to the lobby disconnects the active stream and hides the game screen
- direct browser loads of `/g/{gameId}` open the requested game
- local square selection is cleared or normalized on game switch
- opening an invalid game id shows the expected error state

Notes:

- Keep tests behavior-focused. The important assertion is that the active game changes the client flow, not that a particular internal reducer fires.
- If `useGameSession` remains difficult to test directly, cover the same behavior through a component-level render test that mounts the real hook.

### Phase 5: Refresh docs after the frontend cutover

Files to update:

- `README.md`
- `docs/code-summary.md`

Changes:

- Update the runtime-flow section to say the browser now targets the per-game endpoints.
- Document the minimal create/open game flow in the UI.
- Clarify that the compatibility `/api/game` routes were only transitional and should be removed once Milestone C lands.

## Milestone B Exit Criteria

Milestone B is done when all of the following are true:

- a browser user can create a game from the UI
- a browser user can open an existing game by id
- a browser user can load a game directly at `/g/{gameId}`
- a browser user can leave an open game and return to the lobby screen
- initial load, commands, and SSE updates all target the selected game id
- switching from one game to another updates the rendered session and reconnects the stream cleanly
- frontend tests cover the per-game transport and switching path
- `README.md` and `docs/code-summary.md` describe the new browser behavior

## Milestone B Risks And Guardrails

- The biggest migration risk is stale cross-game client state. Treat `currentGameId` changes as a session boundary and clear or recompute any local UI state tied to one snapshot.
- The lobby-to-game transition should be driven from state, not ad hoc conditional rendering spread across multiple components.
- Keep command thunks dependent on the latest store state so commands cannot accidentally post to an old game after a fast switch.
- Avoid coupling lobby UI to gameplay controls more than necessary. A dedicated lobby component is safer than letting `ControlsPanel.tsx` absorb unrelated responsibilities.
- Preserve the current no-game and load-error UX wording where possible so the change stays focused on resource routing, not product copy.

## Milestone C Implementation Summary

Milestone C should stay entirely inside the existing in-memory backend architecture. The goal is to remove the now-unused default-game compatibility layer, add server-owned access tracking to stored games, and let the service evict abandoned games on a schedule without disturbing active viewers.

Keep the implementation centered in the Kotlin game module:

- extend `src/main/kotlin/com/dragonsvsravens/game/GameStore.kt` instead of creating a second cleanup-specific storage path
- keep cleanup decisions in `src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt`, where emitter and per-game lock ownership already live
- keep `src/main/kotlin/com/dragonsvsravens/game/GameController.kt` focused on the public per-game API only
- keep test support aligned with `/api/games/{gameId}` so controller tests stop depending on the transitional default routes

Delivered phases:

### Phase 1: Remove the legacy default-game API path

Files to update:

- `src/main/kotlin/com/dragonsvsravens/game/GameController.kt`
- `src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt`
- `src/test/kotlin/com/dragonsvsravens/game/DefaultGameControllerCompatibilityTest.kt`
- `src/test/kotlin/com/dragonsvsravens/game/AbstractGameControllerTestSupport.kt`
- `docs/code-summary.md`
- `README.md`

Changes:

- Delete the compatibility routes:
  - `GET /api/game`
  - `POST /api/game/commands`
  - `GET /api/game/stream`
- Delete the default-only service overloads:
  - `getGame()`
  - `applyCommand(command)`
  - `createEmitter()`
- Remove `defaultGameId` bootstrapping and `ensureDefaultGameExists()` so the service no longer creates a permanent special-case game at startup.
- Replace the compatibility controller test file with explicit assertions that `/api/game*` now returns `404`.
- Refactor shared controller-test helpers so they create and query real games by id rather than reseeding a special default game.

Notes:

- This is the cleanest first step because it removes the main source of special-case behavior before cleanup logic is added.
- Any remaining tests that currently use the default game should be moved to normal per-game setup helpers in the same pass.

### Phase 2: Add server-owned access timestamps to stored games

Files to update:

- `src/main/kotlin/com/dragonsvsravens/game/GameStore.kt`
- `src/main/kotlin/com/dragonsvsravens/game/GameSessionFactory.kt`
- `src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt`

Changes:

- Extend `StoredGame` with `lastAccessedAt: Instant`.
- Initialize `lastAccessedAt` when a game is created.
- Keep `GameSession.updatedAt` tied to gameplay/session mutation only; do not expose `lastAccessedAt` in the public JSON payload.
- Add store support for updating access time without forcing unrelated session changes.

Recommended store surface:

- `touch(gameId: String, accessedAt: Instant = Instant.now()): StoredGame?`
- `entries(): List<StoredGame>`
- `remove(gameId: String): Boolean`

Notes:

- A targeted `touch` operation keeps staleness concerns server-side and avoids fake version bumps or noisy SSE broadcasts.
- `entries()` should return a stable snapshot for cleanup work rather than exposing the mutable map directly.

### Phase 3: Touch access time on real usage paths

Files to update:

- `src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt`

Changes:

- Touch `lastAccessedAt` when a game is loaded with `getGame(gameId)`.
- Touch `lastAccessedAt` when a command is applied successfully.
- Touch `lastAccessedAt` when an SSE stream is opened for a game.
- Touch `lastAccessedAt` again when the final emitter for a game disconnects, so a long-viewed game is not evicted immediately after the viewer leaves.

Notes:

- For command handling, touch after the updated state is written so the stored access time and latest session stay in sync.
- Avoid broadcasting on read-only touches; viewers should not receive events just because someone opened or watched a game.

### Phase 4: Add stale-game eviction and scheduled cleanup

Files to update:

- `src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt`
- a new small scheduling class under `src/main/kotlin/com/dragonsvsravens/game`
- `src/main/kotlin/com/dragonsvsravens/DragonsVsRavensApplication.kt` or another configuration entrypoint if scheduling is not already enabled

Changes:

- Add a named stale threshold constant or property for the one-hour retention rule.
- Add `removeStaleGames(now: Instant = Instant.now())` to `GameSessionService`.
- During cleanup:
  - inspect a snapshot of stored games from `GameStore`
  - skip games whose `lastAccessedAt` is within the threshold
  - skip games that still have connected emitters
  - remove stale games from the store
  - remove matching emitter lists and lock objects as part of eviction
- Run cleanup on a modest Spring schedule such as every 5 or 10 minutes.

Notes:

- Treat missing-on-remove as a harmless race so cleanup remains idempotent.
- Since the compatibility layer is gone by this point, there should be no permanent in-memory game that is exempt from eviction.

### Phase 5: Replace compatibility tests with cleanup-focused coverage

Files to update:

- `src/test/kotlin/com/dragonsvsravens/game/GameSessionServiceTest.kt`
- `src/test/kotlin/com/dragonsvsravens/game/GameControllerTest.kt`
- `src/test/kotlin/com/dragonsvsravens/game/AbstractGameControllerTestSupport.kt`

Add coverage for:

- a game older than one hour with no viewers is removed
- a recently loaded game is retained because `getGame(gameId)` touched it
- a game with an active SSE emitter is retained during cleanup
- a game touched on emitter disconnect is not removed immediately after the stream closes
- cleanup removes per-game lock and emitter bookkeeping alongside the store entry
- loading an evicted game returns `404`
- the removed `/api/game*` routes return `404`

Notes:

- Prefer direct service tests for timestamp and eviction behavior, because they can inject a deterministic `now`.
- Keep controller tests focused on public HTTP behavior and removed-route assertions.

## Milestone C Exit Criteria

Milestone C is done when all of the following are true:

- the backend exposes only `/api/games` and `/api/games/{gameId}*` game endpoints
- the service no longer creates or relies on a permanent `"default"` game
- each stored in-memory game tracks server-owned last-access time separately from session mutation time
- game loads, successful commands, and stream open/close paths keep `lastAccessedAt` fresh
- scheduled cleanup removes games that have been unviewed for more than one hour
- active SSE viewers prevent eviction while connected
- controller and service tests cover both stale eviction behavior and the removed compatibility routes
- `README.md` and `docs/code-summary.md` describe the one-hour in-memory retention rule and no longer document `/api/game*`

## Milestone C Risks And Guardrails

- The highest-risk regression is accidentally changing public session semantics while adding staleness tracking. Keep `lastAccessedAt` off the wire and do not reuse `updatedAt` for cleanup.
- Emitter lifecycle code is now part of cleanup correctness. Centralize the touch-on-open and touch-on-final-disconnect logic so it is not duplicated across callbacks.
- Cleanup must not race with command handling in a way that removes a game mid-update. Use the existing per-game lock model and treat cleanup as best-effort rather than strictly synchronized across the whole store.
- Removing the default routes will break any still-hidden callers immediately. Before landing Milestone C, verify that no frontend code or tests still reference `/api/game`.
- Test support should stop reseeding a special default game. Reusing that pattern would preserve the very coupling Milestone C is meant to delete.

## Scope Recommendations

- For persistence, start with storing the full game state as a JSON or text blob instead of normalizing turns, squares, and undo history into many tables.
- For authentication, start with server-side session cookies and open-seat claiming rather than JWT and invitations.
- For the first multi-game UI, favor a minimal create-or-open flow over a full lobby.

## Recommended First Deliverable

Build a thin vertical slice for multi-game support first:

- create a game
- open a game by id
- send commands to that game
- receive SSE updates for that game

That establishes the right resource model and makes the persistence and login work much cleaner afterward.

## Current Status

- Completed:
  - backend in-memory multi-game store
  - per-game service methods and SSE scoping
  - multi-game REST and SSE endpoints
  - backend isolation tests
  - frontend per-game transport, state, and stream wiring
  - lobby-first browser flow with `/` and `/g/{gameId}` routes
  - direct-load server support for game URLs
  - 7-character PLUS-code-style game ids
  - frontend routing and lifecycle tests
  - docs updates for the multi-game browser flow
  - removed legacy `/api/game*` routes and default-game bootstrap behavior
  - server-owned `lastAccessedAt` tracking for each in-memory game
  - access-time refresh on load, command, stream open, and final stream disconnect
  - store touch/list/remove operations for cleanup
  - scheduled stale-game eviction with active-viewer protection
  - cleanup-focused controller and service tests
  - docs updates for the one-hour in-memory retention rule
