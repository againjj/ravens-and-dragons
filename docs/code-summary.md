# Code Summary

## Overview

This project is a small Spring Boot 3.3 + Kotlin 2.1 web app that serves a browser-based board game prototype. The backend supports multiple persisted game sessions, addressed by game id, and broadcasts updates over server-sent events per game. The frontend now opens on a lobby screen, creates or opens games by id, and then talks to the per-game backend API for the active session.

The backend now also includes session-cookie authentication for guest and local users, optional OAuth login wiring, persisted seat ownership on games, and request-scoped game-view metadata. The frontend now consumes that auth-aware view data, surfaces guest/local auth controls, requires authentication before entering the lobby or a game, and gates gameplay actions by claimed side and active turn. Google OAuth availability is now configuration-aware, and successful Google login returns to the original `/login?next=...` destination.

## Current Architecture

- `src/main/kotlin/com/dragonsvsravens/DragonsVsRavensApplication.kt`
  - Spring Boot entrypoint.
- `src/main/kotlin/com/dragonsvsravens/game/*.kt`
  - Server-side game state models, pure-ish rules, the JDBC-backed game store, the session service, and REST/SSE endpoints.
- `src/main/kotlin/com/dragonsvsravens/auth/*.kt`
  - Session auth models, JDBC-backed user persistence, guest and local login flows, optional OAuth login integration, and session cleanup hooks for temporary guest users.
- `src/main/resources/db/migration/*.sql`
  - Flyway migrations for the persistent game schema.
- `src/main/frontend/index.html`
  - Frontend HTML entry for the Vite build.
  - Loads `/styles.css` and mounts the React app.
- `src/main/resources/static/styles.css`
  - Owns layout, board sizing variables, responsive behavior, and fullscreen styling.
- `src/main/frontend/game.ts`
  - Frontend wire types and render-side helpers.
  - Exports board helpers, ownership/capture helpers, move formatting, and local selection normalization.
- `src/main/frontend/game-client.ts`
  - Transport helpers for REST commands and SSE subscription setup.
- `src/main/frontend/App.tsx`
  - Top-level React layout and shell composition.
  - Switches between the lobby screen and the active game screen.
- `src/main/frontend/app/*.ts`
  - Redux store setup and typed hooks.
- `src/main/frontend/features/game/*.ts`
  - Game slice, selectors, thunks, and stream lifecycle wiring.
  - Includes current-game and current-view state, auth-aware game metadata, exact undo availability and ownership, and command/claim-side thunks.
- `src/main/frontend/features/auth/*.ts`
  - Auth session slice, selectors, and guest/local auth thunks.
- `src/main/frontend/features/ui/*.ts`
  - Local-only UI state such as selected square.
- `src/main/frontend/components/*.tsx`
  - React components for the lobby screen, auth panel, seat display, board rendering, controls, move list, and status text.
- `src/main/frontend/hooks/*.ts`
  - Browser hooks for responsive sizing, fullscreen behavior, and URL-to-game routing.
  - `useBoardSizing.ts` now measures the padded board panel so the board can shrink and grow without overflowing the panel.
- `src/test/frontend/game.test.js`
  - Frontend helper tests for server-backed snapshots and local-only selection behavior.
- `src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt`
  - Verifies backend rule transitions match the current game rules.
- `src/test/kotlin/com/dragonsvsravens/game/GameControllerTest.kt`
  - Verifies the shared game API, version conflicts, and validation errors.
- `src/test/kotlin/com/dragonsvsravens/DragonsVsRavensApplicationTests.kt`
  - Verifies the Spring application context loads.

## Build And Runtime Flow

- Gradle is the primary build entrypoint.
- `build.gradle.kts` uses:
  - Spring Boot for serving the app.
  - Kotlin/JVM with Java 21.
  - Spring JDBC plus Flyway for persistence.
  - `com.github.node-gradle.node` to download Node and npm automatically.
- Frontend build flow:
  - `npm run build` runs `tsc && vite build`.
  - `tsconfig.json` typechecks the frontend TypeScript and TSX source.
  - `vite.config.ts` builds the frontend entry and bundle into `build/generated/frontend`.
  - `processResources` depends on the frontend build and copies the generated assets into the app's `static` resources.
