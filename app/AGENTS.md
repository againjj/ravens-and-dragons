# App Agent Instructions

This file contains instructions for work inside the `app/` project.

## Required Context

- Read the repository root `AGENTS.md` and `code-summary.md` first.
- Read this file and `app/code-summary.md` before changing `app/`.
- If app work touches platform contracts or game modules, also read the corresponding project-level files under `platform/` and `ravens-and-dragons/`.

## Ownership

- `app/` owns the runnable Spring Boot application and deployment jar assembly.
- `app/` wires shared platform services and the selected game modules into one deployable service.
- `app/` owns application-level beans such as the system clock, stale-game cleanup delay, and game module registry assembly.
- `app/` should not own canonical game rules, game-specific command behavior, auth persistence internals, or frontend components.

## Build And Runtime Rules

- Preserve the current root command behavior: `./gradlew bootRun`, `./gradlew bootJar`, and aggregate tests should keep working from the repository root.
- Keep local `bootRun` behavior aligned with root local-run rules, including `.env.local` loading when that todo is implemented.
- Do not change Railway deployment behavior unless the user explicitly asks for deployment or runtime changes.
- The executable jar should continue to be named `ravens-and-dragons.jar` unless the user explicitly asks to rename the service artifact.

## Testing

- `:app:test` should stay focused on assembled-service wiring and Spring context tests.
- Use `./gradlew :app:test` for focused app verification.
- Run `./gradlew test` before finishing app changes whenever practical.
