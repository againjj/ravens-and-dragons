# Sherwood Bot Implementation Plan

## Goal

Add an optional server-driven bot opponent for `Sherwood Rules` only.

The first release should let one authenticated human claim either `dragons` or `ravens`, then assign a bot to the opposite seat from the game screen. The bot should use the canonical Kotlin rules, take its turns automatically, and be unavailable for every other rule configuration.

## Product Rules

- Bot assignment is supported only when `selectedRuleConfigurationId == "sherwood-rules"`.
- `Free Play` must never offer or accept bot assignment.
- `Original Game`, `Trivial Configuration`, and `Sherwood x 9` should also reject bot assignment in the first release.
- The UI should offer bot assignment only after exactly one human seat is claimed and the opposite seat is still open.
- The assignment action should always target the open opposite seat. The user does not choose which side the bot gets.
- Bot-controlled seats should be visible in the seat panel and game view metadata.
- Once the bot is assigned, the server should immediately take over that side for all future turns until the game ends or the bot is explicitly removed in a future change.

## Non-Goals For This First Slice

- No bot support for `free-play`.
- No bot support for non-Sherwood rulesets.
- No configurable difficulty levels.
- No background worker, queue, or async retry system.
- No attempt to make the bot especially strong before the basic loop is stable.
- No “remove bot” or “replace bot with human” flow unless that becomes necessary during implementation.

## Current Architecture Touchpoints

The bot should fit the existing separation of responsibilities instead of introducing parallel rule logic:

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

## Proposed Technical Design

### 1. Represent bot-controlled seats in the shared game session

Add explicit bot identity fields to `GameSession` rather than overloading existing user ownership:

- `dragonsBotId: String?`
- `ravensBotId: String?`

Even though the first release ships only one bot, starting with bot ids avoids a model rewrite in release two and keeps auth logic distinct from AI control.

Update these layers consistently:

- Kotlin session model in [GameModels.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameModels.kt)
- JSON codec in [GameJsonCodec.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameJsonCodec.kt)
- JDBC persistence in [JdbcGameStore.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/JdbcGameStore.kt)
- TS wire types in [game-types.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-types.ts)

Database migration:

- Add nullable bot-id columns to the `games` table for each side.
- Default existing rows to `null`.
- Plan persistence now for the release-two bot catalog shape, even if the first release only stores one bot id.
- Keep the migration backward-safe for already persisted games.

### 2. Add a dedicated bot-assignment action

Add a server action dedicated to “assign the bot to the other side”.

Recommended API shape:

- New endpoint: `POST /api/games/{gameId}/assign-bot-opponent`
- Request body should already include a bot id, even in the first release, so the API shape does not need to change later.
- First-release request body example: `{ "botId": "simple" }`

Reason to prefer a dedicated endpoint over a generic command:

- It is seat-management behavior, closer to `claim-side` than to board mutation.
- It avoids overloading `GameCommandRequest` with non-turn actions that do not depend on `expectedVersion`.
- The request semantics stay simple while also future-proofing the endpoint for multiple bots.

Validation rules on the backend:

- Caller must be authenticated.
- Caller must currently own exactly one claimed human seat.
- The opposite seat must be open.
- Neither side may already be bot-controlled.
- The selected rule configuration must be exactly `sherwood-rules`.
- The game must not be finished.
- The game should still be in a pre-start state for the first release.

That last rule is recommended even though the user did not require it explicitly. It keeps the first implementation simple and avoids edge cases such as assigning a bot into a live game with an already-developed position and immediate forced moves.

### 3. Extend seat and viewer derivation without changing viewer auth semantics

Keep `viewerRole` exactly as it works today:

- `anonymous`
- `spectator`
- `dragons`
- `ravens`

Do not introduce a `bot` viewer role. A bot is not a browser viewer or authenticated actor.

Instead, expose bot state through the session and optionally through view metadata if needed by the frontend. The seat panel can then render:

- human user display name if a human owns the seat
- `Bot: Simple` if the seat is bot-controlled
- `Open seat` otherwise

Selectors should derive:

- whether Sherwood bot assignment is supported for the current game
- whether the viewer can assign a bot opponent
- which side would receive the bot if the button is pressed

### 4. Add canonical Sherwood legal-move enumeration on the backend

The bot needs legal action generation from canonical rules. Right now the backend can validate a proposed move, but it does not expose a reusable “enumerate all legal moves” helper.

Add a backend helper layer for Sherwood move generation:

