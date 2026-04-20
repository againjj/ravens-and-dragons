# Sherwood Bot Implementation Plan

## Goal

Add optional server-driven bot opponents while keeping canonical game rules in Kotlin, preserving existing human-seat auth behavior, and shipping the user-visible bot features in the lowest-risk order.

The bot roadmap should now be:

1. `Random` is the first bot implementation shipped to users.
2. `Simple` is the second bot implementation shipped to users.
3. `Minimax` is the third bot implementation shipped to users.

Each user-visible bot feature should ship in its own release.

## Release Roadmap

The lowest-risk release order is:

1. `Release 1`: Ability to use bot `Random` for `Sherwood Rules`.
2. `Release 2`: Ability to use a bot for all rule sets other than `Free Play` and `Trivial Configuration`.
3. `Release 3`: Ability to use `Undo` with a bot.
4. `Release 4`: Implementation of the bot `Simple`.
5. `Release 5`: Implementation of the bot `Minimax`.

Why this order:

- `Release 1` proves the end-to-end server bot loop on one ruleset with the lowest-complexity policy.
- `Release 2` reuses that bot loop and expands ruleset coverage before introducing grouped history semantics.
- `Release 3` adds the first materially tricky UX and backend-history behavior without also changing bot strategy.
- `Release 4` adds a second bot on top of already-stable assignment, orchestration, and undo behavior.
- `Release 5` adds search-based behavior last, after the supporting simulation and evaluation infrastructure is already justified by proven product value.

## Behaviors That Must Remain True

These behaviors from the current plan should still hold unless a later release below explicitly expands them:

- Bot assignment uses the canonical Kotlin rules and server-owned turn execution.
- Bot-controlled seats are represented separately from human seat ownership.
- `viewerRole` remains human-viewer-only and must not gain a `bot` value.
- The UI exposes bot assignment only when exactly one human seat is claimed and the opposite seat is open.
- The assignment action always targets the opposite open seat. The user does not choose the side.
- `Free Play` must always reject bot assignment.
- Assigned bot seats should be visible in the seat panel and game view metadata.
- Bot turns should run synchronously inside the request/response path in `GameSessionService`.
- Connected browsers should receive intermediate broadcasts as bot turns are applied.
- Bot move generation and simulation should stay in the Kotlin game module and must not duplicate client-only rules code.
- Deterministic ordering should be preserved for legal action generation and bot tie-breaking so tests remain stable.

## Current Architecture Touchpoints

The bot work should fit the existing layer split instead of introducing parallel rule logic:

- Backend rule authority:
  - [src/main/kotlin/com/dragonsvsravens/game/GameRules.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameRules.kt)
  - [src/main/kotlin/com/dragonsvsravens/game/RuleEngine.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/RuleEngine.kt)
  - [src/main/kotlin/com/dragonsvsravens/game/OriginalStyleRuleEngine.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/OriginalStyleRuleEngine.kt)
- Command validation and seat ownership:
  - [src/main/kotlin/com/dragonsvsravens/game/GameCommandService.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameCommandService.kt)
- Session persistence, locking, and broadcast orchestration:
  - [src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameSessionService.kt)
- API surface:
  - [src/main/kotlin/com/dragonsvsravens/game/GameController.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameController.kt)
- Frontend seat UI and state derivation:
  - [src/main/frontend/components/SeatPanel.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/SeatPanel.tsx)
  - [src/main/frontend/features/game/gameSelectors.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameSelectors.ts)
  - [src/main/frontend/features/game/gameThunks.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameThunks.ts)
  - [src/main/frontend/game-types.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-types.ts)

## Cross-Release Technical Foundations

These foundations should be introduced early and then reused across all five releases.

### 1. Represent bot-controlled seats in the shared session

Add explicit bot identity fields to `GameSession` rather than overloading human ownership:

- `dragonsBotId: String?`
- `ravensBotId: String?`

Update these layers together:

- Kotlin session model in [src/main/kotlin/com/dragonsvsravens/game/GameModels.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameModels.kt)
- JSON codec in [src/main/kotlin/com/dragonsvsravens/game/GameJsonCodec.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameJsonCodec.kt)
- JDBC persistence in [src/main/kotlin/com/dragonsvsravens/game/JdbcGameStore.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/JdbcGameStore.kt)
- TS wire types in [src/main/frontend/game-types.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-types.ts)

Database migration requirements:

