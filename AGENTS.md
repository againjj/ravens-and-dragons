# Agents

This file contains repository-specific instructions for AI-assisted work in this project.

## Required Startup Step

- Before making changes, read `docs/code-summary.md` and this file.
- Treat these two files as the project context that should be loaded before implementation or review work.

## Project Priorities

- Do not make changes to the codebase until the user explicitly asks for implementation work.
- Do not make code changes unless the user asks in the imperative tense.
- If the user says only `dolt`, interpret it as `do it`.
- If the user talks about possible changes without using the imperative voice, work in plan mode rather than implementation mode.
- Do not assume the user wants code changes.
- A request that describes a feature, fix, or desired outcome is not by itself permission to edit files.
- If the user asks for planning, review, investigation, or explanation first, stay in analysis mode and do not edit files.
- When the user's intent is ambiguous, default to reading code and proposing a plan only.
- This rule overrides any general instruction to assume the user wants code changes by default.
- Preserve existing behavior unless the user explicitly asks to change gameplay or UX.
- Prefer small, reviewable refactors over broad rewrites.
- Keep the codebase easy to extend for future rule changes.
- When in doubt, optimize for clarity and testability over cleverness.

## Planning And Todo Rules

- `docs/todo.md` is the canonical list of planned work that is not being implemented immediately.
- Do not update `docs/todo.md` or create/update backing plan files during exploratory discussion, investigation, or planning.
- Keep plans in the conversation while the user is still deciding what to do.
- If planned work is discussed and then fully implemented in the same session, do not add it to `docs/todo.md`.
- Add items to `docs/todo.md` only at an explicit wrap-up point, such as before a commit, when the user asks to pause/save remaining work, or when the user asks to update the plan/todo docs.
- Only add unfinished follow-up work: planned outcomes that were discussed but not completed in the current session/commit.
- When planned work is completed, remove its entry from `docs/todo.md` and remove any backing plan files that are no longer needed.
- Keep `docs/todo.md` issue-tracker-like: each item should explain the planned outcome, why it matters, and where to find supporting details.

## Documentation Rules

- Keep `README.md` human-focused and limited to the current state of the repository.
- Do not include historical implementation notes in `README.md`; preserve that context in planning docs, summaries, or commit history instead.

## Architecture Rules

- `ravens-and-dragons/ravens-and-dragons-backend/src/main/kotlin/com/ravensanddragons/game` is the home for canonical game rules, state transitions, and shared session behavior.
- Frontend helper modules under `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend` should keep wire types, board helpers, move formatting, and local-only selection helpers out of React components.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/App.tsx` should stay focused on shell composition and top-level wiring.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/components` should own React rendering.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game` should own Redux slices, selectors, thunks, and stream lifecycle helpers for game/session behavior.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/ui` should own browser-local UI state such as selection.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/game-client.ts` should stay focused on REST/SSE transport helpers and client-side request handling.
- `ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/hooks` should wrap browser APIs such as fullscreen and resize observation.
- Do not move gameplay logic into React components or split canonical rules between frontend and backend unless the user explicitly asks for that tradeoff.
- Keep browser-local state limited to UI concerns such as selection and loading/error presentation.
- If persistence, multiple rooms, or richer multiplayer behavior is added later, discuss the architecture shift before spreading state ownership further.

## Gameplay Rules That Are Currently Intentional

Unless the user asks to change game behavior, preserve these current rules:

- The game starts in setup mode with an empty board.
- Clicking any square in setup cycles: empty -> dragon -> raven -> gold -> empty.
- Any number of gold pieces may be placed during setup.
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

## Testing Rules

- Keep tests as independent as possible so they remain safe to run in parallel.
- Avoid shared mutable state, order dependencies, and shared database rows between tests unless the test explicitly owns and resets that state.
- When any build, test, npm, dependency, or audit command reports vulnerabilities, prominently tell the user as soon as they are noticed, including the reported count and severity when available.
- When backend gameplay logic changes, update or add tests in `ravens-and-dragons/ravens-and-dragons-backend/src/test/kotlin/com/ravensanddragons/game/GameRulesTest.kt` and related server tests.
- When frontend helper behavior changes, update or add tests in `ravens-and-dragons/ravens-and-dragons-frontend/src/test/frontend/game.test.js`.
- When React/Redux UI behavior changes, update or add tests under `ravens-and-dragons/ravens-and-dragons-frontend/src/test/frontend/*.test.ts(x)`.
- When adding a new browser route, add a test that proves the route can be loaded directly by URL.
- When fixing a bug, start by writing or updating a test that reproduces the failure before fixing the implementation.
- When logic is extracted or refactored, keep tests focused on behavior rather than implementation details.
- Run `./gradlew test` before finishing code changes whenever practical.
- Do not claim behavior is unchanged unless the relevant tests pass or you clearly say verification was not completed.

## Commit And PR Rules

- Before creating a commit, make sure all tests pass.
- Before creating a commit, update `docs/code-summary.md` and `README.md` so they reflect every relevant change since the last commit.
- When the user says `commit and push`, always create the commit first and only push after that commit succeeds.
- Commit messages must use a short, meaningful title line.
- Commit message bodies must include a full description of what changed and why those changes were made.

## Deployment Rules

- When the user asks to deploy to Railway, do not say the deploy is complete until you have confirmed that the latest intended changes were included in the deployment.
- Treat a Railway deploy as incomplete while the latest deployment is still building or otherwise not yet successful.
- Only report a Railway deploy as complete after verifying that the latest deployment finished successfully.
- Railway deploys for this service typically take about 3 minutes from `railway up` to `SUCCESS`.
- If a deployment is still in `BUILDING` or `DEPLOYING` after about 5 minutes, treat that as unusually long and stop polling.

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

## Local Run Rules

- If the user asks to start the app and no app terminal session is attached to the current thread, create one first.
- If the user asks to start the server, first try the default app configuration.
- When starting the server locally, always load environment variables from `.env.local`.
- If the server was started in an active terminal session, try stopping it with `Ctrl-C` before using other process-killing commands.
- If the default port is already in use, do not start the server on a different port unless the user explicitly asks for that fallback.
- When the default port is busy, report the port conflict to the user and stop there.

## Prompt Snippet

Use this in future requests:

```text
Read docs/code-summary.md and AGENTS.md before making changes. Follow those project rules unless I say otherwise.
```
