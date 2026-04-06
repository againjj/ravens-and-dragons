# Dragons vs Ravens

A Spring Boot + Kotlin web app that serves a browser-based board game prototype with shared in-memory server state.

## What This Repo Contains

- A Spring Boot backend that owns a shared in-memory game session and serves live updates
- A browser-based frontend for the game UI
- Frontend helpers for rendering and local-only selection behavior

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

## Run Tests

```bash
./gradlew test
```

This runs:

- the frontend helper tests
- the Spring Boot test suite

## Project Structure

- `src/main/frontend/game.ts`
  - shared frontend types, board helper logic, and local-selection helpers
- `src/main/frontend/app.ts`
  - DOM wiring, rendering, browser events, REST commands, and SSE sync
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

- The frontend is compiled by TypeScript into `build/generated/frontend`.
- Spring Boot serves the generated frontend assets as static resources and exposes `/api/game` plus `/api/game/stream`.
- If you change architecture, workflow, or gameplay in a meaningful way, update `docs/code-summary.md`.
