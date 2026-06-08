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

dependencies {
    implementation(project(":platform:backend"))
    implementation("org.jetbrains.kotlin:kotlin-scripting-common:2.1.21")
    implementation("org.jetbrains.kotlin:kotlin-scripting-jvm:2.1.21")
    implementation("org.jetbrains.kotlin:kotlin-scripting-compiler-embeddable:2.1.21")
    implementation("org.jetbrains.kotlin:kotlin-scripting-jvm-host:2.1.21")

    testImplementation("org.springframework.boot:spring-boot-starter-test:3.3.4")
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

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    javaLauncher.set(java21Launcher)
}