- add nullable bot-id columns to the `games` table for both sides
- default existing rows to `null`
- keep the migration backward-safe for already persisted games
- use stable bot ids from the beginning so later releases do not need another schema change

### 2. Keep bot assignment as seat-management API

Use a dedicated endpoint instead of overloading turn commands:

- `POST /api/games/{gameId}/assign-bot-opponent`

Request body should include a bot id from the start:

- example: `{ "botId": "random" }`

Why this shape should stay:

- bot assignment is seat-management behavior, closer to `claim-side` than to board mutation
- it avoids bloating `GameCommandRequest` with non-turn actions
- later releases can add more bot ids without reshaping the endpoint

### 3. Keep bot state separate from viewer auth state

`viewerRole` should remain:

- `anonymous`
- `spectator`
- `dragons`
- `ravens`

The frontend should derive bot UI from session and catalog metadata, not from a bot viewer role.

### 4. Keep legal action generation canonical and deterministic

Recommended shared APIs:

- `GameRules.getLegalMoves(snapshot: GameSnapshot): List<LegalMove>`
- optional `GameRules.getLegalActions(snapshot: GameSnapshot): List<BotAction>` once capture-phase or ruleset branching makes a move-only abstraction too narrow

Implementation notes:

- enumerate candidates broadly, then filter through existing validation where practical
- reuse `BoardCoordinates` helpers and existing rule-engine validation
- keep action ordering stable, for example lexicographic by origin and destination
- do not duplicate logic from `src/main/frontend/game-rules-client.ts`

### 5. Keep bot turn orchestration inside `GameSessionService`

After a state transition that may hand control to a bot:

1. Load current stored game under the existing per-game lock.
2. Apply the initiating action.
3. Persist and broadcast the result.
4. While the game is active and the side to act is bot-controlled:
   - compute the bot action from the persisted snapshot
   - apply it through the same canonical rule path
   - persist and broadcast the new session
5. Return the final post-bot session.

Guardrails:

- keep the loop deterministic and bounded
- do not recurse through controller endpoints
- do not bypass canonical command validation unless a smaller internal helper is extracted cleanly
- keep each intermediate broadcast so connected browsers stay in sync

### 6. Formalize a bot catalog early

Even though only `Random` is user-visible in `Release 1`, the server should use a catalog-style design from the start:

- `random`
- `simple`
- `minimax`

Recommended supporting types:

- `data class BotDefinition(...)`
- `interface GameBotStrategy { ... }`
- `BotRegistry`

The registry should become the single source of truth for:

- bot ids
- display names
- supported rulesets
- strategy implementations
- frontend-visible bot metadata

## Release 1: Random For Sherwood Rules

### User-visible feature

Ability to use bot `Random` for `Sherwood Rules`.

### Product Rules

- Bot assignment is supported only when `selectedRuleConfigurationId == "sherwood-rules"`.
- `Free Play` must never offer or accept bot assignment.
- `Original Game`, `Trivial Configuration`, and `Sherwood x 9` must still reject bot assignment in this release.
- The caller must be authenticated.
- The caller must own exactly one claimed human seat.
- The opposite seat must be open.
- Neither side may already be bot-controlled.
- The game must not be finished.
- Bot assignment should remain setup-only in this release.
- The assignment action should always target the opposite open seat.
- The seat panel should render `Bot: Random` for the assigned side.
- Once assigned, the server should immediately take over that side for all future turns until the game ends.
- Undo should be disabled for bot games in this release.

### Backend Scope

1. Add bot seat fields to `GameSession`, the JSON codec, JDBC persistence, and the TypeScript wire model.
2. Add the Flyway migration for bot ids.
3. Add the dedicated `assign-bot-opponent` endpoint and Sherwood-only validation.
4. Add canonical Sherwood legal-move enumeration in the Kotlin game module.
5. Implement `Random` as the first bot strategy.
6. Orchestrate synchronous bot turns inside `GameSessionService`.
7. Reject `undo` when either bot seat is populated.

### Frontend Scope

1. Extend `GameViewResponse` consumption so the client receives bot ids and bot display metadata.
2. Add transport and thunk support for bot assignment in [src/main/frontend/game-client.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-client.ts) and [src/main/frontend/features/game/gameThunks.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameThunks.ts).
3. Add selectors for:
   - whether Sherwood bot assignment is supported
   - whether the viewer can assign a bot opponent
   - which side would receive the bot
