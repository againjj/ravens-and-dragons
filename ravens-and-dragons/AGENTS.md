# Ravens And Dragons Agent Instructions

This file contains instructions for work inside the `ravens-and-dragons/` game module.

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `ravens-and-dragons/code-summary.md` before changing this game module.
- If game work affects assembled app wiring or shared service boundaries, also read `app/AGENTS.md`, `app/code-summary.md`, `platform/AGENTS.md`, and `platform/code-summary.md`.

## Ownership

- `ravens-and-dragons/` owns canonical Ravens and Dragons gameplay rules, state transitions, game-specific REST/SSE APIs, game-specific persistence payloads, frontend components, board helpers, bots, machine training, static assets, and tests.
- `ravens-and-dragons/ravens-and-dragons-backend/src/main/kotlin/com/ravensanddragons/game` is the home for canonical game rules, state transitions, and shared session behavior.
- Frontend helper modules under `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend` should keep wire types, board helpers, move formatting, and local-only selection helpers out of React components.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/App.tsx` should stay focused on shell composition and top-level wiring until frontend shell code is split by a future frontend game-entry contract.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/components` should own React rendering.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game` should own Redux slices, selectors, thunks, and stream lifecycle helpers for game/session behavior.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/ui` should own browser-local UI state such as selection.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/game-client.ts` should stay focused on REST/SSE transport helpers and client-side request handling.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/hooks` should wrap browser APIs such as fullscreen and resize observation.

## Gameplay Rules That Are Currently Intentional

Unless the user asks to change game behavior, preserve these current rules:

- The create flow starts from a setup draft with an empty board.
- Clicking any square in free-play setup cycles: empty -> raven -> dragon -> gold -> empty.
- Any number of gold pieces may be placed during setup.
- The starting side is selected in the create flow; the free-play picker defaults to Ravens.
- Dragons may move either a dragon or the gold.
- Ravens may move only ravens.
- Movement currently allows a selected piece to move to any empty square.
- After moving, capture becomes available if any capturable opposing piece exists anywhere on the board.
- Dragons may capture one raven.
- Ravens may capture one dragon or the gold.
- Capture can be skipped.
- Reloading the page does not reset the game because persisted state is shared through the configured database.
- Restarting the server does not reset persisted games, but SSE fanout remains in memory per app instance.

If a requested change would alter one of those rules, implement it only when that behavior change is intentional.

## Code Organization Rules

- Put canonical gameplay state transition logic in the Kotlin game module.
- Prefer pure or mostly pure rule helpers that take a snapshot/state and return the next snapshot/state.
- Keep frontend helpers focused on wire-shape helpers and render-side derivations from the server snapshot.
- Keep browser-specific code out of shared frontend helper modules.
- Reuse existing helpers before adding new parallel logic paths.
- Remove dead code and unused imports when editing related files.
- Add comments only when the intent is not already obvious from the code.

## Frontend Rules

- Prefer deriving UI from Redux state and selectors instead of manually syncing DOM state.
- Keep components presentational where practical and push transport/state transitions into thunks, selectors, or hooks.
- Keep the board responsive and preserve fullscreen support unless the user asks otherwise.
- Prefer reusable components and hooks over repeated browser wiring when behavior stays the same.
- Preserve the existing visual language unless the task is explicitly about design or styling.

## Testing

- When backend gameplay logic changes, update or add tests in `ravens-and-dragons/ravens-and-dragons-backend/src/test/kotlin/com/ravensanddragons/game/GameRulesTest.kt` and related server tests.
- When frontend helper behavior changes, update or add tests in `ravens-and-dragons/ravens-and-dragons-frontend/src/test/frontend/game.test.js`.
- When React/Redux UI behavior changes, update or add tests under `ravens-and-dragons/ravens-and-dragons-frontend/src/test/frontend/*.test.ts(x)`.
- When adding a new browser route, add a test that proves the route can be loaded directly by URL.
- Use `./gradlew :ravens-and-dragons:ravens-and-dragons-backend:test` for focused backend tests.
- Use `./gradlew :ravens-and-dragons:ravens-and-dragons-frontend:test` for focused frontend tests.
- Use `./gradlew :ravens-and-dragons:test` or `./gradlew test` before finishing broad game-module changes whenever practical.
