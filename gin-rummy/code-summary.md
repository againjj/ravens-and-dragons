# Gin Rummy Code Summary

## Overview

`gin-rummy/` is the Gin Rummy game module. It owns a two-player human-only card game with configurable target score, single-game or best-of-five match play, optional Big Gin, optional 11-card first deal, optional line/box bonus, always-on shutout doubling, and optional ace-high runs.

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
  - Ends a hand as a no-points draw at the end of a turn when exactly two stock cards remain and no knock/gin/big-gin action ended the hand first.
  - Scores meld arrangements through a solver that prunes split or subset meld choices when a larger legal meld arrangement contains the same meld cards.
  - Keeps the first-hand dealer hidden in public state until the first seat is claimed; the backend chooses and stores that dealer privately, reveals it on the first claim, and adds the optional eleventh card as soon as the dealer is revealed.
  - Auto-deals the next hand when a hand ends without ending the game, while sending the completed hand result only as transient command/stream state so reloads do not reopen old result popups. Game and match endings remain in game-over/match-over public states.
  - Includes viewer-only turn details such as private hands, deadwood, knock options, and the discard-pile card that cannot be immediately re-discarded.
  - Publishes the card under the discard top in public state so the frontend can reveal the next discard-pile card while the top card is being dragged.

## Frontend Project

- `gin-rummy/frontend/build.gradle.kts`
  - Applies the shared frontend Gradle convention.
- `src/main/frontend/gin-rummy-entry.tsx`
  - Exports the Gin Rummy game entry for the app shell, imports the module-owned Gin Rummy stylesheet, and wraps Gin Rummy screens in the game-local Redux provider.
- `src/main/frontend/gin-rummy-store.tsx` and `src/main/frontend/gin-rummy-slice.ts`
  - Own the Gin Rummy Redux store, create-option state, play-screen async loading/command state, and cross-component interaction state.
- `src/main/frontend/CreateGinRummyScreen.tsx`
  - Renders the create-game controls from Redux-backed Gin Rummy options.
- `src/main/frontend/GinRummyPlayScreen.tsx`
  - Renders Redux-backed play-screen state, game loading/streaming, seat picking through the shared platform player picker, turn display, end-action flow, self-play card reveal prompts, browser-local hand-result popups with game-local backdrop handling, and draw/discard animation orchestration.
- `src/main/frontend/Hand.tsx`
  - Renders hand cards and owns drag/drop placement behavior for drawing, discarding, and rearranging cards.
- `src/main/frontend/gin-rummy.css`
  - Owns Gin Rummy create-screen, page, board, card, hand, modal, result, animation, and mobile layout styling imported by the game entry.
- `src/main/frontend/RoundResultBoard.tsx`
  - Renders end-of-hand results, final game/match layout, aligned meld/layoff/deadwood columns, score tally, and rules reference content.
- `src/main/frontend/CardView.tsx`, `gin-rummy-cards.ts`, `gin-rummy-client.ts`, `gin-rummy-rules.ts`, and `gin-rummy-types.ts`
  - Provide card rendering, deck helpers, API calls, client-side layout/scoring helpers, meld-arrangement pruning for knock choices, and frontend wire types used by the Gin screens.
- `src/test/frontend/hand-drag.test.tsx`, `src/test/frontend/gin-rummy-store.test.ts`, and `src/test/frontend/gin-rummy-play-screen.test.tsx`
  - Cover drag insertion, rearrange/discard legality, meld-arrangement pruning, score-summary labeling, related UI helper behavior, Redux state transitions, and hand-result overlay backdrop behavior.

## Boundaries

Gin Rummy does not depend on other game modules. Platform owns generic game runtime behavior; Gin Rummy owns cards, melds, deadwood, command semantics, and UI.
