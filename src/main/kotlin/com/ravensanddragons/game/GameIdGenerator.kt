package com.ravensanddragons.game

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
