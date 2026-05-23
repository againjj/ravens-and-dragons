extra["pairedProjectDisplayName"] = "Ravens and Dragons"

apply(from = "../gradle/paired-project.gradle.kts")

subprojects {
    group = "com.ravensanddragons.ravensanddragons"
}
