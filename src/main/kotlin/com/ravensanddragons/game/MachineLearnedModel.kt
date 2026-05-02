package com.ravensanddragons.game

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant

data class MachineLearnedModelMetadata(
    val botId: String,
    val displayName: String,
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val modelFormatVersion: Int,
    val trainedAt: Instant
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MachineLearnedArtifactRunSummary(
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
data class MachineLearnedEvolutionSummary(
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
data class MachineLearnedTrainingSummary(
    val expertBotId: String? = null,
    val positions: Int? = null,
    val selfPlayGames: Int? = null,
    val selfPlayBotIds: List<String>? = null,
    val gamesPerMatchup: Int? = null,
    val sampleStride: Int? = null,
    val maxSampledPositionsPerGame: Int? = null,
    val maxPliesPerGame: Int? = null,
    val openingRandomPlies: Int? = null,
    val run: MachineLearnedArtifactRunSummary? = null,
    val evolution: MachineLearnedEvolutionSummary? = null
)

data class MachineLearnedModel(
    val metadata: MachineLearnedModelMetadata,
    val modelType: String,
    val bias: Float,
    val weights: List<Float>,
    val trainingSummary: MachineLearnedTrainingSummary? = null
) {
    companion object {
        const val supportedModelFormatVersion = 1
    }
}
