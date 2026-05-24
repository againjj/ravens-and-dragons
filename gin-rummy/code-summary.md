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
  - Owns immediate hand dealing at game creation, seat assignment, draw/discard commands, knocking, gin, big gin, scoring, and public/private view shaping.
  - Includes viewer-only turn details such as private hands, deadwood, knock options, and the discard-pile card that cannot be immediately re-discarded.

## Frontend Project

- `gin-rummy/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
- `src/main/frontend/gin-rummy-entry.tsx`
  - Exports the Gin Rummy game entry for the app shell.
- `src/main/frontend/CreateGinRummyScreen.tsx`
  - Owns the create-game controls, shared player picker usage, and default Gin Rummy options.
- `src/main/frontend/GinRummyPlayScreen.tsx`
  - Owns play-screen state, game loading/streaming, seat picking, turn display, end-action flow, and draw/discard animation orchestration.
- `src/main/frontend/Hand.tsx`
  - Renders hand cards and owns drag/drop placement behavior for drawing, discarding, and rearranging cards.
- `src/main/frontend/RoundResultBoard.tsx`
  - Renders end-of-hand results, final game/match layout, score tally, and rules reference content.
- `src/main/frontend/CardView.tsx`, `gin-rummy-cards.ts`, `gin-rummy-client.ts`, `gin-rummy-rules.ts`, and `gin-rummy-types.ts`
  - Provide card rendering, deck helpers, API calls, client-side layout/scoring helpers, and frontend wire types used by the Gin screens.
- `src/test/frontend/hand-drag.test.tsx`
  - Covers drag insertion, rearrange/discard legality, score-summary labeling, and related UI helper behavior.

## Boundaries

Gin Rummy does not depend on other game modules. Platform owns generic game runtime behavior; Gin Rummy owns cards, melds, deadwood, command semantics, and UI.
