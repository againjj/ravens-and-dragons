package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import java.time.Instant

enum class TrainingExampleSource {
    expertImitation
}

data class TrainingExample(
    val positionKey: String,
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val boardSize: Int,
    val activeSide: Side,
    val candidateMove: LegalMove,
    val expertMove: LegalMove,
    val features: List<Float>,
    val label: Float,
    val source: TrainingExampleSource
)

data class MachineTrainedDataset(
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val generatedAt: Instant,
    val expertBotId: String,
    val selfPlayBotIds: List<String>,
    val selfPlayGames: Int,
    val examples: List<TrainingExample>
)
