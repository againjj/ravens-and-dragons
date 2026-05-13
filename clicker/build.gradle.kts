plugins {
    base
}

val testBackend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Clicker backend test suite."
    dependsOn(":clicker:clicker-backend:test")
}

val testFrontend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Clicker frontend test suite."
    dependsOn(":clicker:clicker-frontend:test")
}

tasks.register("test") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Clicker backend and frontend test suites."
    dependsOn(testBackend, testFrontend)
}

tasks.named("check") {
    dependsOn("test")
}
