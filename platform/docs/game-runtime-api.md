# Game Runtime API

This document describes the platform APIs used by game modules. Keep it current when platform contracts or shared frontend APIs change.

## Backend Module Contract

Register each game with a `GameModuleDefinition`:

- `GameModuleIdentity`: stable slug and display name.
- `GameModuleRoutes`: browser create route, play route pattern, and slugged API pattern.
- `GameModulePersistenceContract`: shared platform metadata fields and opaque game-owned JSON payload names.
- `GameModuleSmokeCheck`: lightweight browser/API paths the assembled app can verify.

The platform validates slug shape and requires create paths to derive from the slug.

## GameHandler

Each game supplies one Spring `GameHandler`.

- `createGame(gameId, request, createdByUserId)`: create a `GameRecord`. The `request` excludes platform-owned create fields such as `publiclyListed`.
- `applyCommand(current, command, actingUserId)`: validate version, permissions, and command semantics; return the updated record.
- `afterCommandPersisted`: optional hook for follow-up state after a command is stored.
- `gameView(current, currentUserId)`: return viewer-specific state, including private data the user is allowed to see.
- `publicState(current)`: normalize state sent through generic reads/streams.
- `publicGameDetails`: lobby listing name and open-seat count.
- `playerGameDetails`: signed-in user menu entry and turn badge.
- `playerUserIds`: all user ids currently referenced by game seats.
- `clearUserReferences`: remove deleted-user references from game-owned state.

`publicState` is visible to all viewers of the game stream. Sensitive hand, hidden-piece, or player-private data belongs in `privateState` and should be surfaced only through `gameView`.

## Runtime Routes

The platform owns these routes:

- `POST /api/games/{gameSlug}` creates a game.
- `GET /api/games/{gameId}` returns public state.
- `GET /api/games/{gameId}/view` returns viewer-specific state.
- `POST /api/games/{gameId}/commands` applies a game command.
- `GET /api/games/{gameId}/stream` streams public game updates.
- `GET /api/games/public` lists publicly listed unfinished games.
- `GET /api/games/mine` and `/stream` list signed-in user games.

Command persistence revalidates newly added player-seat user ids through the platform account validator before storing the state.

## Shared Frontend APIs

`@ravensanddragons/platform-frontend/game-entry` exports the `GameEntry` contract. A game entry supplies create/play components and lifecycle functions. Create screens should pass `GameStartOptions` to `onStartGame`, including `publiclyListed` plus any game-specific settings.

`@ravensanddragons/platform-frontend/player-picker` exports `PlayerPicker`. Use it for Add Player flows instead of duplicating account selection UI. Pass an empty bot list when a game does not support bots.

`@ravensanddragons/platform-frontend/api-client` exports auth/session/server error helpers. Use them so `401`, server/network failures, and domain errors remain distinguishable.

Game play screens should close `EventSource` streams on `onerror` and notify server-unavailable state with the shared helper. Do not repeatedly reconnect while the server is down; reconnect only after a later user action, route/session change, or full page reload. If a game uses `gameView` for private viewer data, refresh that view in response to public stream events instead of sending private data through the stream.