- enumerate all movable pieces for the active side
- enumerate all reachable orthogonal destinations for each piece
- filter candidates through the existing Sherwood legality rules
- produce a stable ordered list of legal moves

Recommended location:

- introduce focused helpers in the Kotlin game module, near the original-style rules
- keep the public entry point in `GameRules` so callers do not need to know rule-engine internals

Suggested types:

- `data class LegalMove(val origin: String, val destination: String)`
- `data class BotAction(...)` if the bot action layer needs to distinguish seat actions from turn actions later

Suggested APIs:

- `GameRules.getLegalMoves(snapshot: GameSnapshot): List<LegalMove>`
- optional `GameRules.isBotAssignable(session: GameSession): Boolean`

Implementation notes for Sherwood:

- Reuse `BoardCoordinates.allSquares`, `BoardCoordinates.pathBetween`, and the existing `validateMove` logic in `OriginalStyleRuleEngine`.
- Preserve deterministic ordering, for example lexicographic by `origin`, then `destination`.
- Avoid duplicating the client-only logic from `game-rules-client.ts`.

### 5. Add a first-pass Sherwood bot policy

Create a backend service dedicated to selecting the next Sherwood move, for example:

- `SimpleBotService.kt`

Inputs:

- current `GameSnapshot`

Output:

- selected legal move

First-pass deterministic heuristic:

1. If any legal move wins immediately for dragons by moving the gold to a corner, choose the earliest such move.
2. If any legal move wins immediately for ravens by capturing the gold, choose the earliest such move.
3. Otherwise score candidate moves by simple features and pick the highest-scoring move.

Suggested initial scoring features:

- prefer moves that capture enemy pieces immediately
- for dragons, prefer moves that reduce the gold’s Manhattan distance to a corner
- for ravens, prefer moves that reduce distance to the gold or increase pressure on the gold’s neighbors
- prefer moves that increase mobility for the moving side
- penalize moves that leave the moved piece exposed if not already rejected by validation

Keep the first heuristic intentionally small and easy to test. The goal is correctness and stable behavior, not deep search.

### 6. Orchestrate automatic bot turns inside `GameSessionService`

After a state transition that may hand control to the bot, the server should keep applying bot turns while the active side remains bot-controlled.

Likely trigger points:

- after successful bot assignment
- after `start-game`
- after any human move that ends with the bot to act
- after undo, if undo can restore a bot-to-move position

Recommended orchestration pattern:

1. Load current stored game under the existing per-game lock.
2. Apply the initiating human action.
3. Persist and broadcast the result.
4. While the game is active and the side to move is bot-controlled:
   - compute the bot move from the persisted snapshot
   - apply it through the same canonical rule path
   - persist and broadcast the new session
5. Return the final post-bot session to the caller.

Why this belongs in `GameSessionService`:

- it already owns locking, persistence retries, and broadcast timing
- bot chaining should stay close to session orchestration rather than inside pure rule code

Important guardrails:

- keep the bot loop deterministic and bounded
- do not recurse through controller endpoints
- do not bypass `GameCommandService` for move application unless a smaller internal helper is extracted cleanly
- make sure each stored intermediate bot turn still broadcasts so connected browsers stay in sync

### 7. Decide first-release undo behavior before implementation

Undo semantics become tricky once the bot replies immediately.

Recommended first-release rule:

- Disable undo for games with an assigned bot.

Reason:

- current undo ownership is user-based
- a bot response would otherwise immediately change `undoOwnerSide`
- supporting “undo human move and bot reply together” is a separate product decision

Implementation path:

- when either bot id is non-null, set `canUndo` false and reject `undo`
- update selectors so the UI hides or disables undo accordingly

This is stricter than the current behavior, but it is the safest first slice.

### 8. Add frontend support for assigning the opposing bot

UI behavior in the seat panel:

- If the current game is `sherwood-rules`
- and exactly one human seat is claimed by the current viewer
- and the opposite seat is open
- and neither seat is bot-controlled
- then show one button:
  - `Assign Bot To Ravens` if the viewer claimed dragons
  - `Assign Bot To Dragons` if the viewer claimed ravens

Do not show the button when:

- the game uses any other ruleset
- the viewer is not authenticated
- the viewer has not claimed a seat
- both seats are already occupied
- the opposite side is already a bot
- the game is already active or finished, if we keep the pre-start-only restriction

Frontend work:

- add client transport helper in [game-client.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-client.ts)
- add thunk in [gameThunks.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameThunks.ts)
- add selectors in [gameSelectors.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameSelectors.ts)
- update [SeatPanel.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/SeatPanel.tsx) to render seat labels and the new action button
- wire the callback from [GameScreen.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/GameScreen.tsx)

