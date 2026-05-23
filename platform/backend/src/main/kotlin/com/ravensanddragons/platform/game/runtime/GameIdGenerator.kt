package com.ravensanddragons.platform.game.runtime

import java.security.SecureRandom

object GameIdGenerator {
    private val random = SecureRandom()
    private val alphabet = "23456789CFGHJMPQRVWX".toCharArray()

    fun nextId(length: Int = 7): String =
        (1..length)
            .map { alphabet[random.nextInt(alphabet.size)] }
            .joinToString("")
}
