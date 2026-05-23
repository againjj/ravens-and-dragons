import com.github.gradle.node.NodeExtension
import com.github.gradle.node.npm.task.NpmTask
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.language.base.plugins.LifecycleBasePlugin
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.register

class FrontendProjectConventionPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        project.pluginManager.apply("base")
        project.pluginManager.apply("com.github.node-gradle.node")

        project.extensions.configure<NodeExtension> {
            download.set(true)
            version.set("22.12.0")
            npmVersion.set("10.9.0")
        }

        val extra = project.extensions.extraProperties
        val frontendDisplayName = extra["frontendDisplayName"] as String
        val frontendBuildDependencies = extra.stringList("frontendBuildDependencies")
        val frontendSourceInputs = extra.stringList("frontendSourceInputs")
        val npmInstall = project.tasks.named("npmInstall")
        val generatedFrontendDir = project.layout.buildDirectory.dir("generated/frontend")
        val generatedFrontendTestDir = project.layout.buildDirectory.dir("generated/frontend-test")

        val buildFrontend = project.tasks.register<NpmTask>("buildFrontend") {
            dependsOn(npmInstall)
            frontendBuildDependencies.forEach { dependsOn(it) }
            npmCommand.set(listOf("run", "build"))

            inputs.files(
                project.fileTree("src/main/frontend"),
                project.file("package.json"),
                project.file("tsconfig.json")
            )
            frontendSourceInputs.forEach { inputs.files(project.fileTree(it)) }
            if (project.file("vite.config.ts").isFile) {
                inputs.file(project.file("vite.config.ts"))
            }
            outputs.dir(generatedFrontendDir)
            outputs.dir(generatedFrontendTestDir)
            outputs.dir(project.file("dist"))
        }

        project.tasks.register<NpmTask>("test") {
            group = LifecycleBasePlugin.VERIFICATION_GROUP
            description = "Runs the $frontendDisplayName frontend test suite."
            dependsOn(npmInstall, buildFrontend)
            npmCommand.set(listOf("run", "test"))

            inputs.files(
                project.fileTree("src/main/frontend"),
                project.fileTree("src/test/frontend"),
                project.file("package.json"),
                project.file("tsconfig.json")
            )
            frontendSourceInputs.forEach { inputs.files(project.fileTree(it)) }
            if (project.file("vite.config.ts").isFile) {
                inputs.file(project.file("vite.config.ts"))
            }
        }

        project.tasks.named("check") {
            dependsOn("test")
        }
    }

    private fun org.gradle.api.plugins.ExtraPropertiesExtension.stringList(name: String): List<String> {
        val value = properties[name] ?: return emptyList()
        return (value as Iterable<*>).map { it as String }
    }
}
