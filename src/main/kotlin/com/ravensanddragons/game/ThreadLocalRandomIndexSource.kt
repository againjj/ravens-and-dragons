package com.ravensanddragons.game

import org.springframework.stereotype.Component
import java.util.concurrent.ThreadLocalRandom

@Component
class ThreadLocalRandomIndexSource : RandomIndexSource {
    override fun nextInt(bound: Int): Int = ThreadLocalRandom.current().nextInt(bound)
}
