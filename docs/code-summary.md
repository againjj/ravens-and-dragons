# Code Summary

## Overview

This project is a small Spring Boot 3.3 + Kotlin 2.1 web app that serves a browser-based board game prototype. The backend now supports multiple in-memory game sessions, addressed by game id, and broadcasts updates over server-sent events per game. The frontend still uses the legacy default-game routes for now, alongside the newer multi-game backend API.

## Current Architecture

- `src/main/kotlin/com/dragonsvsravens/DragonsVsRavensApplication.kt`
  - Spring Boot entrypoint.
- `src/main/kotlin/com/dragonsvsravens/game/*.kt`
  - Server-side game state models, pure-ish rules, the in-memory multi-game store, the session service, and REST/SSE endpoints.
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
- `src/main/frontend/app/*.ts`
  - Redux store setup and typed hooks.
- `src/main/frontend/features/game/*.ts`
  - Game slice, selectors, thunks, and stream lifecycle wiring.
  - Includes shared-session helpers such as exact undo availability and small command-thunk wrappers.
- `src/main/frontend/features/ui/*.ts`
  - Local-only UI state such as selected square.
- `src/main/frontend/components/*.tsx`
  - React components for board rendering, controls, move list, and status text.
- `src/main/frontend/hooks/*.ts`
  - Browser hooks for responsive sizing and fullscreen behavior.
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
  - The current browser client still loads the default game from `GET /api/game`.
  - The current browser client still sends mutations to `POST /api/game/commands`.
  - The current browser client still subscribes to `GET /api/game/stream` for live updates.
  - The backend also exposes multi-game endpoints:
    - `POST /api/games`
    - `GET /api/games/{gameId}`
    - `POST /api/games/{gameId}/commands`
    - `GET /api/games/{gameId}/stream`
- Runtime configuration:
  - `server.port` reads `${PORT:8080}` so the app keeps its local default while also working on Railway-style platforms that inject the listen port at runtime.
  - `railway.json` overrides Railway's deploy start command to `java -jar build/libs/dragons-vs-ravens.jar`, matching the Spring Boot fat jar produced by the Gradle build.
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
- `phase`
- `activeSide`
- `pendingMove`
- `turns`
- `ruleConfigurationId`
- `positionKeys`

`turns` now stores typed turn history entries, so the shared history can include both completed moves and a terminal `gameOver` marker.

`GameSession` currently also contains:

- `canUndo`
- `availableRuleConfigurations`
- `selectedRuleConfigurationId`
- `selectedStartingSide`

Important implication: games are still entirely in memory on the server. Clients connected to the same game id share one server-owned session, but restarting the server resets every game.

## Responsibilities By File

### Backend game module

The Kotlin game module is now the source of truth for game rules and state transitions.

- Creates fresh idle snapshots for new games and keeps a default compatibility game.
- Owns setup cycling logic.
- Owns turn transitions.
- Owns rule-configuration lookup, movement validation, capture resolution, and automatic game-over checks.
- Wraps each snapshot in a versioned in-memory game session.
- Keeps server-only undo snapshot history alongside the public shared session payload.
- Broadcasts updated snapshots to SSE clients scoped by game id.

Most gameplay changes should start on the backend here.

### React frontend

The React frontend is now split by responsibility.

- `App.tsx` composes the page shell and top-level sections.
- Redux owns shared client state such as the latest server session, loading/submission state, connection state, feedback messages, and local selection.
- `gameThunks.ts` coordinates initial load and command submission against the backend API.
- `gameStream.ts` plus `useGameSession.ts` open and maintain the SSE subscription.
- `Board.tsx`, `ControlsPanel.tsx`, `MoveList.tsx`, and `StatusBanner.tsx` render the current UI from Redux state.
- `useBoardSizing.ts` and `useFullscreen.ts` wrap browser-specific layout and fullscreen behavior.

Most UI-only changes should start in the relevant component, selector, or browser hook.

## Current Rules Implemented

### Free Play

- The browser initially loads into a no-game state with a play-style dropdown and `Start Game`.
- When `Free Play` is selected in the no-game state, the browser also shows a starting-side dropdown so the shared setup can begin with either dragons or ravens.
- `Free Play` preserves the original setup flow:
  - starting the game enters `setup`
  - clicking a square cycles `empty -> dragon -> raven -> gold -> empty`
  - any square, including `d4`, can be changed during setup
  - any number of gold pieces may be placed during setup