4. Update [src/main/frontend/components/SeatPanel.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/SeatPanel.tsx) and [src/main/frontend/components/GameScreen.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/GameScreen.tsx) so the UI shows one assignment button only in the allowed Sherwood state.
5. Hide or disable undo when the backend reports a bot-controlled seat and `canUndo == false`.

### Random Bot Requirements

- `Random` must choose only from the canonical legal action set.
- Tie-breaking should still be deterministic for tests, for example by seeding or by choosing from a stable ordered candidate list with a testable random source.
- `Random` should not introduce special heuristics beyond legality and reproducibility.

### Testing

Backend tests should cover:

- bot assignment is rejected for `free-play`
- bot assignment is rejected for `original-game`, `trivial`, and `sherwood-x-9`
- bot assignment succeeds only for `sherwood-rules`
- bot assignment requires exactly one claimed human seat
- bot assignment targets the opposite open side only
- bot assignment is rejected when the target seat is already human-claimed
- bot assignment is rejected when a bot is already present
- Sherwood legal move generation respects orthogonal movement, path blocking, gold one-square movement, center and corner restrictions, enemy sandwich restrictions, and “do not expose your own piece to capture”
- bot turn orchestration applies a move automatically when the bot is to act
- game-over positions stop the bot loop
- undo is rejected once a bot is assigned

Frontend tests should cover:

- seat panel shows `Assign Bot To ...` only in the allowed Sherwood state
- the button is hidden for `free-play` and the other non-Sherwood rulesets
- seat labels render `Bot: Random` for bot-controlled seats
- clicking the button dispatches the bot-assignment thunk
- undo is hidden or disabled when the session reports a bot-controlled seat and undo is unavailable

### Deliverable

One authenticated player can assign `Random` to the opposite seat in a setup-phase `Sherwood Rules` game, and the server will play that side automatically.

## Release 2: Bot Support For All Supported Rulesets

### User-visible feature

Ability to use a bot for all rule sets other than `Free Play` and `Trivial Configuration`.

### Product Rules

- `Sherwood Rules`, `Original Game`, and `Sherwood x 9` must support bot assignment.
- `Free Play` and `Trivial Configuration` must still reject bot assignment.
- The user should still assign a bot only when exactly one human seat is claimed and the opposite seat is open.
- The assignment action should still target the opposite open seat automatically.
- The game may still remain setup-only for bot assignment in this release.
- The available bot list may still expose only `Random` in this release.
- Undo should remain disabled for bot games until `Release 3`.

### Backend Scope

1. Generalize canonical legal action generation beyond Sherwood so the existing bot loop can operate on all supported non-free-play rulesets.
2. Expand the bot registry metadata so supported-ruleset filtering comes from one backend source.
3. Update assignment validation to allow `original-game` and `sherwood-x-9`.
4. Keep `Free Play` and `Trivial Configuration` explicitly rejected.
5. Ensure game-over detection and bot orchestration behave correctly on all supported rulesets.

### Frontend Scope

1. Update selectors so bot assignment visibility follows backend-supported rulesets rather than a Sherwood-only hardcode.
2. Continue rendering assigned seats as `Bot: Random`.
3. Keep the single assign-bot action simple if `Random` is still the only available bot.
4. Keep undo hidden or disabled for bot games.

### Testing

Backend tests should add:

- bot availability for `original-game`, `sherwood-rules`, and `sherwood-x-9`
- rejection for `free-play` and `trivial`
- ruleset-aware legal action generation for the newly supported rulesets
- automatic bot responses across each supported ruleset

Frontend tests should add:

- assignment button appears for supported non-free-play rulesets
- assignment remains hidden for `Free Play` and `Trivial Configuration`
- seat labels still render the assigned bot name correctly across supported rulesets

### Deliverable

Players can use `Random` as a bot opponent in every supported ruleset except `Free Play` and `Trivial Configuration`.

## Release 3: Undo With A Bot

### User-visible feature

Ability to use `Undo` with a bot.

### Product Rules

- Undo in bot games should reverse one full exchange: the last human move plus the bot reply that immediately followed it.
- Undo should remain a backend concern; the frontend should only reflect the resulting `canUndo` and explanatory UI.
- If a bot was assigned and the game history does not contain a reversible human-plus-bot exchange, `undo` should stay unavailable.
- Bot-triggered undo should restore the snapshot from before the last human move in that exchange.
- After undo restores the prior position, the server should not immediately replay the reverted bot turn.

