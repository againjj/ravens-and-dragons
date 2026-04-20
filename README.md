# Dragons vs Ravens

Dragons vs Ravens is a Spring Boot and Kotlin web app for playing a browser-based board game with a React and Redux frontend. Games are stored in the app database, each game has its own URL, and connected players stay in sync through server-sent events.

## Highlights

- Create a new game from a draft setup or open an existing game by ID
- Play in the browser with live updates shared across tabs and clients
- Persist games in the configured database so they survive app restarts
- Sign in as a guest or local user, with optional Google OAuth support
- Claim the dragons or ravens side in a live game
- In a fresh `Sherwood Rules` game, assign the opposite open seat to a server-driven `Random` bot

## Requirements

- Java 21
- Internet access the first time Gradle runs so dependencies can be downloaded

You do not need a separate Gradle or Node installation. The Gradle wrapper is included, and the frontend toolchain is managed through Gradle.

## Run Locally

Start the app:

```bash
./gradlew bootRun
```

Then open [http://localhost:8080](http://localhost:8080).

By default, the app uses a local H2 database stored under `build/db/dragons-vs-ravens`.

## Run Tests

```bash
./gradlew test
```

## Local Authentication Setup

Guest and local-account sign-in work without extra setup.

Google sign-in appears only when a Google OAuth client registration is configured. To enable it locally:

1. Copy `.env.local.example` to `.env.local`.
2. Fill in your Google OAuth client values.
3. Load the environment before starting the app.

```bash
source .env.local
./gradlew bootRun
```

Expected environment variables:

```text
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email
```

Use these redirect URIs in Google Cloud:

- `http://localhost:8080/login/oauth2/code/google` for local development
- `https://<your-domain>/login/oauth2/code/google` for deployment

## Deployment Notes

The app is set up to run on Railway and other platforms that provide the runtime port through `PORT`.

For PostgreSQL deployments, configure these datasource settings:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/<database>
SPRING_DATASOURCE_USERNAME=<username>
SPRING_DATASOURCE_PASSWORD=<password>
SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver
```

Flyway migrations run automatically on startup.

## Project Layout

- `src/main/kotlin/com/dragonsvsravens/game`: backend game rules, session handling, and game APIs
- `src/main/kotlin/com/dragonsvsravens/auth`: authentication and account management
- `src/main/frontend`: React frontend, Redux state, and browser-side helpers
- `src/test`: backend and frontend tests
- `docs/code-summary.md`: architecture and implementation summary
