# Adding A New Game

This is the canonical implementation guide for adding a browser game to this repository. Keep it current whenever the game module contract, frontend game entry shape, create flow, player picker, or app registration steps change. A new game should be possible to implement from this document plus the platform API docs, without reading an existing game implementation.

## Project Shape

Create one top-level project per game:

- `your-game/`
- `your-game/backend/`
- `your-game/frontend/`

Add all three projects to `settings.gradle.kts`. The top-level `build.gradle.kts` should set `pairedProjectDisplayName`, apply `../gradle/paired-project.gradle.kts`, and set a game-specific Gradle group for subprojects. The backend should depend on `:platform:backend`; the frontend should depend on `@ravensanddragons/platform-frontend`.

Each game must also include:

- `AGENTS.md`
- `code-summary.md`

Keep game rules, game-specific commands, score/state semantics, assets, and UI in the game module. Do not move canonical game behavior into `platform/`, `app/`, or React-only helpers.

## Backend Checklist

Implement a `GameModuleDefinition` with:

- `identity.slug`, using lowercase letters, numbers, and dashes.
- `identity.displayName`.
- `routes.browserCreatePath` exactly `/{slug}/create`.
- `routes.browserPlayPathPattern` as `/g/{gameId}`.
- `routes.apiBasePath` as `/api/games/{gameSlug}`.
- `persistence.platformMetadataFields` containing the shared game-record fields.
- `persistence.opaquePayloadNames` containing `public_state_json` and `private_state_json`.
- `smokeCheck` browser/API entry paths.

Implement a Spring `GameHandler` component. The handler owns:

- Creating initial public/private state from a create request.
- Validating and applying commands.
- Returning client-facing public state.
- Returning a viewer-specific `gameView` when private data is needed.
- Public lobby details.
- Signed-in player menu details.
- `playerUserIds` for platform account validation and account cleanup.

Public state may be broadcast over SSE to every connected viewer. Private state must stay in `private_state_json` and only be exposed through `gameView` to users who are allowed to see it.

## Frontend Checklist

Export a `GameEntry` from the game frontend package. The entry supplies:

- `identity`
- slug-derived create/play route helpers
- `CreateScreen`
- `PlayScreen`
- lifecycle functions

The create screen must include:

- The shared player picker/Add Player flow when the game has player seats.
- A `Publicly list game` checkbox.
- A start button.
- Game-specific configuration controls.

Use `GameStartOptions` for create payloads. Include `publiclyListed` and any game-specific options in the object passed to `onStartGame`.

Frontend async failures must preserve auth/session expiry, server/network failure, and domain errors. Use the shared platform API helpers instead of turning failed loads into empty states.

Use Redux for game UI state, async game loading/submission status, and client-only interaction state that crosses component boundaries. Keep canonical rules and server-owned game state semantics in the backend; Redux should orchestrate the frontend view and command flow.

Live game screens should open `GET /api/games/{gameId}/stream` with `EventSource`, apply incoming `game` events, and close the stream on `onerror`. Do not build a custom reconnect loop in game code. When the stream errors because the server is down, call the shared server-unavailable notification helper and wait for a later user action, route change, or page reload to reconnect.

When a game needs viewer-private state, load it through `GET /api/games/{gameId}/view` after the initial route resolves and after public stream events arrive. The stream payload is public state; do not put private hands, hidden pieces, or per-viewer reveal state in the stream.

## App Registration

Backend:

- Add `implementation(project(":your-game:backend"))` to `app/backend/build.gradle.kts`.
- Register the module definition in `RavensAndDragonsApplication`.
- Update app backend tests so the assembled registry includes the new slug.

Frontend:

- Add the frontend package to `app/frontend/package.json`.
- Add the game frontend npm install and source inputs to `app/frontend/build.gradle.kts`.
- Import the game entry in `app/frontend/src/main/frontend/App.tsx`.
- Add the entry to `registeredGameEntries`.

## Verification

Add focused backend tests for game rules and command behavior. Add frontend tests for create options, critical play interactions, and error handling. At minimum run:

- `./gradlew :your-game:test`
- `./gradlew :app:backend:test`
- `./gradlew :app:frontend:test`

Run `./gradlew test` before finishing broad changes whenever practical.
