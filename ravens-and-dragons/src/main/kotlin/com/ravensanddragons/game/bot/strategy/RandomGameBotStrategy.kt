package com.ravensanddragons.game.bot.strategy

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


class RandomGameBotStrategy(
    private val randomIndexSource: RandomIndexSource
) : GameBotStrategy {
    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Random bot requires at least one legal move." }
        return legalMoves[randomIndexSource.nextInt(legalMoves.size)]
    }
}
