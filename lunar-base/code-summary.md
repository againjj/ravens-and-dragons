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
  - Creates configured 2-6 player games, deals private hands, validates commands, rejects attempts to seat the same user more than once, charges catalog card costs reduced by completed colored/gray orbs when playing modules or agents, starts and resumes declarative card actions, tracks the action actor and pending interaction, lets players discard an influence to negate effects from opponent-played agents, automatically advances the turn after the chosen main action completes, manages stock/discard refill only when a draw or supply refill needs cards, delays supply compaction/refill until turn end while keeping influence cards, grants shuttle-arrival credits subject to active effects, and ends games from derived win conditions.
  - Returns direct command responses as the acting user's viewer-specific game view while keeping command stream broadcasts public, so claiming a seat immediately delivers that player's private hand and controls without exposing it to other viewers.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseEndGameRules.kt`
  - Derives Lunar Base win results without persisting them. A game ends after any completed action when a player has 20 credits, 10 housed colonists, 5 scientific achievements, or 4 influences in hand; multiple qualifying players draw, and one player with multiple conditions earns an epic victory.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseState.kt`
  - Owns Lunar Base runtime/public/private state DTOs, explicit canonical persisted-state DTOs, hand/discard count synchronization helpers, persisted-card trimming, tolerant reads of older rich card payloads, list replacement helpers, and credit-cost calculation.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseConstants.kt`
  - Owns game lifecycle, card type, player-count, hand-size, randomization, supply-size, and turn-advance constants/helpers.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseDeckFactory.kt`
  - Expands the standard card script into counted physical station/module/agent/influence cards whose persisted card identity is the unique catalog name plus instance state.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseCatalogCards.kt`
  - Enriches client-facing card views by catalog name with costs/colors/connectors/whole orbs/station front/back metadata/flipped display/colonists/achievement ordinals/action and effect text, and provides the runtime card catalog used to rehydrate canonical persisted card identities.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseBoardRules.kt`
  - Owns board geometry, module placement validation, connector matching, completed-orb counting, housed-colonist summaries, and unique scientific-achievement summaries.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseActionText.kt`
  - Builds readable main action, on-playing, and effect text from the card catalog action/effect model for public card views.
- `src/main/kotlin/com/ravensanddragons/lunarbase/LunarBaseActionEngine.kt`
  - Owns resumable Lunar Base action execution, including choose-one/do-all sequencing, scoped actor changes, choosing opponents/targets, actor-only view-hand pauses, source-card labels for active actions, actor-specific interactions, repeated build/draw/draft/resell/discard/flip actions, opponent-agent influence negation, on-playing interrupts from built modules, active influence/board-module static effects, triggered effect action sequences, stealing legally placeable opponent modules, automatic gain/loss of credits, defensive skipping of impossible actions, and automatic turn advancement after a main action finishes.
  - Derives live action interaction text for client reads so card tooltips and in-progress action copy share the backend action formatter without persisting the derived text.
  - Applies static effects that forbid drafting other influences, replace steal-credit opponent choice with a skip interaction, suppress shuttle-arrival credits, or add red-orb shuttle credits. Triggered effects run from build-Dome/Laika-Memorial, discard-this-influence, and draft-any-influence events using the same action stack as on-playing interrupts.
  - Keeps requested build/discard counts in action state rather than clipping them to the current hand, while still resolving discard repeats when the actor's hand becomes empty and preserving build skip interactions when no module is available.
- `src/main/kotlin/com/ravensanddragons/lunarbase/cards/`
  - Owns an additive Kotlin card-definition DSL and immutable definition model for script-loaded Lunar Base decks.
  - Uses separate DSL builder and definition types for agents, influences, modules, stations, and the single station front so invalid card fields are unavailable on the wrong card type.
  - Supports `.kts` deck syntax, including card colors, connectors, achievements, declarative actions, static effects, triggered effects, and separate number versus flip-station action amounts.
  - Validates that card names are unique across the station front, stations, modules, agents, and influences so runtime state can use catalog names as card identities, rejects module definitions that combine effect text with a main action or on-playing action, and requires chosen-player references to follow an enclosing player-choice action.
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
  - Owns the Lunar Base create/play screen shell, action panel rendering of backend-formatted action text with viewer-relative waiting/source labels and scoped interaction prompts, player panels, command wiring, shared platform player-picker wiring for open seats, SSE loading, viewer-relative player ordering, action-state-driven hand/supply/stock/board targeting, supply/stock-to-hand dragging, supply-to-discard dragging, shared hand/supply/board movement animation setup, end-game popup/revealed-hand display, bottom-of-play-area rulebook PDF viewer, drag auto-scroll, and client-only card movement animation orchestration for hand, pile, supply, board movement, remote live-update movement mirroring, and station side flips.
  - Keeps animated command source cards hidden as soon as a pending command starts, so module cards played from hand stay hidden through the server-response gap and fly animation.
  - Shares card drag setup, source hiding, invalid-drop return animation, card-center coordinate tracking, destination snap rectangles, and scroll-port clipping across hand, supply, and stock drags; module board snapping also accepts drag events from the surrounding player area when the dragged card center is near the board.
  - Preserves table scroll while starting and dropping partially visible card drags, keeps snap/preview/flying drag visuals in a full-scrollable-area non-sizing overlay above the stable table content, reserves a stable next-card hand slot for incoming hand drops, animates cancelled hand drags back to the actual hand-card rectangle, and keeps flying cards below the shared app header layer.
  - Keeps selected module deselection tied to actual card hits so surrounding hand/table space and disabled hand cards clear selection, and keeps rotated selected modules visually above neighboring cards while resetting.
  - Lets stealable board modules share the hand-module selection, rotation, drag-preview, snap, and play-animation flow while preserving board-origin rotations and hiding instant visual-rotation unwinds.
- `src/main/frontend/lunar-base-types.ts`
  - Owns Lunar Base frontend wire/state types and the shared Lunar Base palette reference.
- `src/main/frontend/lunar-base-api.ts`
  - Owns Lunar Base create, load, and command API calls with shared platform response-error handling.
  - Uses the direct command response envelope's game state and separate feedback message, preserving viewer-aware data without placing command feedback on game state.
- `src/main/frontend/lunar-base-game-logic.ts`
  - Owns client-side card playability, credit-cost, station-side, discard/play-agent, and viewer-relative ordering helpers.
- `src/main/frontend/lunar-base-board-rules.ts`
  - Owns frontend board geometry, connector matching, legal placement, snapping, card-center, visual-rotation normalization, and placement search helpers used for hints and drag/drop.
  - Exposes named snap wrappers for selected-card pointer placement and dragged-card center placement so callers document the coordinate semantics they pass into the shared snap math.
- `src/main/frontend/lunar-base-card-interactions.ts`
  - Owns pure frontend card interaction decisions for stock, supply, hand-card, and stealable board-card movement, including command payloads, animation metadata, legal source-target combinations, and click/drop/modal annotations shared by the UI handlers.
- `src/main/frontend/LunarBaseCard.tsx`
  - Owns card rendering with standard card names/costs/colors/connectors/whole orbs, main action/on-playing/effect badges and hover tooltips, clickable main-action badges when a main action can be chosen, colonist/achievement depictions, and station flipped-state display.
- `src/main/frontend/LunarBasePlayerBoard.tsx`
  - Owns player board rendering, frontend placement hints with connector matching, stealable module selection/drag affordances, station reveal/flip controls, station flip animation staging, scaled drag images, and board snap/drop helpers exposed to surrounding drag surfaces.
- `src/main/frontend/useLunarBaseZoom.ts`
  - Owns editable zoom control parsing, clipping, preset stepping, initial zoom, and zoom text synchronization helpers.
- `src/main/frontend/lunar-base.css`
  - Owns Lunar Base-specific layout, card, board, responsive, and animation styles.

## Boundaries

Lunar Base does not depend on Ravens and Dragons, Gin Rummy, or Tic-Tac-Toe. Platform owns only generic game runtime behavior; Lunar Base owns its deck, command semantics, board rules, private hand payloads, and UI.
