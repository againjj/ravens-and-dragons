# Gin Rummy Code Summary

## Overview

`gin-rummy/` is the Gin Rummy game module. It owns a two-player human-only card game with configurable target score, single-game or best-of-five match play, optional Big Gin, optional first-player-gets-11 deal, optional line and shutout bonuses, and optional ace-high runs.

The parent project has two child projects:

- `gin-rummy/backend`
- `gin-rummy/frontend`

## Backend Project

- `gin-rummy/backend/build.gradle.kts`
  - Kotlin/JVM backend module with Java 21.
  - Depends on `:platform:backend` only.
- `src/main/kotlin/com/ravensanddragons/ginrummy/GinRummyGameModuleDefinition.kt`
  - Declares the `gin-rummy` slug and module metadata.
- `src/main/kotlin/com/ravensanddragons/ginrummy/GinRummyGameHandler.kt`
  - Implements platform `GameHandler`.
  - Owns setup, seat assignment, dealing, draw/discard commands, knocking, gin, big gin, scoring, and public/private view shaping.

## Frontend Project

- `gin-rummy/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
- `src/main/frontend/gin-rummy-entry.tsx`
  - Exports the Gin Rummy game entry for the app shell.
  - Owns create and play screens, shared player picker usage, hand display, drag reordering, drag-to-discard, reveal handling for same-user seats, and rules/scoring reference content.

## Boundaries

Gin Rummy does not depend on other game modules. Platform owns generic game runtime behavior; Gin Rummy owns cards, melds, deadwood, command semantics, and UI.
