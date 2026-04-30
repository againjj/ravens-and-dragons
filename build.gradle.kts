import com.github.gradle.node.npm.task.NpmTask
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import org.springframework.boot.gradle.tasks.bundling.BootJar

plugins {
    id("com.github.node-gradle.node") version "7.0.2"
    id("org.springframework.boot") version "3.3.4"
    id("io.spring.dependency-management") version "1.1.6"
    kotlin("jvm") version "2.1.21"
    kotlin("plugin.spring") version "2.1.21"
}

group = "com.ravensanddragons"
version = "0.0.1-SNAPSHOT"

extra["flyway.version"] = "10.22.0"

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

val trainSourceSet = sourceSets.create("train") {
    java.srcDir("src/train/kotlin")
    resources.srcDir("src/train/resources")
    compileClasspath += sourceSets.main.get().output
    runtimeClasspath += output + compileClasspath
}

configurations.named(trainSourceSet.implementationConfigurationName) {
    extendsFrom(configurations.implementation.get())
}

configurations.named(trainSourceSet.runtimeOnlyConfigurationName) {
    extendsFrom(configurations.runtimeOnly.get())
}

sourceSets.named("test") {
    compileClasspath += trainSourceSet.output
    runtimeClasspath += trainSourceSet.output
}

node {
    download.set(true)
    version.set("22.12.0")
    npmVersion.set("10.9.0")
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("com.h2database:h2")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
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

tasks.withType<BootJar>().configureEach {
    archiveFileName.set("ravens-and-dragons.jar")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    javaLauncher.set(java21Launcher)
    filter {
        excludeTestsMatching("com.ravensanddragons.game.BotMatchHarnessTest")
    }
    doFirst {
        val frontendTestTask = testFrontend.get()
        if (filter.includePatterns.isEmpty() && !gradle.taskGraph.hasTask(frontendTestTask)) {
            buildFrontend.get().exec()
            frontendTestTask.exec()
        }
    }

    val botMatchHarnessGamesPerMatchup = System.getProperty("botMatchHarnessGamesPerMatchup")
    if (botMatchHarnessGamesPerMatchup != null) {
        systemProperty("botMatchHarnessGamesPerMatchup", botMatchHarnessGamesPerMatchup)
    }
}

val botMatchHarnessTest by tasks.registering(Test::class) {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the bot-vs-bot soak harness."
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform()
    javaLauncher.set(java21Launcher)
    filter {
        includeTestsMatching("com.ravensanddragons.game.BotMatchHarnessTest")
    }

    val botMatchHarnessGamesPerMatchup = System.getProperty("botMatchHarnessGamesPerMatchup")
    if (botMatchHarnessGamesPerMatchup != null) {
        systemProperty("botMatchHarnessGamesPerMatchup", botMatchHarnessGamesPerMatchup)
    }
}

val runMachineLearnedTraining by tasks.registering(JavaExec::class) {
    group = LifecycleBasePlugin.BUILD_GROUP
    description = "Generates an offline machine-learned dataset and artifact."
    classpath = trainSourceSet.runtimeClasspath
    mainClass.set("com.ravensanddragons.training.MachineLearnedTrainingCliKt")
    javaLauncher.set(java21Launcher)

    if (project.hasProperty("trainingArgs")) {
        args(
            (project.property("trainingArgs") as String)
                .split(Regex("\\s+"))
                .filter(String::isNotBlank)
        )
    }
}

val generatedFrontendDir = layout.buildDirectory.dir("generated/frontend")
val generatedFrontendTestDir = layout.buildDirectory.dir("generated/frontend-test")

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
    outputs.dir(generatedFrontendTestDir)
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

tasks.named("check") {
    dependsOn(testFrontend)
}

tasks.processResources {
    dependsOn(buildFrontend)
    from(generatedFrontendDir) {
        into("static")
    }
}
