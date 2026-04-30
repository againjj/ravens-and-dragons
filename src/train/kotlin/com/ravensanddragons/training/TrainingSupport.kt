package com.ravensanddragons.training

import com.ravensanddragons.game.RandomIndexSource

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
