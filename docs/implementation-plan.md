# Implementation Plan

## Recommended Order

Implement these features in this order:

1. Multi-game support
2. Database persistence
3. User login and side assignment

This order fits the current codebase because the app is still modeled as a single shared in-memory game. The main architectural shift is turning that singleton into an addressable game resource. Persistence should be added after that so the database reflects the correct multi-game shape. Authentication and player ownership should come last because those rules depend on persisted game and seat data.

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
   - Status: the new endpoints are live, and the old `/api/game` endpoints are intentionally still present as compatibility aliases for the default game so the current frontend can keep working during Milestone B.

5. [x] Add backend tests for game isolation.
   - Goal: prove two games do not interfere.
   - Extend `GameControllerTest.kt` and `GameSessionServiceTest.kt`.
   - Cover:
     - creating two games
     - mutating one game without affecting the other
     - version conflicts only within a single game
     - SSE snapshot delivery scoped to one game

6. Thread `gameId` through the frontend transport layer.
   - Goal: client API calls target the selected game.
   - Update `game-client.ts` so load, command, and stream functions all take `gameId`.
   - Replace hardcoded `/api/game...` URLs with `/api/games/${gameId}...`.

7. Add current-game selection to client state.
   - Goal: the app knows which game is open.
   - Update `gameSlice.ts` or add a small companion slice for `currentGameId`.
   - Update `gameThunks.ts` and `useGameSession.ts` to load and stream the active game only.

8. Add a minimal create/open game UI.
   - Goal: make multi-game usable before building a full lobby.
   - Update `App.tsx` and likely `ControlsPanel.tsx` or a new component.
   - Suggested first pass:
     - Create game button
     - Text input for a game ID or pasted link
     - Open existing game by ID

9. Add frontend tests for per-game routing.
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

### Epic 2: Database Persistence

11. Add database and migration dependencies.
    - Goal: introduce durable storage cleanly.
    - Update `build.gradle.kts`.
    - Recommended first pass:
      - Spring Data JDBC or JPA
      - Flyway
      - H2 for local and test
      - PostgreSQL driver for deploy

12. Add database configuration.
    - Goal: app can run locally and in deploy with persistent storage.
    - Update `application.properties`.
    - Add datasource settings with environment-variable overrides.

13. Create the initial games schema.
    - Goal: persist game state without over-modeling too early.
    - Add migration files under the standard resources migration path.
    - Recommended first schema:
      - `games` table
      - columns for `id`, `version`, `created_at`, `updated_at`
      - JSON or text columns for snapshot and undo snapshots
      - selected rule config and selected starting side columns

14. Implement a DB-backed game repository or store.
    - Goal: make database the source of truth for games.
    - Add repository and entity classes in the backend game module.
    - Replace the in-memory store with a DB-backed store behind the same interface.
    - Keep SSE emitters in memory. Only game state needs persistence.

15. Handle concurrency and versioning in persisted updates.
    - Goal: preserve optimistic locking semantics.
    - Enforce version checks in the database update path.
    - Make sure stale writes still surface as the existing `409` response behavior.

16. Add persistence integration tests.
    - Goal: prove save, load, and update behavior survives service restart boundaries.
    - Add repository tests and controller or service integration tests.
    - Cover:
      - create then reload game
      - command updates persist
      - undo snapshots persist
      - optimistic locking and version conflicts still work

17. Add a startup and reconnect smoke-test path.
    - Goal: ensure a user can reopen a persisted game after restart.
    - This can be an integration test or a manual checklist documented in the repo.

18. Document deployment data requirements.
    - Goal: make production persistence intentional.
    - Update `README.md` with DB environment variables and local run instructions.

### Epic 3: Login And Side Assignment

19. Add a user domain model.
    - Goal: establish identity before authorization rules.
    - Add user entity, repository, and basic service.
    - Keep fields minimal at first: id, username or email, password hash, createdAt.

20. Add Spring Security.
    - Goal: support authenticated sessions.
    - Update `build.gradle.kts` with security dependencies.
    - Add backend security configuration.
    - Recommended first pass: session-cookie auth, not JWT.

21. Add signup, login, and logout endpoints.
    - Goal: make auth usable end to end.
    - Add controller classes for auth flows.
    - Decide whether to support self-signup or seeded test users first.

22. Persist player-seat assignments on games.
    - Goal: connect users to sides.
    - Add schema changes for:
      - `dragons_user_id`
      - `ravens_user_id`
      - optional `created_by_user_id`
    - Update game models, repository, and store accordingly.

23. Add seat-claiming or invitation flow.
    - Goal: let a user join a side.
    - Recommended first pass:
      - creator makes a game
      - either side can be claimed if empty
      - unclaimed users are spectators
    - Add endpoints such as:
      - `POST /api/games/{gameId}/join`
      - or `POST /api/games/{gameId}/claim-side`

24. Enforce authorization on commands.
    - Goal: only the correct logged-in player can act.
    - In command handling, verify:
      - authenticated user is assigned to the active side
      - spectators cannot mutate
      - wrong-side users cannot mutate
    - Reads and SSE can remain public or authenticated depending on product choice.

25. Expose viewer identity and game seat info to the client.
    - Goal: frontend can render correct affordances.
    - Extend the game payload or add a companion endpoint with:
      - current user
      - dragons player
      - ravens player
      - viewer role for this game

26. Add login UI and auth state handling.
    - Goal: users can actually sign in and know who they are.
    - Update frontend state and add auth components.
    - Suggested location: a new auth feature folder under `src/main/frontend/features`.

27. Gate controls by user role and active side.
    - Goal: game UI reflects authorization rules.
    - Update selectors and components so only the assigned user on the active side can move.
    - Spectators should still see the board and history.

28. Add auth and authorization tests.
    - Goal: keep security behavior explicit.
    - Backend:
      - unauthenticated user cannot claim side if protected
      - wrong user cannot submit commands
      - correct user can act
    - Frontend:
      - controls disabled for spectator or wrong side
      - seat info rendered correctly

29. Document user and seat behavior.
    - Goal: make the multiplayer model clear.
    - Update `README.md` and `docs/code-summary.md`.

## Milestone Cuts

- Milestone A: tickets 1-5
  - Status: complete.
  - Backend multi-game API works, even before the UI catches up.
  - The legacy `/api/game` routes remain in place as default-game compatibility aliases until the frontend is migrated.
- Milestone B: tickets 6-10
  - Full multi-game vertical slice in the browser.
- Milestone C: tickets 11-18
  - Multi-game plus persistence.
- Milestone D: tickets 19-25
  - Auth and backend player ownership.
- Milestone E: tickets 26-29
  - Auth-complete user experience.

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
  - backend isolation and compatibility tests
  - docs updates for the backend resource model
- Remaining before Milestone B is done:
  - thread `gameId` through the frontend transport layer
  - add current-game selection state
  - add minimal create/open game UI
  - add frontend routing tests