### 9. Testing strategy

#### Backend tests

Add or extend tests to cover:

- bot assignment is rejected for `free-play`
- bot assignment is rejected for `original-game`, `trivial`, and `sherwood-x-9`
- bot assignment succeeds only for `sherwood-rules`
- bot assignment requires exactly one claimed human seat
- bot assignment targets the opposite open side only
- bot assignment is rejected when the target seat is already human-claimed
- bot assignment is rejected when a bot is already present
- legal move generation for Sherwood respects:
  - orthogonal movement only
  - path blocking
  - gold one-square movement
  - center/corner restrictions
  - illegal enemy sandwich moves
  - “do not expose your own piece to capture” restriction
- bot turn orchestration applies a move automatically when the bot is to act
- game-over positions stop the bot loop
- undo is rejected once a bot is assigned, if we adopt that rule

Primary backend test files:

- [src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt](/Users/jrayazian/code/dragons-vs-ravens/src/test/kotlin/com/dragonsvsravens/game/GameRulesTest.kt)
- [src/test/kotlin/com/dragonsvsravens/game/GameControllerTest.kt](/Users/jrayazian/code/dragons-vs-ravens/src/test/kotlin/com/dragonsvsravens/game/GameControllerTest.kt)

Add a dedicated backend bot test file if the coverage becomes too broad, for example:

- `src/test/kotlin/com/dragonsvsravens/game/SherwoodBotTest.kt`

#### Frontend tests

Add or extend tests to cover:

- seat panel shows `Assign Bot To ...` only in the allowed Sherwood state
- the button is hidden for `free-play` and other non-Sherwood rulesets
- seat labels render `Bot: Simple` for bot-controlled seats
- clicking the button dispatches the bot-assignment thunk
- undo is hidden or disabled when the session reports a bot-controlled seat and undo is unavailable

Primary frontend test files:

- [src/test/frontend/game-thunks.test.ts](/Users/jrayazian/code/dragons-vs-ravens/src/test/frontend/game-thunks.test.ts)
- [src/test/frontend/game-screen.test.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/test/frontend/game-screen.test.tsx)

## Step-By-Step Implementation Sequence

### Phase 1: Session and API plumbing

1. Add bot seat fields to `GameSession` and the TS session type.
2. Add a Flyway migration and store/codec support.
3. Extend `GameViewResponse` consumption so the frontend receives bot ids plus display metadata for the first-release bot.
4. Add the `assign-bot-opponent` backend endpoint and validation.

Deliverable:

- Sherwood games can persist release-two-ready bot seat state, but the bot does not move yet.

### Phase 2: Sherwood move enumeration

1. Add legal move generation helpers for Sherwood in the Kotlin game module.
2. Add focused tests proving the generated move set matches Sherwood constraints.

Deliverable:

- backend can deterministically enumerate legal Sherwood moves for the side to act.

### Phase 3: Bot policy and server orchestration

1. Add `SherwoodBotService`.
2. Add automatic bot-turn orchestration in `GameSessionService`.
3. Decide and enforce first-release undo behavior.
4. Add backend integration tests for assignment plus auto-response.

Deliverable:

- assigned Sherwood bot plays automatically from the server after human actions.

### Phase 4: Frontend controls and feedback

1. Add client API helper and thunk for bot assignment.
2. Add selectors for bot eligibility and assignment target.
3. Update `SeatPanel` and `GameScreen` wiring.
4. Add frontend tests.

Deliverable:

- users can assign the opposite Sherwood seat to a bot from the game UI.

### Phase 5: Verification and docs

1. Run `./gradlew test`.
2. Manually sanity-check a Sherwood game in the browser.
3. Update [docs/code-summary.md](/Users/jrayazian/code/dragons-vs-ravens/docs/code-summary.md) and [README.md](/Users/jrayazian/code/dragons-vs-ravens/README.md) to describe the finished behavior.

## Confirmed First-Release Decisions

The following recommended approaches are confirmed for the first release:

1. Bot assignment is allowed only before `start-game`, not during a live Sherwood game.
2. Undo is disabled for bot games in the first release.
3. The bot moves synchronously inside `GameSessionService` during the request/response cycle.

## Risks And Mitigations

- Risk: duplicated rules between frontend and backend.
  Mitigation: keep all bot move generation in Kotlin and treat the frontend as display plus action wiring only.
