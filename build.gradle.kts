plugins {
    base
    id("com.github.node-gradle.node") version "7.0.2" apply false
    id("org.springframework.boot") version "3.3.4" apply false
    id("io.spring.dependency-management") version "1.1.7" apply false
    kotlin("jvm") version "2.1.21" apply false
    kotlin("plugin.spring") version "2.1.21" apply false
}

allprojects {
    group = "com.ravensanddragons"
    version = "0.0.1-SNAPSHOT"

    repositories {
        mavenCentral()
    }
}

val copyAppBootJar by tasks.registering(Copy::class) {
    group = LifecycleBasePlugin.BUILD_GROUP
    description = "Copies the assembled app jar to the historical root build/libs location."
    dependsOn(":app:bootJar")
    from(project(":app").layout.buildDirectory.file("libs/ravens-and-dragons.jar"))
    into(layout.buildDirectory.dir("libs"))
}

tasks.named("assemble") {
    dependsOn(copyAppBootJar)
}

tasks.named("check") {
    dependsOn(":platform:check")
    dependsOn(":ravens-and-dragons:check")
    dependsOn(":ravens-and-dragons:testFrontend")
    dependsOn(":app:check")
}

tasks.register("test") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the default JVM test suites for all service subprojects."
    dependsOn(":platform:test")
    dependsOn(":ravens-and-dragons:test")
    dependsOn(":app:test")
}

tasks.register("testFrontend") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Ravens and Dragons frontend test suite."
    dependsOn(":ravens-and-dragons:testFrontend")
}

tasks.register("botMatchHarnessTest") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Ravens and Dragons bot-vs-bot soak harness."
    dependsOn(":ravens-and-dragons:botMatchHarnessTest")
}

tasks.register("runMachineTraining") {
    group = LifecycleBasePlugin.BUILD_GROUP
    description = "Runs the Ravens and Dragons offline machine-training pipeline."
    dependsOn(":ravens-and-dragons:runMachineTraining")
}

tasks.register("bootJar") {
    group = LifecycleBasePlugin.BUILD_GROUP
    description = "Assembles the runnable service jar."
    dependsOn(copyAppBootJar)
}

tasks.register("bootRun") {
    group = ApplicationPlugin.APPLICATION_GROUP
    description = "Runs the assembled Spring Boot app."
    dependsOn(":app:bootRun")
}