- Ending setup switches to `move`, the selected starting side moves first, dragons may move dragons or gold, ravens may move ravens, and movement allows any owned piece to move to any empty square.
- If an opposing piece exists after a move, the game enters `capture`, where dragons may capture one raven and ravens may capture one dragon or gold.
- Capture can still be skipped.
- Active play still exposes `End Game`, which appends a terminal `gameOver` turn and returns the game to `none`.

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

### Sherwood Rules

- `Sherwood Rules` starts from the same published cross-shaped setup as `Original Game`, with ravens moving first.
- Dragons and ravens move any distance orthogonally without jumping over occupied squares.
- The gold may move only one orthogonal square at a time.
- Landing restrictions, self-capture prevention, automatic capture rules, win conditions, and draw conditions otherwise match `Original Game`.

### Shared play behavior

- Clients connected to the same game id see the same server-owned game session.
- The backend can create additional in-memory games with generated ids.
- The server still keeps a default game with id `default` for the existing frontend.
- Mutation requests include an expected version.
- On a version conflict, the server returns `409` with the latest snapshot for that game only.
- Freshly loaded clients receive an exact `canUndo` flag from the server.
- Freshly loaded clients also receive the shared selected play style and the full list of available rule configurations.
- Freshly loaded clients also receive the shared selected starting side for `Free Play`.
- The browser keeps piece selection local; other clients do not see half-finished selections.
- In the no-game phase, the board remains visible but is not interactive.

## Rendering Strategy

The frontend now uses React components backed by Redux state.

- `main.tsx` bootstraps the React app and Redux provider.
- `App.tsx` is the top-level shell.
- Selectors derive render-ready values from the latest server snapshot plus local UI state.
- Components rerender declaratively when Redux state changes after REST responses or SSE events.
- Visual highlights remain class-based:
  - `selected`
  - `targetable`
  - `capture-target`
- Move history is shown as simple notation like `a1-b2`, `a1-b2xc3`, or multi-capture variants, plus a terminal `Game Over: ...` row when a game ends.

Future UI changes should preserve the split of transport logic, Redux state, render derivations, and presentational components.

## Layout And UX Notes

- The board is a 7x7 CSS grid.
- The UI now displays numbered row labels on the left and lettered column labels along the bottom.
- Square names still use `letter + number` notation, so the bottom-left square is `a1` and the center square is `d4`.
- CSS custom properties drive sizing and proportions.
- `updateBoardSize()` computes `--board-size` from the available container space.
- A `ResizeObserver` and `window.resize` listener keep the board responsive.
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
  - visible row and column labels on the rendered board
  - board selection behavior, idle-board no-op handling, and capture highlighting
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
  - default-game compatibility reads
  - multi-game creation and isolation
  - version increments
  - stale-version conflicts scoped to a single game
  - SSE delivery scoped to one game
  - invalid command validation

## Extension Points For Future Changes

- To add or change gameplay rules:
  - Start in the Kotlin game module under `src/main/kotlin/com/dragonsvsravens/game`.
  - Update `src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt`.
- To change UI behavior or display:
  - Start in the relevant React component, selector, thunk, or hook under `src/main/frontend`.
  - Update `src/main/resources/static/styles.css` if layout or styling is affected.
- To persist games or support richer multiplayer:
  - Extend the backend game store and session service to add durable storage behind the current game-id-based API.
- To support undo/redo or replay:
  - Expand the backend session model with richer history, then expose that through the API.

## Constraints And Gotchas

- The shared game currently exists only in memory; a server restart resets it.
- `Free Play` and `Trivial Configuration` still allow effectively teleporting a selected piece to any empty square, while `Original Game` and `Sherwood Rules` use constrained orthogonal movement.
- Capture eligibility is global, not positional; if any opposing capturable piece exists anywhere, capture mode begins.
- Selection remains browser-local and may be cleared when a new server snapshot makes it invalid.
- The built frontend entry is now generated by Vite rather than assuming a fixed `/app.js` file.
- The frontend tests still run against the compiled output in `build/generated/frontend`, so TypeScript build success remains part of test success.
- If the default app port is busy during local runs, the preferred workflow is to report that conflict instead of switching ports unless the user explicitly asks for a different port.

## Suggested Priorities Before Larger Feature Work

1. Define undo/history semantics on top of the shared server-owned session model.
2. Decide whether the current snapshot-history undo model should stay as-is or evolve into a richer event/command history as rules grow.
3. Decide whether the single in-memory shared game should become durable storage or multiple rooms.
4. Keep backend game rules centralized and avoid drifting gameplay logic into React components or Redux reducers.
5. Expand backend and frontend tests alongside any new move, capture, or win-condition logic.
