package com.ravensanddragons.training

import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.ravensanddragons.game.RandomIndexSource

internal fun defaultTrainingWorkerCount(): Int = Runtime.getRuntime().availableProcessors()

fun trainingObjectMapper() = jacksonObjectMapper()
    .findAndRegisterModules()
    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

internal class SeededRandomIndexSource(
    seed: Int
) : RandomIndexSource {
    private var state: Int = if (seed != 0) seed else 1

    override fun nextInt(bound: Int): Int {
        require(bound > 0) { "Bound must be positive." }
        state = (state * 1103515245 + 12345) and Int.MAX_VALUE
        return state % bound
    }
}
