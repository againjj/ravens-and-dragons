# Lunar Base Code Summary

## Overview

`lunar-base/` is the Lunar Base game module. It owns a card-table game with 2-6 players, private hands, a shared supply, stock/discard piles, player boards, turn passing, and a client-side zoomable table UI.

The parent project has two child projects:

- `lunar-base/backend`
- `lunar-base/frontend`

## Backend Project

- `lunar-base/backend/build.gradle.kts`
  - Kotlin/JVM backend module with Java 21.
  - Depends on `:platform:backend` only.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseGameModuleDefinition.kt`
  - Lunar Base implementation of the platform game module contract.
  - Declares the `lunar-base` slug and `/lunar-base/create` browser route.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseGameHandler.kt`
  - Implements the platform `GameHandler` port for Lunar Base.
  - Creates the configured 2-6 player game, builds and deals the deck, keeps hidden hands in private state, exposes viewer-specific hand contents through `gameView`, validates commands, manages stock/discard refill, module board placement, supply compaction/refill, turn passing, and game ending.

## Frontend Project

- `lunar-base/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
  - Typechecks and tests the Lunar Base frontend package with Gradle-managed Node/npm.
- `src/main/frontend/lunar-base-entry.tsx`
  - Exports `lunarBaseGameEntry` through the package entrypoint for the app-owned frontend shell.
  - Owns the Lunar Base create screen, play screen, player panels, card/table rendering, zoom control, click interaction, drag/drop interaction, and client-only card movement animation styling.
- `src/main/frontend/lunar-base.css`
  - Owns Lunar Base-specific layout, card, board, responsive, and animation styles.

## Boundaries

Lunar Base does not depend on Ravens and Dragons, Gin Rummy, or Tic-Tac-Toe. Platform owns only generic game runtime behavior; Lunar Base owns its deck, command semantics, board rules, private hand payloads, and UI.
