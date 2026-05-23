extra["pairedProjectDisplayName"] = "app"

apply(from = "../gradle/paired-project.gradle.kts")

subprojects {
    group = "com.ravensanddragons.app"
}

tasks.register("bootJar") {
    group = LifecycleBasePlugin.BUILD_GROUP
    description = "Assembles the runnable service jar."
    dependsOn(":app:backend:bootJar")
}

tasks.register("bootRun") {
    group = ApplicationPlugin.APPLICATION_GROUP
    description = "Runs the assembled Spring Boot app."
    dependsOn(":app:backend:bootRun")
}
