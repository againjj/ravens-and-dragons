# Adding A Game To The App

The app project assembles platform plus selected game modules. It should not contain game rules.

## Backend

1. Add the game backend project as an implementation dependency in `app/backend/build.gradle.kts`.
2. Import the game module definition in `RavensAndDragonsApplication`.
3. Add the definition to the `GameModuleRegistry` bean.
4. Update `RavensAndDragonsApplicationTests` with the expected slug, routes, persistence contract, and smoke paths.

## Frontend

1. Add the game frontend package to `app/frontend/package.json`.
2. Add the game frontend `npmInstall` task and source folder to `app/frontend/build.gradle.kts`.
3. Import the game entry in `App.tsx`.
4. Add the entry to `registeredGameEntries`.

The app shell routes `/{gameSlug}/create` and `/g/{gameId}` through each game entry. Game-specific create options should flow through `GameStartOptions`; do not special-case them in the app shell.
