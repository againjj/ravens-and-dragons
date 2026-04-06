import com.github.gradle.node.npm.task.NpmTask
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("com.github.node-gradle.node") version "7.0.2"
    id("org.springframework.boot") version "3.3.4"
    id("io.spring.dependency-management") version "1.1.6"
    kotlin("jvm") version "2.1.21"
    kotlin("plugin.spring") version "2.1.21"
}

group = "com.dragonsvsravens"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

kotlin {
    jvmToolchain(21)
}

repositories {
    mavenCentral()
}

node {
    download.set(true)
    version.set("22.12.0")
    npmVersion.set("10.9.0")
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
}

tasks.withType<KotlinCompile> {
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

val java21Launcher = javaToolchains.launcherFor {
    languageVersion = JavaLanguageVersion.of(21)
}

tasks.withType<JavaExec>().configureEach {
    javaLauncher.set(java21Launcher)
}

tasks.withType<Test>().configureEach {
    dependsOn(testFrontend)
    useJUnitPlatform()
    javaLauncher.set(java21Launcher)
}

val generatedFrontendDir = layout.buildDirectory.dir("generated/frontend")

val buildFrontend by tasks.registering(NpmTask::class) {
    dependsOn(tasks.npmInstall)
    npmCommand.set(listOf("run", "build"))

    inputs.files(
        fileTree("src/main/frontend"),
        file("package.json"),
        file("tsconfig.json"),
        file("vite.config.ts")
    )
    outputs.dir(generatedFrontendDir)
}

val testFrontend by tasks.registering(NpmTask::class) {
    dependsOn(tasks.npmInstall, buildFrontend)
    npmCommand.set(listOf("run", "test"))

    inputs.files(
        fileTree("src/main/frontend"),
        fileTree("src/test/frontend"),
        file("package.json"),
        file("tsconfig.json"),
        file("vite.config.ts")
    )
}

tasks.processResources {
    dependsOn(buildFrontend)
    from(generatedFrontendDir) {
        into("static")
    }
}