### Backend Scope

1. Redefine undo bookkeeping around exchange history rather than single-command history.
2. Store enough internal metadata to distinguish human-only moves, bot-only moves, and human-plus-bot exchanges.
3. Update undo validation and session derivation so bot games can advertise grouped undo availability.
4. Ensure the restored session is persisted and broadcast correctly.

### Frontend Scope

1. Re-enable undo in bot games when the backend reports grouped undo is available.
2. Update explanatory copy so users understand that undo reverses the last human-plus-bot exchange.
3. Preserve the existing seat-panel assignment UX.

### Testing

Backend tests should cover:

- grouped undo restoring the pre-human-turn snapshot in bot games
- non-bot undo behavior remains correct
- undo returns the final restored session instead of replaying the reverted bot turn

Frontend tests should cover:

- undo stays enabled for bot games when the backend says it is available
- any explanatory messaging matches the grouped-undo behavior

### Deliverable

Bot games support undo that reverses the last human move and immediate bot reply together.

## Release 4: Simple Bot

### User-visible feature

Implementation of the bot `Simple`.

### Product Rules

- `Simple` becomes a selectable bot alongside `Random`.
- `Random` remains available and behaviorally unchanged.
- Supported rulesets should match the coverage established in `Release 2`.
- Undo behavior from `Release 3` should continue to work for both `Random` and `Simple`.
- Assigned bot seats should render as `Bot: Simple` or `Bot: Random`.

### Backend Scope

1. Implement `Simple` as the second bot strategy on top of the shared registry and legal-action infrastructure.
2. Add backend-exposed bot catalog metadata so the frontend can render selectable bot options and assigned bot names.
3. Keep the original heuristic-focused design small and deterministic rather than search-heavy.

Suggested `Simple` policy:

1. If a legal move wins immediately, choose the earliest winning move.
2. Otherwise score candidates with a small deterministic heuristic.

Suggested heuristic features:

- prefer immediate captures
- for dragons, prefer moves that reduce the gold’s distance to a corner
- for ravens, prefer moves that increase pressure on the gold
- prefer moves that improve mobility
- penalize moves that obviously worsen exposure when the rules do not already forbid them

### Frontend Scope

1. Replace the single assign-bot action with selectable bot options.
2. Render assigned bot seats as `Bot: <botname>`.
3. Send the selected bot id through the existing `assign-bot-opponent` endpoint.

### Testing

Backend tests should cover:

- `Simple` remains deterministic under stable action ordering
- `Simple` chooses expected actions in controlled positions
- `Random` still chooses only legal actions
- bot catalog filtering by ruleset and id

Frontend tests should cover:

- bot selection UI renders available named bots
- assignment requests send the selected bot id
- assigned seats render as `Bot: Simple` or `Bot: Random`

### Deliverable

Players can choose either `Random` or `Simple`, with `Simple` using a deterministic heuristic policy on the shared bot infrastructure.

## Release 5: Minimax Bot

### User-visible feature

Implementation of the bot `Minimax`.

### Product Rules

- `Minimax` becomes a selectable bot alongside `Random` and `Simple`.
- Supported rulesets should match the coverage already established for selectable bots.
- Undo and assignment behavior should remain unchanged from the earlier releases.

### Backend Scope

1. Add pure simulation support for search-based bots using canonical in-memory rule transitions.
2. Implement `Minimax` with bounded depth, deterministic tie-breaking, and ruleset-aware evaluation.
3. Keep search and evaluation fully inside the Kotlin game module.

Recommended design:

- simulate from `GameSnapshot`
- reuse canonical rule transitions for hypothetical actions
- keep deterministic action ordering for reproducible choices and stable tests
- use a small evaluation layer per ruleset rather than one generic score function

### Frontend Scope

1. Expose `Minimax` in the selectable bot UI where supported.
2. Render assigned seats as `Bot: Minimax`.
3. Reuse the same transport, selector, and seat-panel path already built for `Random` and `Simple`.

### Testing

Backend tests should cover:

- `Minimax` chooses expected actions in controlled positions
- deterministic tie-breaking
- search operates on hypothetical snapshots without mutating persisted state

Frontend tests should cover:

- bot selection UI includes `Minimax`
- assignment requests send `minimax` correctly
- assigned seats render as `Bot: Minimax`

### Deliverable

