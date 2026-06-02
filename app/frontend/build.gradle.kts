extra["frontendDisplayName"] = "app"
extra["frontendBuildDependencies"] = listOf(
    ":platform:frontend:buildFrontend",
    ":tic-tac-toe:frontend:npmInstall",
    ":gin-rummy:frontend:npmInstall",
    ":lunar-base:frontend:npmInstall",
    ":ravens-and-dragons:frontend:npmInstall"
)
extra["frontendSourceInputs"] = listOf(
    "../../platform/frontend/src/main/frontend",
    "../../tic-tac-toe/frontend/src/main/frontend",
    "../../gin-rummy/frontend/src/main/frontend",
    "../../lunar-base/frontend/src/main/frontend",
    "../../ravens-and-dragons/frontend/src/main/frontend"
)

apply(plugin = "ravens.frontend-project")
