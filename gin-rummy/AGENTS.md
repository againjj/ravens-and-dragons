# Gin Rummy Agent Instructions

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `gin-rummy/code-summary.md` before changing this game module.
- If Gin Rummy work affects assembled app wiring or shared service boundaries, also read `app/AGENTS.md`, `app/code-summary.md`, `platform/AGENTS.md`, and `platform/code-summary.md`.

## Ownership

- `gin-rummy/` owns Gin Rummy game rules, scoring, game-specific API payloads, frontend UI, and tests.
- Keep Gin Rummy isolated from Ravens and Dragons and Tic-Tac-Toe.
- Gin Rummy may depend on `platform/` for shared backend runtime contracts and on `@ravensanddragons/platform-frontend` for shared frontend contracts and player picking.

## Gameplay Rules

- Follow the supported Gin Rummy rules documented in the game UI and backend tests.
- Do not add unsupported Wikipedia variations unless the user explicitly asks.
- Keep canonical game rules in the backend, not in React components.