Players can choose `Minimax` as a stronger search-based bot on the already-stable multi-bot platform.

## Detailed Implementation Sequence

This sequence keeps the code reviewable while still matching the five-release roadmap.

### Phase 1: Shared session and persistence plumbing

1. Add `dragonsBotId` and `ravensBotId` to the Kotlin model, JSON codec, JDBC store, and TS wire types.
2. Add the Flyway migration.
3. Extend backend and frontend view payloads with bot metadata needed for seat rendering.

Deliverable:

- persisted sessions can represent bot-controlled seats safely across reloads.

### Phase 2: Dedicated assignment API and Release 1 validation

1. Add `POST /api/games/{gameId}/assign-bot-opponent`.
2. Enforce authenticated, one-human-seat, opposite-open-seat, setup-only, Sherwood-only validation.
3. Add frontend transport, thunk, and selector plumbing for assignment.

Deliverable:

- the app can assign a future bot opponent safely, but no bot policy runs yet.

### Phase 3: Canonical legal action generation

1. Add Sherwood legal move generation first.
2. Add deterministic ordering and focused tests.
3. Broaden the action layer later to support the Release 2 rulesets.

Deliverable:

- the backend can enumerate stable legal actions for bot use.

### Phase 4: Release 1 Random bot orchestration

1. Implement `Random`.
2. Add synchronous bot-turn orchestration in `GameSessionService`.
3. Disable undo for bot games.
4. Complete Release 1 seat-panel UI and tests.

Deliverable:

- `Random` works for `Sherwood Rules`.

### Phase 5: Release 2 ruleset expansion

1. Generalize legal action generation to `original-game` and `sherwood-x-9`.
2. Expand bot registry ruleset support.
3. Update backend and frontend gating.

Deliverable:

- the existing bot loop works for all supported non-free-play, non-trivial rulesets.

### Phase 6: Release 3 grouped undo

1. Add exchange-aware undo bookkeeping.
2. Re-enable undo when a reversible human-plus-bot exchange exists.
3. Update UI copy and tests.

Deliverable:

- bot games support grouped undo.

### Phase 7: Release 4 Simple bot

1. Add the `Simple` heuristic strategy.
2. Expose a backend bot catalog to the frontend.
3. Update the UI to show selectable named bots.

Deliverable:

- players can choose `Simple` or `Random`.

### Phase 8: Release 5 Minimax bot

1. Add pure simulation support.
2. Implement `Minimax`.
3. Expose it through the existing bot-selection UI.

Deliverable:

- players can choose `Minimax` in addition to the earlier bots.

### Phase 9: Verification and docs

1. Run `./gradlew test`.
2. Manually sanity-check supported bot flows in the browser.
3. Update [docs/code-summary.md](/Users/jrayazian/code/dragons-vs-ravens/docs/code-summary.md) and [README.md](/Users/jrayazian/code/dragons-vs-ravens/README.md) when implementation work lands.

## Risks And Mitigations

- Risk: duplicated rules between frontend and backend.
  Mitigation: keep all legal action generation, simulation, and bot policy in Kotlin and treat the frontend as display plus action wiring only.
- Risk: session persistence drift after adding bot fields.
  Mitigation: update model, codec, migration, JDBC reads, and tests together.
- Risk: bot loop complexity around locking and broadcast order.
  Mitigation: keep orchestration inside `GameSessionService` and reuse the existing per-game lock.
- Risk: ruleset expansion may diverge from canonical validation.
  Mitigation: generate candidates broadly, then filter by existing rule validation wherever practical.
- Risk: grouped undo introduces confusing history behavior.
  Mitigation: keep undo semantics entirely backend-owned and add frontend copy that matches the grouped exchange model.
- Risk: `Minimax` may pressure performance or determinism.
  Mitigation: add bounded search depth, pure snapshot simulation, and deterministic tie-breaking before exposing it.

## Recommended Commit Breakdown

To keep the eventual implementation reviewable, the code work should still land in small commits:

1. session model, migration, and API plumbing for bot-controlled seats
2. dedicated bot-assignment endpoint plus Release 1 validation
3. Sherwood legal action generation and tests
4. `Random` bot plus server-side orchestration
5. Release 2 ruleset-expansion work
6. grouped undo for bot exchanges
7. `Simple` bot plus selectable bot catalog UI
8. `Minimax` bot plus simulation support
9. docs polish after each shipped release
