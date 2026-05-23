extra["pairedProjectDisplayName"] = "Gin Rummy"

apply(from = "../gradle/paired-project.gradle.kts")

subprojects {
    group = "com.ravensanddragons.ginrummy"
}