- Frontend test flow:
  - `npm run test` runs Node's built-in test runner against the shared helper tests and Vitest against the React/Redux frontend tests.
  - Gradle task `testFrontend` runs the frontend tests.
  - `./gradlew test` runs both the frontend tests and the Kotlin/Spring test task.
- Runtime flow:
  - The browser lobby lives at `/`.
  - The browser treats `/g/{gameId}` as the canonical active-game URL.
  - Loading `/g/{gameId}` directly opens that game in the browser.
  - Session inspection uses `GET /api/auth/session`.
  - Guest login uses `POST /api/auth/guest`.
  - Local signup and login use `POST /api/auth/signup` and `POST /api/auth/login`.
  - Local and guest logout use `POST /api/auth/logout`.
  - Creating a game uses `POST /api/games`.
  - Opening a game by id uses `GET /api/games/{gameId}`.
  - Seat claiming uses `POST /api/games/{gameId}/claim-side`.
  - A request-scoped auth-aware game view is available at `GET /api/games/{gameId}/view`.
  - The active game screen sends mutations to `POST /api/games/{gameId}/commands`.
  - The active game screen subscribes to `GET /api/games/{gameId}/stream` for live updates.
  - Games are stored in the configured database and are automatically evicted when they have not been accessed longer than the configured stale threshold and no SSE viewers are connected.
- Runtime configuration:
  - `server.port` reads `${PORT:8080}` so the app keeps its local default while also working on Railway-style platforms that inject the listen port at runtime.
  - `spring.datasource.*` defaults to an H2 file database for local persistence and may be overridden for PostgreSQL deploys.
  - `dragons-vs-ravens.games.stale-threshold` controls how long an inactive game can sit before eviction, and defaults to six weeks (`1008h`).
  - Google OAuth is enabled only when the environment defines a `google` Spring client registration through `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET`, and typically `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email`.
  - Google callback URLs should use `/login/oauth2/code/google`, such as `http://localhost:8080/login/oauth2/code/google` locally or `https://<deploy-host>/login/oauth2/code/google` in production.
  - Railway deploys should set `SPRING_DATASOURCE_URL` to a JDBC host-only URL such as `jdbc:postgresql://<host>:<port>/<db>` and pass username/password separately through `SPRING_DATASOURCE_USERNAME` and `SPRING_DATASOURCE_PASSWORD`.
  - `railway up` uploads the current local workspace, while `railway service redeploy` only restarts the latest already-uploaded deployment.
  - Flyway runs startup migrations from `classpath:db/migration`, and the Gradle build now pins Flyway to `10.22.0` plus `flyway-database-postgresql` so Railway's PostgreSQL 18 startup is accepted.
  - `railway.json` overrides Railway's deploy start command to `java -jar build/libs/dragons-vs-ravens.jar`, points Railway health checks at `GET /health`, and matches the Spring Boot fat jar produced by the Gradle build.
- Result:
  - Running `./gradlew bootRun` serves the Vite-built frontend bundle plus static CSS through Spring Boot.

## Game Model

The canonical board is represented on the server as `Map<String, Piece>` and on the wire as a JSON object keyed by square name like `e5`.

- `Piece = "dragon" | "raven" | "gold"`
- `Side = "dragons" | "ravens"`
- `Phase = "none" | "setup" | "move" | "capture"`
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

`turns` now stores typed turn history entries, so the shared history can include both completed moves and a terminal `gameOver` marker.

`GameSession` currently also contains:

- `lifecycle` (`new`, `active`, or `finished`)
- `canUndo`
- `availableRuleConfigurations`
- `selectedRuleConfigurationId`
- `selectedStartingSide`
- `selectedBoardSize`
- `dragonsPlayerUserId`
- `ravensPlayerUserId`
- `createdByUserId`

The backend also now exposes auth-oriented DTOs outside the canonical session payload:

- `AuthSessionResponse`
- `GameViewResponse`
- `viewerRole`
- player summaries for the claimed dragons and ravens seats
- configured OAuth provider ids for the login UI

Important implication: game state is now persisted in the configured database, so clients can reopen the same game after server restart. SSE subscriptions and live fanout remain in memory per app instance, so persistence does not by itself add cross-instance push delivery.

## Responsibilities By File

### Backend game module

