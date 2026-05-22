plugins {
    base
}

val testBackend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Tic-Tac-Toe backend test suite."
    dependsOn(":tic-tac-toe:tic-tac-toe-backend:test")
}

val testFrontend by tasks.registering {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Tic-Tac-Toe frontend test suite."
    dependsOn(":tic-tac-toe:tic-tac-toe-frontend:test")
}

tasks.register("test") {
    group = LifecycleBasePlugin.VERIFICATION_GROUP
    description = "Runs the Tic-Tac-Toe backend and frontend test suites."
    dependsOn(testBackend, testFrontend)
}

tasks.named("check") {
    dependsOn("test")
}
