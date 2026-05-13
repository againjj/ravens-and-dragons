# Clicker Code Summary

## Overview

`clicker/` is the Clicker game module. It owns a small counter game where creating a game starts at `0`, clicking increments the counter, and the game is finished when the counter reaches `10`.

The parent project has two child projects:

- `clicker/clicker-backend`
- `clicker/clicker-frontend`

## Backend Project

- `clicker/clicker-backend/build.gradle.kts`
  - Kotlin/JVM backend module with Java 21.
  - Depends on `:platform` only.
- `src/main/kotlin/com/ravensanddragons/clicker/ClickerGameModuleDefinition.kt`
  - Clicker implementation of the platform game module contract.
  - Declares the `clicker` slug and `/clicker/create` browser route.
- `src/main/kotlin/com/ravensanddragons/clicker/ClickerGameHandler.kt`
  - Implements the platform `GameHandler` port for Clicker.
  - Creates counter state, handles click commands, and marks the game finished at `10`.

## Frontend Project

- `clicker/clicker-frontend/build.gradle.kts`
  - Typechecks the Clicker frontend package with Gradle-managed Node/npm.
- `src/main/frontend/clicker-entry.tsx`
  - Exports `clickerGameEntry` for the app-owned frontend shell.
  - Owns the Clicker create and play screens plus Clicker-specific REST/SSE behavior.

## Boundaries

Clicker does not depend on Ravens and Dragons. Platform owns only generic game runtime behavior; Clicker owns its counter state, command semantics, and UI.
