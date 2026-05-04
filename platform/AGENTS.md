# Platform Agent Instructions

This file contains instructions for work inside the `platform/` project.

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `platform/code-summary.md` before changing `platform/`.
- If platform work affects the assembled app or a game module, also read the relevant project-level files under `app/` and `ravens-and-dragons/`.

## Ownership

- `platform/` owns shared service capabilities: authentication, account management, OAuth provider metadata, shared web exception handling, route fallback behavior, and the game module contract.
- `platform/` may define ports that game modules implement, such as user-reference cleanup.
- `platform/` should not own game-specific rules, board state, bot logic, move validation, undo semantics, game snapshot JSON, or game frontend UI.

## Architecture Rules

- Keep platform contracts small and extracted from current service needs.
- Prefer explicit interfaces and DTOs at service boundaries instead of moving game-specific logic into shared code.
- Do not add assumptions that all future games have Ravens and Dragons concepts such as ravens, dragons, gold, board squares, captures, or bot strategies.
- When changing auth/session behavior, check any game-module integration points that rely on user ids, seat ownership, or account deletion cleanup.

## Testing

- `:platform:test` should cover shared service and contract behavior without depending on game-specific rules.
- Use `./gradlew :platform:test` for focused platform verification.
- Run `./gradlew test` before finishing platform changes whenever practical.
