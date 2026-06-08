package com.ravensanddragons.lunarbase.cards

import kotlin.script.experimental.api.ResultValue
import kotlin.script.experimental.api.ScriptCompilationConfiguration
import kotlin.script.experimental.api.ScriptEvaluationConfiguration
import kotlin.script.experimental.api.defaultImports
import kotlin.script.experimental.api.valueOrThrow
import kotlin.script.experimental.host.toScriptSource
import kotlin.script.experimental.jvm.dependenciesFromCurrentContext
import kotlin.script.experimental.jvm.jvm
import kotlin.script.experimental.jvmhost.BasicJvmScriptingHost

object LunarBaseStandardDeck {
    val definition: LunarBaseDeckDefinition by lazy { loadStandardDeckScript() }

    private fun loadStandardDeckScript(): LunarBaseDeckDefinition {
        val scriptUrl = requireNotNull(javaClass.classLoader.getResource("card-sets/standard-cards.kts")) {
            "Missing Lunar Base standard-cards.kts resource."
        }
        val result = BasicJvmScriptingHost().eval(
            script = scriptUrl.readText().toScriptSource("standard-cards.kts"),
            compilationConfiguration = ScriptCompilationConfiguration {
                defaultImports("com.ravensanddragons.lunarbase.cards.*")
                jvm {
                    dependenciesFromCurrentContext(wholeClasspath = true)
                }
            },
            evaluationConfiguration = ScriptEvaluationConfiguration()
        )
        val evaluation = result.valueOrThrow()
        val returnValue = evaluation.returnValue
        require(returnValue is ResultValue.Value) {
            "Expected standard-cards.kts to return a deck, but got ${returnValue::class.simpleName}."
        }
        return returnValue.value as? LunarBaseDeckDefinition
            ?: error("Expected standard-cards.kts to return ${LunarBaseDeckDefinition::class.simpleName}.")
    }
}
