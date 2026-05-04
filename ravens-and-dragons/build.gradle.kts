plugins {
    base
}

val testBackend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Ravens and Dragons backend test suite."
    dependsOn(":ravens-and-dragons:ravens-and-dragons-backend:test")
}

val testFrontend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Ravens and Dragons frontend test suite."
    dependsOn(":ravens-and-dragons:ravens-and-dragons-frontend:test")
}

tasks.register("test") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Ravens and Dragons backend and frontend test suites."
    dependsOn(testBackend, testFrontend)
}

tasks.named("check") {
    dependsOn("test")
}
