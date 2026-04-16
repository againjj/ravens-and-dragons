# Dragons vs Ravens

A Spring Boot + Kotlin web app that serves a browser-based board game prototype with database-backed game persistence and a React + Redux frontend.

## What This Repo Contains

- A Spring Boot backend that stores game sessions in a database and serves live updates
- A React + Redux browser frontend for the game UI
- Frontend helper modules split by transport, shared types, board geometry, client-side rule derivation, and move-history formatting

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
Local password accounts now also get a `Profile` button in the upper-right app chrome that opens `/profile`.
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
Original-style games now award `Ravens win` immediately when the gold is captured, even if the dragons would otherwise have no legal reply.
Game over returns the session to a finished no-game state while preserving the final board position and full completed history, including a terminal `Game Over: ...` entry.
`Original Game` and `Sherwood Rules` now label draws by cause in turn history, such as `Game Over: Draw by repetition` and `Game Over: Draw by no legal move`.
When `Free Play` is ended manually, the terminal history entry is rendered as `Game Over`.
Finished games stay viewable on their existing game IDs, and if the session still has undo history the player who made the last undoable move can undo the terminal game-over state to resume play from the previous snapshot.
You still cannot restart or reconfigure a finished game on that same ID while it remains finished; creating another game gives you a fresh ID.
The board now displays numbered rows from top to bottom and lettered columns from left to right on a 7x7 grid, while square names still use `letter + number` notation such as `a1` and `d4`.
The board now highlights the center and corner squares in light gray, and on even-sized boards it highlights all four middle squares.
Only actionable board squares now show pointer/hover affordances, and the move list shows an empty-state message before play begins, auto-scrolls to the latest history entry during play, and groups moves into numbered two-column rows.
The move-list empty state now matches the panel background instead of rendering as a separate white tile.
Move-list autoscroll now stays inside the move-list panel instead of scrolling the page, and the desktop layout now gives the move-list panel a wider column.
Board sizing now measures the padded board panel so the board stays inside its panel and can grow again after the window expands.
Games remain subject to stale cleanup and are removed after they exceed the configured stale threshold without a load, command, or active SSE viewer. The default threshold is six weeks.
The backend now also exposes session-cookie auth APIs for guest and local login, plus optional OAuth login wiring when a provider is configured.
Opening a game, subscribing to its SSE stream, claiming a side, and submitting commands now all require an authenticated session.
Games may track claimed `dragons` and `ravens` seats, and the auth-aware game view endpoint lives at `GET /api/games/{gameId}/view`.
Guest accounts are session-only: logging out or losing the session deletes the guest user and releases any seats they held without ending the game.
The `/profile` page is available only to local password accounts. It lets a user update their display name using the same validation as signup, and delete their own account only after confirming their password again.
Deleting a local account signs that session out, releases any claimed seats, clears nullable ownership references such as the game creator id, and leaves the game itself intact and readable.
On the game screen, the browser now shows claimed seats, hides pre-game setup controls until a side is claimed, hides the claim buttons after a seat is claimed, and only shows actionable board and control affordances to the player who can act. Undo is reserved for the player who made the last undoable move.

## Google OAuth Setup

Google sign-in appears automatically when the app sees a configured `google` OAuth client registration at startup. If those settings are missing, the login screen hides the Google button.
When the app runs behind a proxy such as Railway, it now honors forwarded host and scheme headers so Google OAuth callback URLs stay on the public `https` domain instead of the internal app address.

This repo does not check in a real or placeholder Google OAuth registration. Enable Google sign-in by setting:

```text
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email
```

For local development with a real secret, copy [.env.local.example](/Users/jrayazian/code/dragons-vs-ravens/.env.local.example) to `.env.local`, replace the secret value, and load it before starting the app:

```bash
source .env.local
./gradlew bootRun
```

`.env.local` is ignored by git so your real secret stays local to your machine.

Create a Google OAuth 2.0 web application in Google Cloud Console and add these authorized redirect URIs:

- Local: `http://localhost:8080/login/oauth2/code/google`
- Production: `https://<your-domain>/login/oauth2/code/google`

Example local run:

```bash
./gradlew bootRun
```

