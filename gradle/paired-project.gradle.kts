apply(plugin = "base")

val pairedProjectDisplayName = extra["pairedProjectDisplayName"] as String
val backendTestPath = "$path:backend:test"
val frontendTestPath = "$path:frontend:test"

val testBackend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the $pairedProjectDisplayName backend test suite."
    dependsOn(backendTestPath)
}

val testFrontend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the $pairedProjectDisplayName frontend test suite."
    dependsOn(frontendTestPath)
}

tasks.register("test") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the $pairedProjectDisplayName backend and frontend test suites."
    dependsOn(testBackend, testFrontend)
}

tasks.named("check") {
    dependsOn("test")
}
