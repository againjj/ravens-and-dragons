package com.ravensanddragons.game.rules

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*


internal object GameSnapshotFactory {
    fun createInitialSnapshot(
        ruleConfigurationId: String = GameRules.freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = GameRules.defaultBoardSize,
        initialBoard: Map<String, Piece>? = null
    ): GameSnapshot = createBaseSnapshot(ruleConfigurationId, Phase.none, selectedStartingSide, selectedBoardSize, initialBoard)

    fun createIdleSnapshot(
        ruleConfigurationId: String,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = GameRules.defaultBoardSize
    ): GameSnapshot =
        createBaseSnapshot(ruleConfigurationId, Phase.none, selectedStartingSide, selectedBoardSize)

    fun startGame(
        ruleConfigurationId: String = GameRules.freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = GameRules.defaultBoardSize,
        initialBoard: Map<String, Piece>? = null
    ): GameSnapshot {
        val initialSnapshot = createBaseSnapshot(
            ruleConfigurationId,
            Phase.move,
            selectedStartingSide,
            selectedBoardSize,
            initialBoard
        )
        return initializePositionHistory(initialSnapshot)
    }

    fun initializePositionHistory(snapshot: GameSnapshot): GameSnapshot {
        val configuration = RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId)
        val positionKey = configuration.ruleSet.positionKey(snapshot)
        return if (positionKey == null) {
            snapshot.copy(positionKeys = emptyList())
        } else {
            snapshot.copy(positionKeys = listOf(positionKey))
        }
    }

    fun resolveStartingSide(ruleConfigurationId: String, selectedStartingSide: Side): Side {
        val configuration = RuleCatalog.getRuleConfiguration(ruleConfigurationId)
        return if (ruleConfigurationId == GameRules.freePlayRuleConfigurationId) {
            selectedStartingSide
        } else {
            configuration.startingSide
        }
    }

    private fun createBaseSnapshot(
        ruleConfigurationId: String,
        phase: Phase,
        selectedStartingSide: Side,
        selectedBoardSize: Int,
        initialBoard: Map<String, Piece>? = null
    ): GameSnapshot {
        val configuration = RuleCatalog.getRuleConfiguration(ruleConfigurationId)
        GameRules.validateBoardSize(selectedBoardSize)
        val boardSize = if (ruleConfigurationId == GameRules.freePlayRuleConfigurationId) selectedBoardSize else configuration.boardSize
        val specialSquare = if (ruleConfigurationId == GameRules.freePlayRuleConfigurationId) {
            BoardCoordinates.centerSquare(boardSize)
        } else {
            configuration.specialSquare
        }
        val board = if (ruleConfigurationId == GameRules.freePlayRuleConfigurationId) {
            LinkedHashMap(initialBoard ?: emptyMap())
        } else {
            LinkedHashMap(configuration.presetBoard)
        }
        return GameSnapshot(
            board = board,
            boardSize = boardSize,
            specialSquare = specialSquare,
            phase = phase,
            activeSide = resolveStartingSide(ruleConfigurationId, selectedStartingSide),
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = configuration.summary.id
        )
    }
}
