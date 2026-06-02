extra["pairedProjectDisplayName"] = "Lunar Base"

apply(from = "../gradle/paired-project.gradle.kts")

subprojects {
    group = "com.ravensanddragons.lunarbase"
}
