# Code Summary

## Overview

This project is a small Spring Boot 3.3 + Kotlin 2.1 web app that serves a browser-based board game prototype. The backend owns a single shared in-memory game session and broadcasts updates over server-sent events. The frontend uses React plus Redux Toolkit for rendering, browser interaction, REST/SSE synchronization, and local-only UI state such as selection.

## Current Architecture

- `src/main/kotlin/com/dragonsvsravens/DragonsVsRavensApplication.kt`
  - Spring Boot entrypoint.
- `src/main/kotlin/com/dragonsvsravens/game/*.kt`
  - Server-side game state models, pure-ish rules, the in-memory session service, and REST/SSE endpoints.
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
  - The browser loads the initial shared game from `GET /api/game`.
  - The browser sends mutations to `POST /api/game/commands`.
  - The browser subscribes to `GET /api/game/stream` for live updates.
- Result:
  - Running `./gradlew bootRun` serves the Vite-built frontend bundle plus static CSS through Spring Boot.

## Game Model

The canonical board is represented on the server as `Map<String, Piece>` and on the wire as a JSON object keyed by square name like `e5`.

- `Piece = "dragon" | "raven" | "gold"`
- `Side = "dragons" | "ravens"`
- `Phase = "setup" | "move" | "capture"`

`GameSnapshot` currently contains:

- `board`
- `phase`
- `activeSide`
- `pendingMove`
- `turns`

`GameSession` currently also contains:

- `canUndo`

Important implication: the shared game is entirely in-memory on the server. Multiple clients see the same game, but restarting the server resets it.

## Responsibilities By File

### Backend game module

The Kotlin game module is now the source of truth for game rules and state transitions.

- Creates the initial shared snapshot with the gold at `e5`.
- Owns setup cycling logic.
- Owns turn transitions.
- Owns movement and capture resolution.
- Wraps the current snapshot in a versioned in-memory game session.
- Keeps server-only undo snapshot history alongside the public shared session payload.
- Broadcasts updated snapshots to SSE clients.

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

### Setup phase

- The board starts with only the gold piece at `e5`.
- Clicking a square in setup cycles: empty -> dragon -> raven -> empty.
- `e5` is protected and cannot be changed during setup.

### Turn flow

- Starting the game switches phase from `setup` to `move`.
- Dragons always move first.
- On dragon turns, the player may move either a `dragon` piece or the `gold`.
- On raven turns, the player may move a `raven`.
- Movement currently allows moving a selected owned piece to any empty square on the 9x9 board.
  - There is no pathfinding, adjacency rule, collision rule beyond destination occupancy, or piece-specific movement constraint.

### Capture flow

- After a move, the code checks whether any capturable opposing piece exists anywhere on the board.
- If one exists, phase changes to `capture`.
- During capture:
  - Dragons may capture one `raven`.
  - Ravens may capture one `dragon` or the `gold`.
- Capture is optional because the UI exposes a "Skip Capture" button.
- Completing capture or skipping it commits the turn, appends to move history, and swaps the active side.
- Undo can roll back either an in-progress move in capture phase or the most recently completed move.

### Shared play behavior

- All clients connected to the app see the same server-owned game session.
- The server exposes a single shared game with id `default`.
- Mutation requests include an expected version.
- On a version conflict, the server returns `409` with the latest game snapshot.
- Freshly loaded clients receive an exact `canUndo` flag from the server.
- The browser keeps piece selection local; other clients do not see half-finished selections.

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
- Move history is still shown as simple notation like `a1-b2` or `a1-b2xc3`.

Future UI changes should preserve the split of transport logic, Redux state, render derivations, and presentational components.

## Layout And UX Notes

- The board is a 9x9 CSS grid.
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
  - targetable square calculation
  - local selection normalization
  - reading pieces from the wire snapshot
  - move notation
  - Redux-backed status and target derivation
  - controls enablement and click behavior
  - board selection behavior and capture highlighting
- The backend tests currently cover:
  - initial snapshot
  - setup cycling
  - protected gold square behavior
  - begin-game reset behavior
  - move-to-capture transitions
  - move commits when capture is unavailable
  - capture commits
  - skip-capture commits
  - shared game API reads
  - version increments
  - stale-version conflicts
  - invalid command validation

## Extension Points For Future Changes

- To add or change gameplay rules:
  - Start in the Kotlin game module under `src/main/kotlin/com/dragonsvsravens/game`.
  - Update `src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt`.
- To change UI behavior or display:
  - Start in the relevant React component, selector, thunk, or hook under `src/main/frontend`.
  - Update `src/main/resources/static/styles.css` if layout or styling is affected.
- To persist games or support richer multiplayer:
  - Extend the backend session service and decide whether to add durable storage or multiple game ids.
- To support undo/redo or replay:
  - Expand the backend session model with richer history, then expose that through the API.

## Constraints And Gotchas

- The shared game currently exists only in memory; a server restart resets it.
- The current implementation still allows effectively teleporting a selected piece to any empty square.
- Capture eligibility is global, not positional; if any opposing capturable piece exists anywhere, capture mode begins.
- Selection remains browser-local and may be cleared when a new server snapshot makes it invalid.
- The built frontend entry is now generated by Vite rather than assuming a fixed `/app.js` file.
- The frontend tests still run against the compiled output in `build/generated/frontend`, so TypeScript build success remains part of test success.

## Suggested Priorities Before Larger Feature Work

1. Define undo/history semantics on top of the shared server-owned session model.
2. Decide whether the current snapshot-history undo model should stay as-is or evolve into a richer event/command history as rules grow.
3. Decide whether the single in-memory shared game should become durable storage or multiple rooms.
4. Keep backend game rules centralized and avoid drifting gameplay logic into React components or Redux reducers.
5. Expand backend and frontend tests alongside any new move, capture, or win-condition logic.
