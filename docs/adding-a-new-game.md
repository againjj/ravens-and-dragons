# Adding A New Game

This is the canonical implementation guide for adding a browser game to this repository. Keep it current whenever the game module contract, frontend game entry shape, create flow, player picker, or app registration steps change. A new game should be possible to implement from this document plus the platform API docs, without reading an existing game implementation.

## Project Shape

Create one top-level project per game:

- `your-game/`
- `your-game/backend/`
- `your-game/frontend/`

Add all three projects to `settings.gradle.kts`:

```kotlin
include("your-game")
include("your-game:backend")
include("your-game:frontend")
```

The top-level `your-game/build.gradle.kts` should set `pairedProjectDisplayName`, apply `../gradle/paired-project.gradle.kts`, and set a game-specific Gradle group for subprojects:

```kotlin
extra["pairedProjectDisplayName"] = "Your Game"

apply(from = "../gradle/paired-project.gradle.kts")

subprojects {
    group = "com.ravensanddragons.yourgame"
}
```

The backend should depend on `:platform:backend`; the frontend should depend on `@ravensanddragons/platform-frontend`.

Each game must also include:

- `AGENTS.md`
- `code-summary.md`

Keep game rules, game-specific commands, score/state semantics, assets, and UI in the game module. Do not move canonical game behavior into `platform/`, `app/`, or React-only helpers.

Recommended minimum frontend files:

- `your-game/frontend/package.json`
- `your-game/frontend/package-lock.json`
- `your-game/frontend/tsconfig.json`
- `your-game/frontend/vite.config.ts`
- `your-game/frontend/src/main/frontend/your-game-entry.tsx`
- `your-game/frontend/src/test/frontend/your-game-entry.test.tsx`

Recommended minimum backend files:

- `your-game/backend/build.gradle.kts`
- `your-game/backend/src/main/kotlin/<package>/YourGameModuleDefinition.kt`
- `your-game/backend/src/main/kotlin/<package>/YourGameHandler.kt`
- `your-game/backend/src/test/kotlin/<package>/YourGameHandlerTest.kt`

Generated artifacts such as `build/`, `.gradle/`, and `node_modules/` inside a new game project should not be committed. They may appear after local Gradle/npm verification.

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

For games with hidden hands, decks, unrevealed pieces, or any per-viewer information:

- Store public table state, counts, seats, current turn, visible piles, and visible boards in `public_state_json`.
- Store hidden hands, hidden decks, unseen cards, and other private payloads in `private_state_json`.
- Override `publicState(current)` when the persisted public state needs normalization before normal reads/streams.
- Override `gameView(current, currentUserId)` to return the public state plus a viewer-only object such as `viewer`, including the current user id, viewer seat, and only the private data that viewer may see.
- Frontend play screens should load `GET /api/games/{gameId}/view` for initial state and after stream events when private state is needed.
- SSE `game` events are public; treat them as invalidation hints or public updates, not as a place to send viewer-private data.

For seated games:

- Keep seats in game-owned public state, usually as `{ userId, displayName }` entries.
- Implement `playerUserIds(current)` with all seated user ids so the platform can validate accounts and clean up deleted users.
- Implement `playerGameDetails(current, currentUserId)` so the app header can show the game and turn badge for seated users.
- Implement `clearUserReferences(current, userId)` if deleted users need to be removed from seats or creator metadata.
- Add a `claimSeat` or equivalent command if players are seated after creation. Validate the acting user and preserve the platform record's `publiclyListed` value when returning updated records.

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

The frontend package should export the game entry from `package.json`:

```json
{
  "name": "your-game-frontend",
  "type": "module",
  "private": true,
  "exports": {
    ".": {
      "types": "./src/main/frontend/your-game-entry.tsx",
      "default": "./src/main/frontend/your-game-entry.tsx"
    }
  }
}
```

Use a slug-derived route pattern in the entry:

```ts
const playRoutePattern = /^\/g\/([^/]+)$/;

export const yourGameEntry: GameEntry = {
    identity: { slug: "your-game", displayName: "Your Game" },
    routes: {
        createPath: buildGameCreatePath("your-game"),
        buildPlayPath: (gameId) => "/g/" + encodeURIComponent(gameId.trim()),
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: { CreateScreen, PlayScreen },
    lifecycle: {
        useSession: emptyLifecycle,
        startGame: async (_dispatch, _gameSlug, options) => {
            const game = await createYourGame(options);
            return game.id;
        },
        openGame: emptyLifecycle,
        returnToLobby: emptyLifecycle,
        enterCreateMode: emptyLifecycle,
        clearCreateMode: emptyLifecycle
    }
};
```

Frontend async failures must preserve auth/session expiry, server/network failure, and domain errors. Use the shared platform API helpers instead of turning failed loads into empty states.

Use Redux for game UI state, async game loading/submission status, and client-only interaction state that crosses component boundaries. Keep canonical rules and server-owned game state semantics in the backend; Redux should orchestrate the frontend view and command flow.

Live game screens should open `GET /api/games/{gameId}/stream` with `EventSource`, apply incoming `game` events, and close the stream on `onerror`. Do not build a custom reconnect loop in game code. When the stream errors because the server is down, call the shared server-unavailable notification helper and wait for a later user action, route change, or page reload to reconnect.

When a game needs viewer-private state, load it through `GET /api/games/{gameId}/view` after the initial route resolves and after public stream events arrive. The stream payload is public state; do not put private hands, hidden pieces, or per-viewer reveal state in the stream.

Use shared platform helpers for common frontend work:

- `createResponseError`, `isUnauthorizedError`, `isServerUnavailableError`, `notifyAuthSessionExpired`, and `notifyServerUnavailable` from `@ravensanddragons/platform-frontend/api-client`.
- `fetchAuthSession` and `fetchUsers` when a play screen needs current-user data or the shared player picker.
- `PlayerPicker` from `@ravensanddragons/platform-frontend/player-picker` for add-myself/add-player flows.

If a game package imports CSS from its entry file, the app frontend Vite build will include that CSS once the package is registered.

## App Registration

Backend:

- Add `implementation(project(":your-game:backend"))` to `app/backend/build.gradle.kts`.
- Register the module definition in `RavensAndDragonsApplication`.
- Update app backend tests so the assembled registry includes the new slug.
- Update app backend tests with the new module's display name, browser route, API route pattern, persistence namespace, platform metadata fields, opaque payload names, and smoke-check paths.

Frontend:

- Add the frontend package to `app/frontend/package.json`.
- Add the game frontend npm install and source inputs to `app/frontend/build.gradle.kts`.
- Import the game entry in `app/frontend/src/main/frontend/App.tsx`.
- Add the entry to `registeredGameEntries`.
- Expect `app/frontend/package-lock.json` to change after the app frontend install/build sees the new local package.

When app registration changes, update:

- `README.md`
- root `code-summary.md`
- `app/code-summary.md`
- the new game's `code-summary.md`

## Verification

Add focused backend tests for game rules and command behavior. Add frontend tests for create options, critical play interactions, and error handling. At minimum run:

- `./gradlew :your-game:test`
- `./gradlew :app:backend:test`
- `./gradlew :app:frontend:test`

Run `./gradlew test` before finishing broad changes whenever practical.

When npm install/test output reports vulnerabilities, surface the count and severity immediately. If npm reports `found 0 vulnerabilities`, include that in verification notes when relevant.
