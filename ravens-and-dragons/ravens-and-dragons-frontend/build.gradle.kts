import com.github.gradle.node.npm.task.NpmTask

plugins {
    base
    id("com.github.node-gradle.node")
}

node {
    download.set(true)
    version.set("22.12.0")
    npmVersion.set("10.9.0")
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

tasks.register<NpmTask>("test") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Ravens and Dragons frontend test suite."
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
    dependsOn("test")
}
