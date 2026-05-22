# Tic-Tac-Toe Agent Instructions

This file contains instructions for work inside the `tic-tac-toe/` game module.

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `tic-tac-toe/code-summary.md` before changing this game module.
- If Tic-Tac-Toe work affects assembled app wiring or shared service boundaries, also read `app/AGENTS.md`, `app/code-summary.md`, `platform/AGENTS.md`, and `platform/code-summary.md`.

## Ownership

- `tic-tac-toe/` owns Tic-Tac-Toe game rules, game-specific API payloads, frontend UI, and tests.
- Keep Tic-Tac-Toe isolated from Ravens and Dragons. Do not depend on Ravens modules.
- Tic-Tac-Toe may depend on `platform/` for shared backend runtime contracts and on `@ravensanddragons/platform-frontend` for shared frontend game-entry types.

## Gameplay Rules

- Creating a game starts with an empty 3x3 board and X to move.
- Players alternate placing X and O marks on empty squares.
- The game is finished when either mark owns a full row, column, or diagonal, or when the board is full with no winner.
- Do not move Tic-Tac-Toe rules into `platform/` or `app/`.
