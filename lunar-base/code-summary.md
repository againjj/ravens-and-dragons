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
  - Creates the configured 2-6 player game, expands the standard card script into counted physical station/module/agent/influence cards whose persisted card identity is just the unique catalog name plus instance state, deals private hands, enriches client-facing card views by name with catalog costs/colors/connectors/whole orbs/station front/back metadata/flipped display/colonists/achievement ordinals/action and effect text, derives public completed-orb counts, housed colonists, and unique scientific-achievement counts from each player board, validates commands, rejects attempts to seat the same user more than once, charges catalog card costs reduced by completed colored/gray orbs when playing modules or agents, manages stock/discard refill, module board placement with connector matching, supply compaction/refill that keeps influence cards while dealing a full replacement supply and grants yellow/gray-orb credits, turn-gated station flipping, turn passing, and game ending.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseActionText.kt`
  - Builds readable main action, on-playing, and effect text from the card catalog action/effect model for public card views.
- `src/main/kotlin/com/ravensanddragons/lunarbase/cards/`
  - Owns an additive Kotlin card-definition DSL and immutable definition model for script-loaded Lunar Base decks.
  - Uses separate DSL builder and definition types for agents, influences, modules, stations, and the single station front so invalid card fields are unavailable on the wrong card type.
  - Supports `.kts` deck syntax, including card colors, connectors, achievements, declarative actions, static effects, triggered effects, and separate number versus flip-station action amounts.
  - Validates that card names are unique across the station front, stations, modules, agents, and influences so runtime state can use catalog names as card identities, and rejects module definitions that combine effect text with a main action or on-playing action.
  - `LunarBaseStandardDeck.kt` loads `src/main/resources/card-sets/standard-cards.kts` as the canonical standard deck script used by both gameplay creation and script-loading tests.
- `src/main/resources/card-sets/standard-cards.kts`
  - Main-resource standard card script that defines counted cards, card names, module colors, module connectors, the shared station front connectors, and station backs.
- `src/test/kotlin/com/ravensanddragons/lunarbase/cards/LunarBaseCardScriptTest.kt`
  - Loads the main-resource standard deck through `LunarBaseStandardDeck`, spot-checks representative card data, and verifies DSL validation rules for station fronts, station counts, non-station counts, and required fields.

## Frontend Project

- `lunar-base/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
  - Typechecks and tests the Lunar Base frontend package with Gradle-managed Node/npm.
- `src/main/frontend/lunar-base-entry.tsx`
  - Exports `lunarBaseGameEntry` through the package entrypoint for the app-owned frontend shell.
  - Owns the Lunar Base create screen, play screen, player panels, shared Lunar Base color definitions, card/table rendering with standard card names/costs/colors/connectors/whole orbs, main action/on-playing/effect badges and hover tooltips, colonist/achievement depictions, station flipped-state display, viewer-only station side reveal, turn-gated station flipping controls, frontend placement hints with connector matching, editable zoom control, click interaction, drag/drop interaction, viewer-relative player ordering, current-turn hand playability dimming, supply/stock-to-hand dragging, and client-only card movement animation styling for hand, pile, supply, board movement, and station side flips.
  - Keeps animated command source cards hidden as soon as a pending command starts, so module cards played from hand stay hidden through the server-response gap and fly animation.
  - Animates cancelled hand drags back to the actual hand-card rectangle and keeps flying cards below the shared app header layer.
- `src/main/frontend/lunar-base.css`
  - Owns Lunar Base-specific layout, card, board, responsive, and animation styles.

## Boundaries

Lunar Base does not depend on Ravens and Dragons, Gin Rummy, or Tic-Tac-Toe. Platform owns only generic game runtime behavior; Lunar Base owns its deck, command semantics, board rules, private hand payloads, and UI.
