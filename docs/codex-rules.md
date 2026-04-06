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

- `src/main/frontend/game.ts` is the home for game rules and state transitions.
- `src/main/frontend/app.ts` should stay focused on DOM lookup, event wiring, rendering, and browser APIs.
- Do not move gameplay logic back into `app.ts` unless the user explicitly asks for that tradeoff.
- Keep the backend minimal unless new server behavior is required.
- If persistence, multiplayer, or server-side validation is added later, discuss the architecture shift before spreading rules across frontend and backend.

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
- Reloading the page resets the game because state is client-side only.

If a requested change would alter one of those rules, implement it only when that behavior change is intentional.

## Code Organization Rules

- Put pure game helpers and state transition functions in `game.ts`.
- Prefer pure functions that take a `GameState` and return a new `GameState`.
- Keep browser-specific code out of `game.ts`.
- Reuse existing helpers before adding new parallel logic paths.
- Remove dead code and unused imports when editing related files.
- Add comments only when the intent is not already obvious from the code.

## Frontend Rules

- Keep `render()` as the central UI refresh entrypoint.
- Preserve the current pattern of updating state and then rerendering.
- Keep the board responsive and preserve fullscreen support unless the user asks otherwise.
- Prefer event delegation and reusable DOM helpers over repeated per-element wiring when behavior stays the same.
- Preserve the existing visual language unless the task is explicitly about design or styling.

## Testing Rules

- When gameplay logic changes, update or add tests in `src/test/frontend/game.test.js`.
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
  - architecture drift between `game.ts` and `app.ts`
- Call out maintainability issues when they make future game-rule changes riskier.

## Change Safety Rules

- Ask before making changes that:
  - move game rules into the backend
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