The Kotlin game module is now the source of truth for game rules and state transitions.

- Creates fresh idle snapshots for new games.
- Owns setup cycling logic.
- Owns turn transitions.
- Owns rule-configuration lookup, movement validation, capture resolution, and automatic game-over checks.
- Wraps each snapshot in a versioned persisted game session.
- Keeps server-only undo snapshot history alongside the public shared session payload.
- Serializes snapshots and undo history into the `games` table.
- Broadcasts updated snapshots to SSE clients scoped by game id.
- Tracks last access time server-side for stale-game eviction.
- Persists which local user, if any, currently owns each side.
- Enforces that only the authenticated player on the active side may submit commands on the web API path.

Most gameplay changes should start on the backend here.

### Backend auth module

The auth module now owns identity and session concerns without moving canonical game rules out of the game module.

- Creates persisted guest and local users.
- Supports session-cookie sign-in and sign-out.
- Wires optional OAuth login so configured providers can resolve to the same local user model.
- Stores only request-scoped viewer identity in auth/session DTOs instead of persisting viewer role on the game session.
- Deletes session-only guest users on logout or session destruction and releases any seats they held without ending the game.

### React frontend

The React frontend is now split by responsibility.

- `App.tsx` composes the page shell and top-level sections.
- Redux owns shared client state such as the latest server session, auth session, loading/submission state, connection state, feedback messages, and local selection.
- Redux also owns the current browser view (`lobby` or `game`) plus the current game id.
- `gameThunks.ts` coordinates lobby create/open actions, game-view refreshes, seat claiming, and command submission against the backend API.
- `authThunks.ts` coordinates current-session loading plus guest/local login and logout flows.
- `gameStream.ts` plus `useGameSession.ts` open and maintain the SSE subscription only for the active game screen.
- `useGameRoute.ts` maps browser URLs to lobby or game state and keeps the address bar in sync with the active game id.
- `Board.tsx`, `ControlsPanel.tsx`, `MoveList.tsx`, and `StatusBanner.tsx` render the current UI from Redux state.
- `LobbyScreen.tsx` renders the create-or-open entry flow before a game is active.
- `useBoardSizing.ts` and `useFullscreen.ts` wrap browser-specific layout and fullscreen behavior.

Most UI-only changes should start in the relevant component, selector, or browser hook.

## Current Rules Implemented

### Lobby and game entry

- The browser initially loads into a lobby screen.
- The lobby can create a new persisted game or open an existing game by id.
- The page shell now also shows auth controls for guest access, local signup/login, logout, and an OAuth sign-in link for supported deployments.
- The lobby presents separate create and rejoin cards, uppercases typed game ids locally, and keeps `Open Game` disabled until an id is present.
- Once a game is created or opened, the browser enters that game's board screen and updates the URL to `/g/{gameId}`.
- Loading `/g/{gameId}` directly also enters that game's board screen.
- The game screen shows the current game id and includes a `Back to Lobby` button.
- Returning to the lobby closes the active SSE stream, clears browser-local selection, and returns the URL to `/`.
- If the browser entered the app directly on `/g/{gameId}`, returning to the lobby replaces that direct-entry history slot so browser Back still leaves the app instead of reopening the same game route.

### Free Play

- Once a game screen is open and `Free Play` is selected in the no-game state, the browser also shows shared controls for starting side and square board size.
- Free Play board size may be selected from `3x3` through `26x26`.
- `Free Play` preserves the original setup flow:
  - starting the game enters `setup`
  - clicking a square cycles `empty -> dragon -> raven -> gold -> empty`
  - any square, including `d4`, can be changed during setup
  - any number of gold pieces may be placed during setup
- Ending setup switches to `move`, the selected starting side moves first, dragons may move dragons or gold, ravens may move ravens, and movement allows any owned piece to move to any empty square.
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
- Pieces move any distance orthogonally without jumping over occupied squares.
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
- Dragons and ravens move any distance orthogonally without jumping over occupied squares.
- The gold may move only one orthogonal square at a time.
- Landing restrictions, self-capture prevention, automatic capture rules, win conditions, and draw conditions otherwise match `Original Game`.

### Sherwood x 9

