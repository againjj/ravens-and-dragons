package com.ravensanddragons.game

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.web.*


import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OriginalStyleBotSearchTest {

    @Test
    fun `fast original-style search legal move generation matches canonical rules`() {
        representativeSnapshots().forEach { snapshot ->
            assertTrue(OriginalStyleBotSearch.supports(snapshot))
            assertEquals(GameRules.getLegalMoves(snapshot), OriginalStyleBotSearch.getLegalMoves(snapshot))
            assertEquals(GameRules.countLegalMoves(snapshot), OriginalStyleBotSearch.countLegalMoves(snapshot))
        }
    }

    @Test
    fun `fast original-style search move application matches canonical rules for representative legal moves`() {
        representativeSnapshots().forEach { snapshot ->
            GameRules.getLegalMoves(snapshot)
                .take(8)
                .forEach { move ->
                    assertEquals(
                        GameRules.movePiece(snapshot, move.origin, move.destination),
                        OriginalStyleBotSearch.applyMove(snapshot, move)
                    )
                }
        }
    }

    private fun representativeSnapshots(): List<GameSnapshot> = listOf(
        GameRules.startGame("original-game"),
        GameRules.startGame("sherwood-rules"),
        GameRules.startGame("square-one"),
        GameRules.startGame("sherwood-x-9"),
        GameRules.startGame("square-one-x-9"),
        sherwoodRegressionPosition()
    )

    private fun sherwoodRegressionPosition(): GameSnapshot =
        GameRules.startGame("sherwood-rules")
            .let { GameRules.movePiece(it, "b4", "b3") }
            .let { GameRules.movePiece(it, "c4", "c5") }
            .let { GameRules.movePiece(it, "d2", "c2") }
            .let { GameRules.movePiece(it, "d3", "c3") }
}
