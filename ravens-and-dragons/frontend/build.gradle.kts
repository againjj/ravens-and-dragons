extra["frontendDisplayName"] = "Ravens and Dragons"
extra["frontendBuildDependencies"] = listOf(":platform:frontend:buildFrontend")
extra["frontendSourceInputs"] = listOf("../../platform/frontend/src/main/frontend")

apply(plugin = "ravens.frontend-project")
