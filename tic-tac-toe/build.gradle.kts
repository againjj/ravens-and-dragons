extra["pairedProjectDisplayName"] = "Tic-Tac-Toe"

apply(from = "../gradle/paired-project.gradle.kts")

subprojects {
    group = "com.ravensanddragons.tictactoe"
}