Then open [http://localhost:8080](http://localhost:8080). If the Google OAuth client is valid for your current hostname and redirect URI, the login screen will show `Sign in with Google`.

This app does not link Google accounts to existing local accounts by email. A Google login creates or reuses a user only by the OAuth provider id plus the provider subject returned by Google.

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

If you want to launch or update the app from your local machine with the Railway CLI:

```bash
railway login --browserless
railway init
railway up
```

Use `railway up` when you want Railway to build and run your current local workspace. `railway service redeploy` only restarts the latest already-uploaded deployment and will not include newer unuploaded local changes.

Railway injects `PORT` at runtime, and the app binds to that port automatically.
For persistent production storage, set the Spring datasource variables on the app service to the linked Railway Postgres values:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://<PGHOST>:<PGPORT>/<PGDATABASE>
SPRING_DATASOURCE_USERNAME=<PGUSER>
SPRING_DATASOURCE_PASSWORD=<PGPASSWORD>
SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver
```

Do not embed `username:password@` inside `SPRING_DATASOURCE_URL`. This app expects a JDBC URL plus separate username and password variables.

If you want Google sign-in on Railway, make sure the Google Cloud OAuth client includes this exact callback URL:

```text
https://dragons-vs-ravens-production.up.railway.app/login/oauth2/code/google
```

If Railway uses a different public domain, update the Google OAuth redirect URI to match that exact deployed domain.
The app now also honors Railway's forwarded proxy headers when it builds the OAuth callback URL, so the browser-to-Google redirect should keep the deployed `https` host automatically.

Flyway runs the schema migration automatically on startup for both local H2 and deployed PostgreSQL databases. The build also pins Flyway to a Railway-compatible version and includes the PostgreSQL Flyway database module so Railway's managed Postgres startup can migrate successfully.

The current Railway production URL is [https://dragons-vs-ravens-production.up.railway.app](https://dragons-vs-ravens-production.up.railway.app).

## Project Structure

- `src/main/frontend/game-types.ts`
  - shared frontend types and request/response DTOs
- `src/main/frontend/board-geometry.ts`
  - board dimensions, square naming, and highlighted-square helpers
- `src/main/frontend/game-rules-client.ts`
  - client-side ownership, capture, targeting, and local-selection helpers
- `src/main/frontend/move-history.ts`
  - move notation and grouped move-history helpers
- `src/main/frontend/game-client.ts`
  - REST/SSE transport helpers
- `src/main/frontend/App.tsx`
  - top-level React layout
- `src/main/frontend/app`
  - Redux store setup and typed hooks
- `src/main/frontend/features`
  - Redux slices, selectors, thunks, stream lifecycle helpers, and shared game-view/auth-refresh orchestration
- `src/main/frontend/components`
  - React UI components for board, controls, status, and move list
- `src/main/kotlin/com/dragonsvsravens/game`
  - backend game state, rules, and API endpoints
  - includes a thin `GameRules.kt` facade plus focused rule catalog, snapshot factory, and per-ruleset engine files
- `src/main/resources/static/styles.css`
  - layout and styling
- `docs/code-summary.md`
  - architecture and codebase summary for future changes
- `docs/refactor-plan.md`
  - phased refactor roadmap for the current organization improvements
- `AGENTS.md`
  - project-specific rules for AI-assisted work

## AI Session Prompt

Use this at the start of a new AI coding session:

```text
Read docs/code-summary.md and AGENTS.md before making changes. Follow those instructions unless I say otherwise.
```

## Notes

- The frontend is built with TypeScript plus Vite into `build/generated/frontend`.
- Frontend tests use Node's built-in test runner for shared helper modules and Vitest with jsdom for React/Redux tests.
- Spring Boot serves the generated frontend assets as static resources and exposes the per-game backend routes under `/api/games`.
- Session auth endpoints are exposed under `/api/auth`.
- Local profile management also lives under `/api/auth/profile` and `/api/auth/delete-account`.
- Undo is server-backed, shared across clients, and exposed as `canUndo` in the session payload so the UI can disable the button exactly, including after a manual game over when a rollback is still available.
- Turn history now includes both completed moves and a terminal `Game Over` entry when a game is ended.
- Original-style automatic draws now report whether they happened by repetition or by no legal move.
- Original-style terminal win checks now take precedence over the post-turn no-legal-move draw check when the gold is captured.
- Backend rule metadata and execution are now split into focused Kotlin files so future rules changes do not all land in one oversized `GameRules.kt`.
- Frontend game thunks now centralize fetched game-view application and `401`/`403` auth-refresh recovery so open, refresh, command, and side-claim flows stay aligned.
- The shared session now exposes available rule configurations plus the currently selected configuration so all clients stay in sync on the next play style.
- `Original Game` follows the published Ravens and Dragons setup and movement/capture rules, including automatic wins and draws.
- `Sherwood Rules` reuses the `Original Game` setup, capture, and win/draw conditions, but limits the gold to one-square orthogonal movement.
- The browser client now uses the per-game routes under `/api/games` for create, load, command, and stream behavior.
- Move-list autoscroll now updates the move-list container without nudging the page scroll position.
- Board sizing now measures the padded board panel correctly and can expand again after the window grows.
- Missing SSE subscriptions for unknown game IDs now return a plain `404` response instead of logging a media-type exception on the server.
- Browser navigation now uses `/` for the lobby and `/g/{gameId}` for an active game view.
- Newly created games now use 7-character IDs drawn from the Open Location Code ("PLUS code") alphabet: `23456789CFGHJMPQRVWX`.
- Game sessions are stored durably in the configured database, while SSE emitter tracking remains in memory per app instance.
- The database now also stores local users, optional OAuth identity links, and claimed game-seat ownership.
- Persisted games are evicted automatically after they exceed the configured stale threshold without a load, command, or active SSE viewer. The default threshold is six weeks.
- If `./gradlew bootRun` cannot bind its default port, treat that as a local environment issue to fix instead of silently switching ports.
- `AGENTS.md` now explicitly says not to modify the codebase until the user asks for implementation work.
- If you change architecture, workflow, or gameplay in a meaningful way, update `docs/code-summary.md`.
