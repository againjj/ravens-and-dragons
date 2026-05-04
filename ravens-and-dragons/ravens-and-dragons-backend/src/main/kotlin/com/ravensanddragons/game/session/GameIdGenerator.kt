package com.ravensanddragons.game.session

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*


import java.security.SecureRandom

object GameIdGenerator {
    private const val plusCodeAlphabet = "23456789CFGHJMPQRVWX"
    const val gameIdLength = 7
    private val random = SecureRandom()

    fun nextId(): String =
        buildString(gameIdLength) {
            repeat(gameIdLength) {
                append(plusCodeAlphabet[random.nextInt(plusCodeAlphabet.length)])
            }
        }

    fun isGeneratedGameId(gameId: String): Boolean =
        gameId.length == gameIdLength && gameId.all { it in plusCodeAlphabet }
}
