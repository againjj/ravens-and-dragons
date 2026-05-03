package com.ravensanddragons.game.bot

import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import org.springframework.stereotype.Component
import java.util.concurrent.ThreadLocalRandom

@Component
class ThreadLocalRandomIndexSource : RandomIndexSource {
    override fun nextInt(bound: Int): Int = ThreadLocalRandom.current().nextInt(bound)
}