- `Sherwood x 9` uses the Sherwood Rules movement, capture, win, and draw behavior on a `9x9` board.
- The special square is `e5`.
- The setup is the Sherwood cross formation shifted one file right and one rank up so the gold starts on `e5`.
- Ravens move first.

### Shared play behavior

- Clients connected to the same game id see the same server-owned game session.
- The backend can create additional persisted games with generated ids.
- Opening the lobby, loading a game, and SSE subscription now require an authenticated session.
- Command submission and seat claiming also require an authenticated session.
- Authenticated users may claim one open side on a game; unclaimed viewers remain spectators.
- The game screen now shows current seat ownership, hides pre-game setup controls until the viewer claims a side, hides claim buttons after a seat is claimed, and suppresses gameplay affordances when the viewer is spectating or on the wrong side for the active turn.
- If a guest session ends, that guest user is deleted and any seats they held become unclaimed while the game itself stays active and viewable.
- Generated game ids now use 7 characters from the Open Location Code ("PLUS code") alphabet `23456789CFGHJMPQRVWX`, which is the shortest fixed width that still covers more than 1,000,000,000 possible games.
- Mutation requests include an expected version.
- On a version conflict, the server returns `409` with the latest snapshot for that game only.
- Freshly loaded clients receive an exact `canUndo` flag plus the side that currently owns undo, including after a finished game if undo can still roll back the terminal game-over state.
- Freshly loaded clients also receive whether the shared session is `new`, `active`, or `finished`.
- Freshly loaded clients also receive the shared selected play style and the full list of available rule configurations.
- Freshly loaded clients also receive the shared selected starting side for `Free Play`.
- The browser keeps piece selection local; other clients do not see half-finished selections.
- In the no-game phase, the board remains visible but is not interactive.
- Only actionable squares show hover/pointer affordances; inactive and non-actionable squares stay visually still on mouseover.
- The move list now shows an empty-state message before any moves exist and auto-scrolls to the latest entry when history changes.
- Move-list autoscroll is now container-only, so new turns no longer pull the entire page downward.
- The move list now groups completed moves into numbered two-column display rows while still rendering a terminal `Game Over` entry separately.
- The desktop game layout now allocates a wider third column to the move-list panel.
- Games that have not been loaded, mutated, or watched longer than the configured stale threshold are evicted from the persistent store.
- An active SSE subscription keeps a game alive even if no commands are sent during that threshold window.
- Board sizing now subtracts board-panel padding when computing `--board-size`, which keeps the board inside its panel and lets it re-expand after the window grows.
- Original-style terminal win checks now resolve a captured gold as `Ravens win` before evaluating post-turn draw conditions such as no legal move.

## Rendering Strategy

The frontend now uses React components backed by Redux state.

- `main.tsx` bootstraps the React app and Redux provider.
- `App.tsx` is the top-level shell.
- Selectors derive render-ready values from the latest server snapshot plus local UI state.
- Components rerender declaratively when Redux state changes after REST responses or SSE events.
- `App.tsx` now switches between a lobby screen and the main three-column game layout.
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
  - browser route handling for `/` and `/g/{gameId}`
  - visible row and column labels on the rendered board
  - board selection behavior, idle-board no-op handling, and capture highlighting
  - stream connection and cleanup when entering or leaving a game screen
- The backend tests currently cover:
  - rule-configuration-specific setup and movement validation, including Original Game and Sherwood Rules variants
  - initial snapshot
  - start-game entry into setup
  - setup cycling
  - setup gold placement behavior
  - end-setup transition behavior
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
  - Start in the Kotlin game module under `src/main/kotlin/com/dragonsvsravens/game`.
  - Update `src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt`.
- To change UI behavior or display:
  - Start in the relevant React component, selector, thunk, or hook under `src/main/frontend`.
  - Update `src/main/resources/static/styles.css` if layout or styling is affected.
- To persist games or support richer multiplayer:
  - Extend the backend game store and session service further to add cross-instance event fanout behind the current game-id-based API.
- To support undo/redo or replay:
  - Expand the backend session model with richer history, then expose that through the API.

## Constraints And Gotchas

- Game state persists in the configured database, but SSE delivery remains local to each app instance.
- `Free Play` and `Trivial Configuration` still allow effectively teleporting a selected piece to any empty square, while `Original Game` and `Sherwood Rules` use constrained orthogonal movement.
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
