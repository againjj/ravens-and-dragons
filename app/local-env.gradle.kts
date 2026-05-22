import org.gradle.api.GradleException
import org.gradle.api.tasks.JavaExec

fun parseLocalEnvFile(envFile: File): Map<String, String> {
    if (!envFile.isFile) {
        return emptyMap()
    }

    val envKeyPattern = Regex("[A-Za-z_][A-Za-z0-9_]*")

    return envFile.readLines()
        .mapIndexedNotNull { index, rawLine ->
            val line = rawLine.trim()
            if (line.isEmpty() || line.startsWith("#")) {
                return@mapIndexedNotNull null
            }

            val separatorIndex = line.indexOf('=')
            if (separatorIndex <= 0) {
                throw GradleException("Unsupported dotenv syntax in ${envFile.name} at line ${index + 1}: expected KEY=value.")
            }

            val key = line.substring(0, separatorIndex).trim()
            if (!envKeyPattern.matches(key)) {
                throw GradleException("Unsupported dotenv key in ${envFile.name} at line ${index + 1}: $key")
            }

            val rawValue = line.substring(separatorIndex + 1).trim()
            val value = when {
                rawValue.length >= 2 && rawValue.first() == '"' && rawValue.last() == '"' -> rawValue.substring(1, rawValue.lastIndex)
                rawValue.length >= 2 && rawValue.first() == '\'' && rawValue.last() == '\'' -> rawValue.substring(1, rawValue.lastIndex)
                else -> rawValue
            }

            key to value
        }
        .toMap()
}

val testLocalEnvParser by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Verifies local dotenv file parsing used by bootRun."

    doLast {
        fun assertParsedEnv(name: String, fileContents: String, expected: Map<String, String>) {
            val envFile = temporaryDir.resolve("$name.env")
            envFile.writeText(fileContents.trimIndent())

            val actual = parseLocalEnvFile(envFile)
            check(actual == expected) {
                "Expected parsed env for $name to be $expected, but was $actual"
            }
        }

        check(parseLocalEnvFile(temporaryDir.resolve("missing.env")).isEmpty()) {
            "Missing .env files should parse as an empty environment."
        }

        assertParsedEnv(
            name = "common-syntax",
            fileContents = """
                # Google OAuth values for local development.
                SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID="local-client-id"
                SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET='local-client-secret'
                SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email
            """,
            expected = mapOf(
                "SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID" to "local-client-id",
                "SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET" to "local-client-secret",
                "SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE" to "openid,profile,email",
            ),
        )

        fun assertInvalidEnv(name: String, fileContents: String, expectedMessage: String) {
            val envFile = temporaryDir.resolve("$name.env")
            envFile.writeText(fileContents.trimIndent())

            val error = runCatching { parseLocalEnvFile(envFile) }.exceptionOrNull()
            check(error is GradleException && error.message?.contains(expectedMessage) == true) {
                "Expected $name to fail with '$expectedMessage', but got ${error?.message}"
            }
        }

        assertInvalidEnv(
            name = "export-syntax",
            fileContents = """
                export EXPORTED=value
            """,
            expectedMessage = "Unsupported dotenv key",
        )

        assertInvalidEnv(
            name = "malformed-line",
            fileContents = """
                MALFORMED
            """,
            expectedMessage = "expected KEY=value",
        )

        assertInvalidEnv(
            name = "missing-key",
            fileContents = """
                =missing-key
            """,
            expectedMessage = "expected KEY=value",
        )
    }
}

tasks.named<JavaExec>("bootRun") {
    workingDir = rootProject.projectDir
    doFirst {
        environment(parseLocalEnvFile(rootProject.file(".env.local")))
    }
}

tasks.named("test") {
    dependsOn(testLocalEnvParser)
}
