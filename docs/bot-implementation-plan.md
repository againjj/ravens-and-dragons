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

Add explicit bot ownership fields to `GameSession` rather than overloading existing user ownership:

- `dragonsBot: Boolean`
- `ravensBot: Boolean`

Using booleans is enough for the first release because there is only one bot type and no bot identity/profile. This also keeps auth logic distinct from AI control.

Update these layers consistently:

- Kotlin session model in [GameModels.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameModels.kt)
- JSON codec in [GameJsonCodec.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/GameJsonCodec.kt)
- JDBC persistence in [JdbcGameStore.kt](/Users/jrayazian/code/dragons-vs-ravens/src/main/kotlin/com/dragonsvsravens/game/JdbcGameStore.kt)
- TS wire types in [game-types.ts](/Users/jrayazian/code/dragons-vs-ravens/src/main/frontend/game-types.ts)

Database migration:

- Add nullable or defaulted boolean columns to the `games` table for each side.
- Default existing rows to `false`.
- Keep the migration backward-safe for already persisted games.

### 2. Add a dedicated bot-assignment action

Add a server action dedicated to “assign the bot to the other side”.

Recommended API shape:

- New endpoint: `POST /api/games/{gameId}/assign-bot-opponent`
- Empty request body, because the server can infer the target side from the claimed seat state.

Reason to prefer a dedicated endpoint over a generic command:

- It is seat-management behavior, closer to `claim-side` than to board mutation.
- It avoids overloading `GameCommandRequest` with non-turn actions that do not depend on `expectedVersion`.
- The request semantics are simpler and easier to validate on both sides.

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
- `Bot` if the seat is bot-controlled
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

- `SherwoodBotService.kt`

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

- when either bot flag is true, set `canUndo` false and reject `undo`
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
- seat labels render `Bot` for bot-controlled seats
- clicking the button dispatches the bot-assignment thunk
- undo is hidden or disabled when the session reports a bot-controlled seat and undo is unavailable

Primary frontend test files:

- [src/test/frontend/game-thunks.test.ts](/Users/jrayazian/code/dragons-vs-ravens/src/test/frontend/game-thunks.test.ts)
- [src/test/frontend/game-screen.test.tsx](/Users/jrayazian/code/dragons-vs-ravens/src/test/frontend/game-screen.test.tsx)

## Step-By-Step Implementation Sequence

### Phase 1: Session and API plumbing

1. Add bot seat fields to `GameSession` and the TS session type.
2. Add a Flyway migration and store/codec support.
3. Extend `GameViewResponse` consumption so the frontend receives bot flags.
4. Add the `assign-bot-opponent` backend endpoint and validation.

Deliverable:

- Sherwood games can persist bot-assigned seat state, but the bot does not move yet.

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

## Open Decisions To Confirm During Implementation

These do not block the plan document, but they should be settled before or during implementation:

1. Should bot assignment be allowed only before `start-game`, or also during a live Sherwood game?
   Recommended: pre-start only for the first release.
2. Should undo be fully disabled for bot games, or should it undo the entire last human-plus-bot exchange?
   Recommended: disable undo for bot games in the first release.
3. Should the bot move synchronously inside the request/response cycle, or on a short asynchronous handoff?
   Recommended: synchronous inside `GameSessionService` for the first release because it is simpler and consistent with current in-memory orchestration.

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
4. `SherwoodBotService` plus server-side bot orchestration
5. frontend seat-panel wiring and tests
6. docs polish after the feature is complete
