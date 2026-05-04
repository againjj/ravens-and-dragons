import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import org.springframework.boot.gradle.tasks.run.BootRun
import org.springframework.boot.gradle.tasks.bundling.BootJar

plugins {
    id("org.springframework.boot")
    id("io.spring.dependency-management")
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

dependencies {
    implementation(project(":platform"))
    implementation(project(":ravens-and-dragons:ravens-and-dragons-backend"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.flywaydb:flyway-core:10.22.0")
    runtimeOnly("org.flywaydb:flyway-database-postgresql:10.22.0")

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

tasks.withType<BootRun>().configureEach {
    workingDir = rootProject.projectDir
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    javaLauncher.set(java21Launcher)
}

tasks.withType<BootJar>().configureEach {
    archiveFileName.set("ravens-and-dragons.jar")
}
