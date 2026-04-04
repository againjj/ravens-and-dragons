# Dragons vs Ravens

A Spring Boot Kotlin web app with a TypeScript frontend for a simple board game prototype.

## Requirements

- Java 21 installed and available to the Gradle build
- No separate Gradle installation is required because the Gradle wrapper is included
- No separate Node installation is required because Gradle downloads the frontend toolchain
- Internet access the first time you run the app so Gradle can download its distribution, frontend toolchain, and project dependencies

## Run

```bash
./gradlew bootRun
```

Then open `http://localhost:8080`.

## Notes

- The frontend logic lives in `src/main/frontend/app.ts`.
- `app.js` is generated during the Gradle build from the TypeScript source.
