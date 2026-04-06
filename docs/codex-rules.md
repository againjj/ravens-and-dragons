# Codex Rules

This file contains repository-specific instructions for AI-assisted work in this project.

## Required Startup Step

- Before making changes, read `docs/code-summary.md` and this file.
- Treat these two files as the project context that should be loaded before implementation or review work.

## Project Priorities

- Preserve existing behavior unless the user explicitly asks to change gameplay or UX.
- Prefer small, reviewable refactors over broad rewrites.
- Keep the codebase easy to extend for future rule changes.
- When in doubt, optimize for clarity and testability over cleverness.

## Architecture Rules

- `src/main/kotlin/com/dragonsvsravens/game` is the home for canonical game rules, state transitions, and shared session behavior.
- `src/main/frontend/game.ts` should hold wire types, board helpers, move formatting, and local-only selection helpers.
- `src/main/frontend/App.tsx` should stay focused on shell composition and top-level wiring.
- `src/main/frontend/components` should own React rendering.
- `src/main/frontend/features/game` should own Redux slices, selectors, thunks, and stream lifecycle helpers for game/session behavior.
- `src/main/frontend/features/ui` should own browser-local UI state such as selection.
- `src/main/frontend/game-client.ts` should stay focused on REST/SSE transport helpers and client-side request handling.
- `src/main/frontend/hooks` should wrap browser APIs such as fullscreen and resize observation.
- Do not move gameplay logic into React components or split canonical rules between frontend and backend unless the user explicitly asks for that tradeoff.
- Keep browser-local state limited to UI concerns such as selection and loading/error presentation.
- If persistence, multiple rooms, or richer multiplayer behavior is added later, discuss the architecture shift before spreading state ownership further.

## Gameplay Rules That Are Currently Intentional

Unless the user asks to change game behavior, preserve these current rules:

- The game starts in setup mode with only the gold piece at `e5`.
- Clicking a non-`e5` square in setup cycles: empty -> dragon -> raven -> empty.
- Dragons move first.
- Dragons may move either a dragon or the gold.
- Ravens may move only ravens.
- Movement currently allows a selected piece to move to any empty square.
- After moving, capture becomes available if any capturable opposing piece exists anywhere on the board.
- Dragons may capture one raven.
- Ravens may capture one dragon or the gold.
- Capture can be skipped.
- Reloading the page does not reset the game because state is shared and held in server memory.
- Restarting the server resets the shared game because persistence has not been added.

If a requested change would alter one of those rules, implement it only when that behavior change is intentional.

## Code Organization Rules

- Put canonical gameplay state transition logic in the Kotlin game module.
- Prefer pure or mostly pure rule helpers that take a snapshot/state and return the next snapshot/state.
- Keep frontend helpers in `game.ts` focused on wire-shape helpers and render-side derivations from the server snapshot.
- Keep browser-specific code out of `game.ts`.
- Reuse existing helpers before adding new parallel logic paths.
- Remove dead code and unused imports when editing related files.
- Add comments only when the intent is not already obvious from the code.

## Frontend Rules

- Prefer deriving UI from Redux state and selectors instead of manually syncing DOM state.
- Keep components presentational where practical and push transport/state transitions into thunks, selectors, or hooks.
- Keep the board responsive and preserve fullscreen support unless the user asks otherwise.
- Prefer reusable components and hooks over repeated browser wiring when behavior stays the same.
- Preserve the existing visual language unless the task is explicitly about design or styling.

## Testing Rules

- When backend gameplay logic changes, update or add tests in `src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt` and related server tests.
- When frontend helper behavior changes, update or add tests in `src/test/frontend/game.test.js`.
- When React/Redux UI behavior changes, update or add tests under `src/test/frontend/*.test.ts(x)`.
- When fixing a bug, start by writing or updating a test that reproduces the failure before fixing the implementation.
- When logic is extracted or refactored, keep tests focused on behavior rather than implementation details.
- Run `./gradlew test` before finishing code changes whenever practical.
- Do not claim behavior is unchanged unless the relevant tests pass or you clearly say verification was not completed.

## Commit And PR Rules

- Before creating a commit, make sure all tests pass.
- Before creating a commit, update `docs/code-summary.md` and `README.md` so they reflect every relevant change since the last commit.
- Commit messages must use a short, meaningful title line.
- Commit message bodies must include a full description of what changed and why those changes were made.

## Review Rules

- In review mode, prioritize:
  - behavior regressions
  - rule mismatches
  - missing or stale tests
  - architecture drift between the Kotlin game module, `game.ts`, Redux state, and React components
- Call out maintainability issues when they make future game-rule changes riskier.

## Change Safety Rules

- Ask before making changes that:
  - move canonical game rules back into the frontend or split them across layers
  - introduce persistence or networking
  - change the move/capture rules
  - materially redesign the UI
  - alter the build or test workflow in a way that affects how the app is run

## Useful Commands

- Run the app: `./gradlew bootRun`
- Run all tests: `./gradlew test`

## Prompt Snippet

Use this in future requests:

```text
Read docs/code-summary.md and docs/codex-rules.md before making changes. Follow those project rules unless I say otherwise.
```
