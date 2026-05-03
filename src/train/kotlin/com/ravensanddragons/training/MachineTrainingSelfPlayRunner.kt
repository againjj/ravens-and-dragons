package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*



data class SelfPlayMatchup(
    val ruleConfigurationId: String,
    val dragonsBotId: String,
    val ravensBotId: String,
    val seed: Int,
    val maxPlies: Int,
    val openingRandomPlies: Int = 0
)

data class SelfPlayPosition(
    val plyIndex: Int,
    val snapshot: GameSnapshot,
    val legalMoves: List<LegalMove>
)

data class CompletedSelfPlayGame(
    val matchup: SelfPlayMatchup,
    val finalSnapshot: GameSnapshot,
    val sampledPositions: List<SelfPlayPosition>
)

open class MachineTrainedSelfPlayRunner(
    private val botRegistryFactory: (Int) -> BotRegistry = { seed -> BotRegistry(SeededRandomIndexSource(seed)) }
) {
    open fun play(matchup: SelfPlayMatchup): CompletedSelfPlayGame {
        require(matchup.openingRandomPlies >= 0) {
            "Machine-trained self-play openingRandomPlies must not be negative."
        }
        val summary = GameRules.getRuleConfigurationSummary(matchup.ruleConfigurationId)
        require(!summary.hasManualCapture) {
            "Machine-trained self-play does not support manual capture rulesets."
        }
        require(!summary.hasManualEndGame) {
            "Machine-trained self-play does not support manual end-game rulesets."
        }

        val botRegistry = botRegistryFactory(matchup.seed)
        val dragonsStrategy = botRegistry.requireSupportedDefinition(
            matchup.dragonsBotId,
            matchup.ruleConfigurationId
        ).strategy
        val ravensStrategy = botRegistry.requireSupportedDefinition(
            matchup.ravensBotId,
            matchup.ruleConfigurationId
        ).strategy

        val sampledPositions = mutableListOf<SelfPlayPosition>()
        val openingRandom = SeededRandomIndexSource(matchup.seed + 30_000)
        var snapshot = GameRules.startGame(matchup.ruleConfigurationId)

        repeat(matchup.maxPlies) { plyIndex ->
            if (snapshot.turns.lastOrNull()?.type == TurnType.gameOver) {
                return CompletedSelfPlayGame(matchup, snapshot, sampledPositions)
            }
            require(snapshot.phase == Phase.move) {
                "Machine-trained self-play only supports move-phase turns."
            }

            val legalMoves = GameRules.getLegalMoves(snapshot)
            if (legalMoves.isEmpty()) {
                snapshot = GameRules.endGame(snapshot, "Training stopped: no legal moves")
                return CompletedSelfPlayGame(matchup, snapshot, sampledPositions)
            }

            val selectedMove = if (plyIndex < matchup.openingRandomPlies) {
                legalMoves[openingRandom.nextInt(legalMoves.size)]
            } else {
                val strategy = when (snapshot.activeSide) {
                    Side.dragons -> dragonsStrategy
                    Side.ravens -> ravensStrategy
                }
                strategy.chooseMove(snapshot, legalMoves)
            }
            sampledPositions += SelfPlayPosition(
                plyIndex = plyIndex,
                snapshot = snapshot,
                legalMoves = legalMoves.toList()
            )
            snapshot = GameRules.movePiece(snapshot, selectedMove.origin, selectedMove.destination)
        }

        return CompletedSelfPlayGame(
            matchup = matchup,
            finalSnapshot = GameRules.endGame(snapshot, "Training draw by ply limit"),
            sampledPositions = sampledPositions
        )
    }
}
