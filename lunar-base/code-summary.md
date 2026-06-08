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
  - Creates the configured 2-6 player game, builds and deals the deck, keeps hidden hands in private state, exposes viewer-specific hand contents through `gameView`, validates commands, manages stock/discard refill, module board placement, supply compaction/refill that keeps influence cards while dealing a full replacement supply, turn passing, and game ending.
- `src/main/kotlin/com/ravensanddragons/lunarbase/cards/`
  - Owns an additive Kotlin card-definition DSL and immutable definition model for script-loaded Lunar Base decks.
  - Uses separate DSL builder and definition types for agents, influences, modules, stations, and the single station front so invalid card fields are unavailable on the wrong card type.
  - Supports `.kts` deck syntax, including card colors, orb halves, achievements, declarative actions, static effects, triggered effects, and separate number versus flip-station action amounts.
  - The DSL is not wired into gameplay, persistence, or frontend rendering yet; current game creation still uses the existing placeholder card generation in `LunarBaseGameHandler`.
- `src/test/resources/card-sets/standard-cards.kts`
  - Backend test-resource copy of the standard card script used to validate script loading without depending on exploratory thought files.
- `src/test/kotlin/com/ravensanddragons/lunarbase/cards/LunarBaseCardScriptTest.kt`
  - Loads `src/test/resources/card-sets/standard-cards.kts` as a Kotlin script whose final expression returns a deck definition, spot-checks representative card data, and verifies DSL validation rules for station fronts, station counts, non-station counts, and required fields.

## Frontend Project

- `lunar-base/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
  - Typechecks and tests the Lunar Base frontend package with Gradle-managed Node/npm.
- `src/main/frontend/lunar-base-entry.tsx`
  - Exports `lunarBaseGameEntry` through the package entrypoint for the app-owned frontend shell.
  - Owns the Lunar Base create screen, play screen, player panels, shared Lunar Base color definitions, card/table rendering and tint selection, zoom control, click interaction, drag/drop interaction, and client-only card movement animation styling.
- `src/main/frontend/lunar-base.css`
  - Owns Lunar Base-specific layout, card, board, responsive, and animation styles.

## Boundaries

Lunar Base does not depend on Ravens and Dragons, Gin Rummy, or Tic-Tac-Toe. Platform owns only generic game runtime behavior; Lunar Base owns its deck, command semantics, board rules, private hand payloads, and UI.