- Risk: session persistence drift after adding bot fields.
  Mitigation: update model, codec, migration, and JDBC reads/writes together, then add persistence coverage in controller/service tests.
- Risk: bot loop complexity around locking and broadcast order.
  Mitigation: keep orchestration inside `GameSessionService` and reuse the existing per-game lock.
- Risk: legal move enumeration may accidentally diverge from Sherwood validation.
  Mitigation: generate candidates broadly, then filter by existing `validateMove` instead of rewriting legality rules from scratch.
- Risk: immediate bot replies make undo confusing.
  Mitigation: disable undo for bot games in the first release.

## Recommended First Commit Breakdown

To keep the implementation reviewable, split the eventual code work into small commits:

1. session model, migration, and API plumbing for bot-controlled seats
2. Sherwood-only bot assignment endpoint plus validation
3. Sherwood legal move enumeration helpers and tests
4. `SimpleBotService` plus server-side bot orchestration
5. frontend seat-panel wiring and tests
6. docs polish after the feature is complete

## Second Release Plan

The second release should build directly on the release-one bot-id persistence model and introduce a small bot platform rather than another one-off implementation. The original first-release bot should stay available and be named `Simple`.

### Scope

This second release should add:

1. bot assignment whenever a seat is empty, even if the game is already started
2. undo support that rolls back the last human move and the immediately following bot reply together
3. bot support for `original-game` and `sherwood-x-9` in addition to `sherwood-rules`
4. multiple selectable bot implementations with distinct names and strategies
5. a `Random` bot that chooses a legal move from the canonical legal-action set
6. a minimax bot that searches future positions and chooses moves by evaluation score
7. preservation of the original release-one bot under the new display name `Simple`

### Product Rules For Release Two

- A human may assign a bot whenever exactly one seat is open and bot assignment is supported for the current ruleset, regardless of whether the game is still in setup or already in progress.
- The assign-bot action should let the user choose which available bot to assign to the open seat.
- `Free Play` should still reject bot assignment.
- `Sherwood Rules`, `Original Game`, and `Sherwood x 9` should support bots.
- The available bot list should include `Simple`, `Random`, and `Minimax` when supported for the current ruleset.
- Assigned bot seats should render as `Bot: <botname>`.
- Undo should remain available in bot games, but invoking it should roll back one complete exchange: the last human move plus the bot move that immediately followed it.
- If the assigned bot side is to move after assignment in a live game, the server should act immediately using that bot's policy.

### Core Design

#### 1. Reuse the release-one bot-id model

Release one should already persist:

- `dragonsBotId: String?`
- `ravensBotId: String?`

Release two should keep that model and build a bot catalog on top of it instead of changing the schema again.

Recommended supporting types:

- `data class BotDefinition(val id: String, val displayName: String, ... )`
- `interface GameBotStrategy { fun chooseAction(session: GameSession): BotDecision }`
- `BotRegistry` or similar catalog to map ids to implementations and supported rulesets

This keeps persistence compact while letting the server expose stable bot ids and friendly names to the frontend.

#### 2. Formalize the bot lineup

The first-release bot should remain available and be renamed:

- id: `simple`
- display name: `Simple`

Release two should add:

- id: `random`
- display name: `Random`
- id: `minimax`
- display name: `Minimax`

The registry should be the single source of truth for:

- bot ids
- display names
- supported rulesets
- strategy implementations

#### 3. Generalize canonical legal action generation

The first release adds Sherwood move generation. Release two should broaden that into ruleset-aware legal action generation so `Simple`, `Random`, and `Minimax` can all operate on `sherwood-rules`, `original-game`, and `sherwood-x-9`.

Recommended API direction:

- `GameRules.getLegalMoves(snapshot: GameSnapshot): List<LegalMove>`
- `GameRules.getLegalActions(snapshot: GameSnapshot): List<BotAction>` if move-phase and capture-phase branching need a shared action abstraction

Important note:

- callers should still go through a single `GameRules` facade even if different rulesets need different internal enumeration helpers

#### 4. Add pure simulation support for search-based bots

The minimax bot needs a way to evaluate hypothetical positions in memory without persistence or controller round-trips.

Recommended direction:

- simulate from `GameSnapshot`
- reuse canonical rule transitions for hypothetical actions
- keep search and evaluation entirely in the Kotlin game module
- use deterministic action ordering for reproducible choices and stable tests

#### 5. Redefine undo around exchange history

Undo in bot games should reverse a full exchange instead of a single command. That means the server needs enough history metadata to know whether the last transition was:

