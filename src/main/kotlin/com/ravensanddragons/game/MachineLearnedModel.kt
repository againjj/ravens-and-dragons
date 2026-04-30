package com.ravensanddragons.game

import java.time.Instant

data class MachineLearnedModelMetadata(
    val botId: String,
    val displayName: String,
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val modelFormatVersion: Int,
    val trainedAt: Instant
)

data class MachineLearnedTrainingSummary(
    val expertBotId: String? = null,
    val positions: Int? = null,
    val selfPlayGames: Int? = null
)

data class MachineLearnedModel(
    val metadata: MachineLearnedModelMetadata,
    val modelType: String,
    val bias: Float,
    val weights: List<Float>,
    val trainingSummary: MachineLearnedTrainingSummary? = null
)
