# Clicker Agent Instructions

This file contains instructions for work inside the `clicker/` game module.

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `clicker/code-summary.md` before changing this game module.
- If Clicker work affects assembled app wiring or shared service boundaries, also read `app/AGENTS.md`, `app/code-summary.md`, `platform/AGENTS.md`, and `platform/code-summary.md`.

## Ownership

- `clicker/` owns Clicker game rules, game-specific API payloads, frontend UI, and tests.
- Keep Clicker isolated from Ravens and Dragons. Do not depend on Ravens modules.
- Clicker may depend on `platform/` for shared backend runtime contracts and on `@ravensanddragons/platform-frontend` for shared frontend game-entry types.

## Gameplay Rules

- Creating a game starts the counter at `0`.
- Clicking the button increments the counter by `1`.
- The game is over when the counter reaches `10`.
- Do not move Clicker rules into `platform/` or `app/`.
