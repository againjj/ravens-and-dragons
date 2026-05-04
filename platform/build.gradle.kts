import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    `java-library`
    kotlin("jvm")
    kotlin("plugin.spring")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

kotlin {
    jvmToolchain(21)
}

val java21Launcher = javaToolchains.launcherFor {
    languageVersion = JavaLanguageVersion.of(21)
}

tasks.withType<KotlinCompile> {
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

dependencies {
    api("org.springframework.boot:spring-boot-starter-web:3.3.4")
    api("org.springframework.boot:spring-boot-starter-jdbc:3.3.4")
    api("org.springframework.boot:spring-boot-starter-security:3.3.4")
    api("org.springframework.boot:spring-boot-starter-oauth2-client:3.3.4")
    api("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.2")
    api("org.jetbrains.kotlin:kotlin-reflect")

    testImplementation("org.springframework.boot:spring-boot-starter-test:3.3.4")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    javaLauncher.set(java21Launcher)
}
