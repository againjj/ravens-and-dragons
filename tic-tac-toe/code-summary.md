# Tic-Tac-Toe Code Summary

## Overview

`tic-tac-toe/` is the Tic-Tac-Toe game module. It owns a simple 3x3 game where X moves first, players alternate marks, and the game finishes on a three-in-a-row win or a full-board draw.

The parent project has two child projects:

- `tic-tac-toe/backend`
- `tic-tac-toe/frontend`

## Backend Project

- `tic-tac-toe/backend/build.gradle.kts`
  - Kotlin/JVM backend module with Java 21.
  - Depends on `:platform:backend` only.
- `src/main/kotlin/com/ravensanddragons/tictactoe/TicTacToeGameModuleDefinition.kt`
  - Tic-Tac-Toe implementation of the platform game module contract.
  - Declares the `tic-tac-toe` slug and `/tic-tac-toe/create` browser route.
- `src/main/kotlin/com/ravensanddragons/tictactoe/TicTacToeGameHandler.kt`
  - Implements the platform `GameHandler` port for Tic-Tac-Toe.
  - Creates the empty board, validates place-mark commands, alternates turns, detects wins/draws, and preserves platform-owned listing flags on game updates.
  - Supplies Tic-Tac-Toe public-listing display data and reports no player seats for the shared player-game menu because this game has no seat ownership.

## Frontend Project

- `tic-tac-toe/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
  - Typechecks and tests the Tic-Tac-Toe frontend package with Gradle-managed Node/npm.
- `src/main/frontend/tic-tac-toe-entry.tsx`
  - Exports `ticTacToeGameEntry` through the package entrypoint for the app-owned frontend shell.
  - Owns the Tic-Tac-Toe create and play screens, the public-listing checkbox for game creation, plus Tic-Tac-Toe-specific REST/SSE behavior.
  - Uses shared frontend API failure classification so expired sessions and server-down states surface consistently, and closes the Tic-Tac-Toe SSE stream on errors.

## Boundaries

Tic-Tac-Toe does not depend on Ravens and Dragons. Platform owns only generic game runtime behavior; Tic-Tac-Toe owns its board state, command semantics, and UI.
