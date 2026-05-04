# Agent Instructions

This file contains repository-wide instructions for AI-assisted work in this project.

## Required Startup Step

- Before making changes, read this file and `code-summary.md` at the repository root.
- Also read the `AGENTS.md` and `code-summary.md` files for each top-level project you expect to touch:
  - `app/`
  - `platform/`
  - `ravens-and-dragons/`
- Treat the root and project-level files together as the project context for implementation or review work.

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
- Preserve existing behavior unless the user explicitly asks to change gameplay, UX, build workflow, persistence, or routing.
- Prefer small, reviewable refactors over broad rewrites.
- Keep the codebase easy to extend for future rule and service-boundary changes.
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
- Keep root `code-summary.md` focused on service-wide architecture, build/runtime flow, and cross-project responsibilities.
- Keep project-level `code-summary.md` files focused on the files and behavior owned by that project.
- Do not include historical implementation notes in `README.md`; preserve that context in planning docs, summaries, or commit history instead.
- When moving or splitting docs, update file references so startup instructions and design-doc links point at the new canonical files.

## Architecture Rules

- `platform/` owns shared service capabilities: authentication, shared web error handling, route fallback, the game module contract, and reusable platform boundaries.
- `app/` owns the runnable Spring Boot application, deployed jar assembly, and explicit registration of included game modules.
- `ravens-and-dragons/` owns Ravens and Dragons game rules, game APIs, game-specific persistence payloads, frontend UI, assets, bots, machine training, and tests.
- Do not move gameplay rules into `platform/` or `app/`.
- Do not make platform own game-specific snapshot, undo, rule, bot, board, or command semantics.
- If persistence, multiple rooms, richer multiplayer behavior, external game repositories, or route slugs are added later, discuss the architecture shift before spreading state ownership further.

## Testing Rules

- Keep tests as independent as possible so they remain safe to run in parallel.
- Avoid shared mutable state, order dependencies, and shared database rows between tests unless the test explicitly owns and resets that state.
- When any build, test, npm, dependency, or audit command reports vulnerabilities, prominently tell the user as soon as they are noticed, including the reported count and severity when available.
- When fixing a bug, start by writing or updating a test that reproduces the failure before fixing the implementation.
- When logic is extracted or refactored, keep tests focused on behavior rather than implementation details.
- Run `./gradlew test` before finishing code changes whenever practical.
- Do not claim behavior is unchanged unless the relevant tests pass or you clearly say verification was not completed.

## Commit And PR Rules

- Before creating a commit, make sure all tests pass.
- Before creating a commit, update the relevant `code-summary.md` files and `README.md` so they reflect every relevant change since the last commit.
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

- In review mode, prioritize behavior regressions, rule mismatches, missing or stale tests, and architecture drift between projects.
- Call out maintainability issues when they make future game-rule or service-boundary changes riskier.

## Change Safety Rules

- Ask before making changes that:
  - move canonical game rules into `platform/`, `app/`, or React components
  - introduce persistence or networking
  - change move/capture rules
  - materially redesign the UI
  - alter the build or test workflow in a way that affects how the app is run
  - introduce slugged routes or split stored game-session metadata across new tables

## Useful Commands

- Run the app: `./gradlew bootRun`
- Run all tests: `./gradlew test`
- Run backend tests: `./gradlew testBackend`
- Run frontend tests: `./gradlew testFrontend`
- Run full checks: `./gradlew check`

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
Read AGENTS.md and code-summary.md at the root and relevant project levels before making changes. Follow those project rules unless I say otherwise.
```
