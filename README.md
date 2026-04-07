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
During setup, the board starts empty and each click cycles a square through `empty -> dragon -> raven -> gold -> empty`, with any number of gold pieces allowed.

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
- If you change architecture, workflow, or gameplay in a meaningful way, update `docs/code-summary.md`.
