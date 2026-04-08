# Dragons vs Ravens

A Spring Boot + Kotlin web app that serves a browser-based board game prototype with shared in-memory server state and a React + Redux frontend.

## What This Repo Contains

- A Spring Boot backend that owns a shared in-memory game session and serves live updates
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

Open the app in two browser tabs to see the shared game stay in sync through server-sent events.
When the page first loads, no game is in progress and the controls include a play-style dropdown plus `Start Game`.
`Free Play` preserves the original behavior: before starting, you can choose whether dragons or ravens move first; starting a game then enters setup with an empty board, setup clicks cycle `empty -> dragon -> raven -> gold -> empty`, capture is manual, and the game is ended manually.
`Trivial Configuration`, `Original Game`, and `Sherwood Rules` start from preset boards with no setup phase, resolve captures automatically, and end automatically based on their own rules.
`Sherwood Rules` matches `Original Game` except the gold may move only one orthogonal square at a time.
Game over returns to the no-game state while preserving the final board position and full completed history, including a terminal `Game Over: ...` entry, until the next game is started.
The board now displays numbered rows from top to bottom and lettered columns from left to right on a 7x7 grid, while square names still use `letter + number` notation such as `a1` and `d4`.

## Run Tests

```bash
./gradlew test
```

This runs:

- the frontend helper tests
- the React/Redux component and selector tests
- the Spring Boot test suite

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
- Spring Boot serves the generated frontend assets as static resources and exposes `/api/game` plus `/api/game/stream`.
- Undo is server-backed, shared across clients, and exposed as `canUndo` in the session payload so the UI can disable the button exactly.
- Turn history now includes both completed moves and a terminal `Game Over` entry when a game is ended.
- The shared session now exposes available rule configurations plus the currently selected configuration so all clients stay in sync on the next play style.
- `Original Game` follows the published Ravens and Dragons setup and movement/capture rules, including automatic wins and draws.
- `Sherwood Rules` reuses the `Original Game` setup, capture, and win/draw conditions, but limits the gold to one-square orthogonal movement.
- If `./gradlew bootRun` cannot bind its default port, treat that as a local environment issue to fix instead of silently switching ports.
- If you change architecture, workflow, or gameplay in a meaningful way, update `docs/code-summary.md`.