- a human move only
- a bot move only
- a human-plus-bot exchange
- a setup or seat-management action that should not be grouped with turn undo

Recommended direction:

- keep canonical undo bookkeeping on the backend
- store richer internal undo records or exchange-boundary metadata
- when a human triggers undo in a bot game, restore the snapshot from before their last move if the bot answered immediately after it

This should remain a backend concern so Redux selectors only reflect the resulting `canUndo` and any explanatory messaging.

#### 6. Support live-game bot assignment safely

Assigning a bot after the game has started adds edge cases that the first release intentionally avoids.

Validation should now allow:

- setup positions before `start-game`
- active in-progress games where exactly one seat is open

Validation should still reject:

- finished games
- games where both seats are occupied
- unsupported rulesets
- `free-play`
- invalid bot ids for the current ruleset

If the newly assigned bot is also the active side, the assignment endpoint should persist the assignment and then immediately run the bot loop before returning.

### Backend Workstreams

#### Catalog and API work

- keep the existing bot-id persistence fields in `GameSession`, JSON codec, JDBC store, and TS wire types
- add backend-exposed bot catalog metadata so the frontend can render available choices and assigned bot names
- update the bot-assignment endpoint to require a bot id in the request body

Recommended request shape:

- `POST /api/games/{gameId}/assign-bot-opponent`
- request body example: `{ "botId": "random" }`

That preserves the seat-management endpoint while supporting multiple bots.

#### Bot strategy services

- rename or formalize the original release-one bot as `Simple`
- create a backend registry of supported bots
- implement `Random` bot on top of canonical legal action enumeration
- implement `Minimax` bot with deterministic tie-breaking and bounded search depth
- expose only rule-compatible bots for the current session

#### Rule evaluation support for minimax

The minimax bot needs:

- ruleset-aware legal action generation
- a fast way to apply hypothetical actions to snapshots without mutating persisted state
- evaluation heuristics per supported ruleset
- deterministic ordering for reproducible choices and stable tests

Recommended approach:

- keep search purely in memory over snapshots
- reuse canonical rule transitions for simulation
- add a small evaluation layer per ruleset rather than encoding all scoring in one generic heuristic

#### Undo and orchestration work

- update undo history internals so the server can revert a human move and bot reply together
- ensure bot-triggered follow-up still broadcasts each intermediate state as needed
- ensure `undo` returns the final restored session after the grouped rollback
- allow bot assignment during live supported games and trigger an immediate bot move when appropriate

### Frontend Workstreams

- replace the single assign-bot button state with selectable bot options
- render assigned bot seats as `Bot: <botname>`
- keep the assignment affordance available when a supported in-progress game has an empty seat
- leave undo enabled when the backend reports grouped undo is available
- update explanatory copy so users understand that undo reverses the last human-plus-bot exchange

Likely touchpoints:

- [src/main/frontend/components/SeatPanel.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/SeatPanel.tsx)
- [src/main/frontend/components/GameScreen.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/components/GameScreen.tsx)
- [src/main/frontend/features/game/gameSelectors.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameSelectors.ts)
- [src/main/frontend/features/game/gameThunks.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/features/game/gameThunks.ts)
- [src/main/frontend/game-client.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-client.ts)
- [src/main/frontend/game-types.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-types.ts)

### Testing Strategy For Release Two

Backend tests should cover:

- live-game bot assignment into an already-started supported game
- rejection for `free-play` and unsupported rulesets
- bot availability for `original-game`, `sherwood-rules`, and `sherwood-x-9`
- bot catalog filtering by ruleset
- `Simple` remains available and behaviorally equivalent to the original first-release bot
- `Random` chooses only legal actions
- `Minimax` chooses expected actions in controlled positions
- grouped undo restoring the pre-human-turn snapshot in bot games
- immediate bot response after live-game assignment when the bot side is to move

Frontend tests should cover:

- bot selection UI renders available named bots
- assignment remains available when one seat is empty in an active supported game
- assigned seats render as `Bot: <botname>`
- undo stays enabled for bot games when the backend says it is available
- bot assignment requests send the selected bot id

### Suggested Release-Two Implementation Sequence

1. generalize legal action enumeration across the supported rulesets
2. formalize the original first-release bot as `Simple` and expose a backend bot catalog
3. update live-game bot assignment to accept selectable bot ids
4. implement the `Random` bot and wire selectable bot assignment through the UI
5. add grouped undo semantics for bot exchanges
6. implement the `Minimax` bot on the shared action and evaluation layer
7. expand frontend bot-selection UI and complete cross-ruleset coverage and tests
