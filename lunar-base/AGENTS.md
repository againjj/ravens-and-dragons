# Lunar Base Agent Instructions

This file contains instructions for work inside the `lunar-base/` game module.

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `lunar-base/code-summary.md` before changing this game module.
- If Lunar Base work affects assembled app wiring or shared service boundaries, also read `app/AGENTS.md`, `app/code-summary.md`, `platform/AGENTS.md`, and `platform/code-summary.md`.

## Ownership

- `lunar-base/` owns Lunar Base game rules, game-specific API payloads, frontend UI, and tests.
- Keep Lunar Base isolated from the other game modules.
- Lunar Base may depend on `platform/` for shared backend runtime contracts and on `@ravensanddragons/platform-frontend` for shared frontend game-entry types.

## Gameplay Rules

- The deck has 6 station, 48 module, 24 agent, and 8 influence cards.
- Player hands are private. Public state may expose hand counts and influence counts, but not hidden card identities.
- Keep card movement, board placement, deck refill, and turn rules in this game module rather than in `platform/` or `app/`.
