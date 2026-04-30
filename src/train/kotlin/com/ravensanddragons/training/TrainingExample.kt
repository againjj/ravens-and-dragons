package com.ravensanddragons.training

import com.ravensanddragons.game.LegalMove
import com.ravensanddragons.game.Side
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

data class MachineLearnedDataset(
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val generatedAt: Instant,
    val expertBotId: String,
    val selfPlayBotIds: List<String>,
    val selfPlayGames: Int,
    val examples: List<TrainingExample>
)
