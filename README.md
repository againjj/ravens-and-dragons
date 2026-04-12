# Dragons vs Ravens

A Spring Boot + Kotlin web app that serves a browser-based board game prototype with database-backed game persistence and a React + Redux frontend.

## What This Repo Contains

- A Spring Boot backend that stores game sessions in a database and serves live updates
- A React + Redux browser frontend for the game UI
- Frontend helpers for transport, board derivation, and local-only selection behavior

## Requirements

- Java 21 installed and available to the Gradle build
- No separate Gradle installation is required because the Gradle wrapper is included
- No separate Node installation is required because Gradle downloads the frontend toolchain
- Internet access the first time you run the app so Gradle can download its distribution, frontend toolchain, and project dependencies

## Run The App

```bash
./gradlew bootRun
```

Then open [http://localhost:8080](http://localhost:8080).

The server also respects the `PORT` environment variable, so the same app can run on Railway and other managed platforms that inject a runtime port.
By default, the backend uses an H2 file database at `build/db/dragons-vs-ravens`, so created games survive local app restarts.

Open the app in two browser tabs to see the shared game stay in sync through server-sent events.
The browser now opens on a lobby screen at `/`, where you can create a new game or open an existing one by ID.
The page now also includes auth controls for guest play, local signup/login/logout, and a Google OAuth entry link for deployments that configure that provider.
Users must authenticate before opening the lobby or viewing a game.
The lobby now presents separate `Start Fresh` and `Rejoin Game` cards, normalizes typed game IDs to uppercase, and disables `Open Game` until an ID is entered.
Each game has its own URL at `/g/{gameId}`.
Loading a game URL directly opens that game, and after you create or open a game from the lobby the browser updates the address bar to that game's `/g/{gameId}` URL.
If you load a game URL directly and then return to the lobby, the app now replaces that direct-entry history slot instead of trapping the browser Back button inside the app.
The browser stays subscribed to that game's SSE stream until you go back to the lobby.
The active game screen shows the current game ID plus a `Back to Lobby` button.
The game board now resumes responsive resizing correctly after entering a game from the lobby.
Once a game is open, the controls include the play-style dropdown plus the usual gameplay actions.
`Free Play` preserves the original behavior: before starting, you can choose whether dragons or ravens move first; starting a game then enters setup with an empty board, setup clicks cycle `empty -> dragon -> raven -> gold -> empty`, capture is manual, and the game is ended manually.
`Trivial Configuration`, `Original Game`, and `Sherwood Rules` start from preset boards with no setup phase, resolve captures automatically, and end automatically based on their own rules.
`Sherwood Rules` matches `Original Game` except the gold may move only one orthogonal square at a time.
Game over returns the session to a finished no-game state while preserving the final board position and full completed history, including a terminal `Game Over: ...` entry.
`Original Game` and `Sherwood Rules` now label draws by cause in turn history, such as `Game Over: Draw by repetition` and `Game Over: Draw by no legal move`.
When `Free Play` is ended manually, the terminal history entry is rendered as `Game Over`.
Finished games stay viewable on their existing game IDs, and if the session still has undo history the player who made the last undoable move can undo the terminal game-over state to resume play from the previous snapshot.
You still cannot restart or reconfigure a finished game on that same ID while it remains finished; creating another game gives you a fresh ID.
The board now displays numbered rows from top to bottom and lettered columns from left to right on a 7x7 grid, while square names still use `letter + number` notation such as `a1` and `d4`.
Only actionable board squares now show pointer/hover affordances, and the move list shows an empty-state message before play begins, auto-scrolls to the latest history entry during play, and groups moves into numbered two-column rows.
Games remain subject to stale cleanup and are removed after more than one hour without a load, command, or active SSE viewer.
The backend now also exposes session-cookie auth APIs for guest and local login, plus optional OAuth login wiring when a provider is configured.
Opening a game, subscribing to its SSE stream, claiming a side, and submitting commands now all require an authenticated session.
Games may track claimed `dragons` and `ravens` seats, and the auth-aware game view endpoint lives at `GET /api/games/{gameId}/view`.
Guest accounts are session-only: logging out or losing the session deletes the guest user and releases any seats they held without ending the game.
On the game screen, the browser now shows claimed seats, hides pre-game setup controls until a side is claimed, hides the claim buttons after a seat is claimed, and only shows actionable board and control affordances to the player who can act. Undo is reserved for the player who made the last undoable move.

## Run Tests

```bash
./gradlew test
```

This runs:

- the frontend helper tests
- the React/Redux component and selector tests
- the Spring Boot test suite

## Deploy On Railway

Railway can deploy this app directly from the repository or from the Railway CLI. The app is a single Spring Boot service, and Railway should build it with Gradle automatically.

This repo includes [`railway.json`](/Users/jrayazian/code/dragons-vs-ravens/railway.json), which sets the Railway start command to the Spring Boot jar produced by Gradle and points Railway health checks at the public `/health` endpoint instead of the auth-gated root route.

If you want to deploy from your local machine with the Railway CLI:

```bash
railway login --browserless
railway init
railway up
```

Railway injects `PORT` at runtime, and the app now binds to that port automatically.
For persistent production storage, also set:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://...
SPRING_DATASOURCE_USERNAME=...
SPRING_DATASOURCE_PASSWORD=...
SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver
```

Flyway runs the schema migration automatically on startup for both local H2 and deployed PostgreSQL databases.

The current Railway production URL is [https://dragons-vs-ravens-production.up.railway.app](https://dragons-vs-ravens-production.up.railway.app).

## Project Structure

- `src/main/frontend/game.ts`
  - shared frontend types, board helper logic, and local-selection helpers
- `src/main/frontend/game-client.ts`
  - REST/SSE transport helpers
- `src/main/frontend/App.tsx`
  - top-level React layout
- `src/main/frontend/app`
  - Redux store setup and typed hooks
- `src/main/frontend/features`
  - Redux slices, selectors, thunks, and stream lifecycle helpers
- `src/main/frontend/components`
  - React UI components for board, controls, status, and move list
- `src/main/kotlin/com/dragonsvsravens/game`
  - backend game state, rules, and API endpoints
- `src/main/resources/static/styles.css`
  - layout and styling
- `docs/code-summary.md`
  - architecture and codebase summary for future changes
- `docs/codex-rules.md`
  - project-specific rules for AI-assisted work

## AI Session Prompt

Use this at the start of a new AI coding session:

```text
Read docs/code-summary.md and docs/codex-rules.md before making changes. Follow those instructions unless I say otherwise.
```

## Notes

- The frontend is built with TypeScript plus Vite into `build/generated/frontend`.
- Frontend tests use Node's built-in test runner for shared helper modules and Vitest with jsdom for React/Redux tests.
- Spring Boot serves the generated frontend assets as static resources and exposes the per-game backend routes under `/api/games`.
- Session auth endpoints are exposed under `/api/auth`.
- Undo is server-backed, shared across clients, and exposed as `canUndo` in the session payload so the UI can disable the button exactly, including after a manual game over when a rollback is still available.
- Turn history now includes both completed moves and a terminal `Game Over` entry when a game is ended.
- Original-style automatic draws now report whether they happened by repetition or by no legal move.
- The shared session now exposes available rule configurations plus the currently selected configuration so all clients stay in sync on the next play style.
- `Original Game` follows the published Ravens and Dragons setup and movement/capture rules, including automatic wins and draws.
- `Sherwood Rules` reuses the `Original Game` setup, capture, and win/draw conditions, but limits the gold to one-square orthogonal movement.
- The browser client now uses the per-game routes under `/api/games` for create, load, command, and stream behavior.
- Missing SSE subscriptions for unknown game IDs now return a plain `404` response instead of logging a media-type exception on the server.
- Browser navigation now uses `/` for the lobby and `/g/{gameId}` for an active game view.
- Newly created games now use 7-character IDs drawn from the Open Location Code ("PLUS code") alphabet: `23456789CFGHJMPQRVWX`.
- Game sessions are stored durably in the configured database, while SSE emitter tracking remains in memory per app instance.
- The database now also stores local users, optional OAuth identity links, and claimed game-seat ownership.
- Persisted games are evicted automatically after more than one hour without a load, command, or active SSE viewer.
- If `./gradlew bootRun` cannot bind its default port, treat that as a local environment issue to fix instead of silently switching ports.
- `docs/codex-rules.md` now explicitly says not to modify the codebase until the user asks for implementation work.
- If you change architecture, workflow, or gameplay in a meaningful way, update `docs/code-summary.md`.
