package com.ravensanddragons.game.bot.machine

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant

data class MachineTrainedModelMetadata(
    val botId: String,
    val displayName: String,
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val modelFormatVersion: Int,
    val trainedAt: Instant
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MachineTrainedArtifactRunSummary(
    val runId: String? = null,
    val mode: String? = null,
    val commandLine: String? = null,
    val initialSeed: Int? = null,
    val workerCount: Int? = null,
    val outputDir: String? = null,
    val datasetPath: String? = null,
    val artifactPath: String? = null,
    val evolutionReportPath: String? = null
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MachineTrainedEvolutionSummary(
    val bestCandidateId: String? = null,
    val promote: Boolean? = null,
    val winRate: Double? = null,
    val lossRate: Double? = null,
    val candidateWins: Int? = null,
    val candidateLosses: Int? = null,
    val candidateDraws: Int? = null,
    val promotionReason: String? = null,
    val baselineBotIds: List<String>? = null,
    val seedArtifactPaths: List<String>? = null,
    val incumbentArtifactPath: String? = null
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MachineTrainingSummary(
    val expertBotId: String? = null,
    val positions: Int? = null,
    val selfPlayGames: Int? = null,
    val selfPlayBotIds: List<String>? = null,
    val gamesPerMatchup: Int? = null,
    val sampleStride: Int? = null,
    val maxSampledPositionsPerGame: Int? = null,
    val maxPliesPerGame: Int? = null,
    val openingRandomPlies: Int? = null,
    val run: MachineTrainedArtifactRunSummary? = null,
    val evolution: MachineTrainedEvolutionSummary? = null
)

data class MachineTrainedModel(
    val metadata: MachineTrainedModelMetadata,
    val modelType: String,
    val bias: Float,
    val dragonWeights: List<Float>,
    val ravenWeights: List<Float>,
    val trainingSummary: MachineTrainingSummary
) {
    companion object {
        const val supportedModelFormatVersion = 1
    }
}
