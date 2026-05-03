package com.ravensanddragons.game.bot.machine

import java.time.Instant

data class LegacySchemaFourMachineTrainedArtifactPayload(
    val botId: String,
    val displayName: String,
    val modelFormatVersion: Int,
    val featureSchemaVersion: Int,
    val ruleConfigurationId: String,
    val trainedAt: Instant,
    val trainingSummary: MachineTrainingSummary,
    val modelType: String,
    val bias: Float,
    val weights: List<Float>
)

object MachineTrainedSchemaMigration {
    private const val legacySchemaVersion = 4
    private const val legacyModelType = "linear-move-ranker"

    private val legacyFeatureNames = listOf(
        "moved-piece-gold",
        "captured-opponent-count",
        "move-wins-immediately",
        "mover-origin-center-adjacent",
        "mover-origin-edge",
        "mover-origin-corner-adjacent",
        "mover-destination-center-adjacent",
        "mover-destination-edge",
        "mover-destination-corner-adjacent",
        "gold-origin-center-adjacent",
        "gold-origin-edge",
        "gold-origin-corner-adjacent",
        "gold-destination-center-adjacent",
        "gold-destination-edge",
        "gold-destination-corner-adjacent",
        "gold-corner-distance-delta",
        "raven-pressure-delta",
        "after-opponent-immediate-win",
        "after-opponent-captures",
        "after-active-side-legal-move-delta",
        "after-evaluation-for-active-side",
        "after-gold-corner-distance",
        "after-nearest-raven-distance-to-gold",
        "after-ravens-adjacent-to-gold",
        "after-dragons-mobility",
        "after-ravens-mobility",
        "after-dragons-piece-count",
        "after-ravens-piece-count",
        "after-gold-movable",
        "after-position-repeat-risk"
    )

    private val equivalentAbsoluteFeatures = mapOf(
        "moved-piece-gold" to "moved-piece-gold",
        "captured-opponent-count" to "captured-opponent-count",
        "move-wins-immediately" to "move-wins-immediately",
        "after-opponent-immediate-win" to "after-opponent-immediate-win",
        "after-opponent-captures" to "after-opponent-capture-threat-count",
        "after-position-repeat-risk" to "after-position-repeat-risk"
    )

    private val equivalentRelativeFeatures = mapOf(
        "gold-corner-distance-delta" to "gold-corner-distance-delta",
        "raven-pressure-delta" to "raven-pressure-delta",
        "after-gold-corner-distance" to "after-gold-corner-distance",
        "after-nearest-raven-distance-to-gold" to "after-nearest-raven-distance-to-gold",
        "after-ravens-adjacent-to-gold" to "after-ravens-adjacent-to-gold"
    )

    fun migrateSchemaFourSeed(payload: LegacySchemaFourMachineTrainedArtifactPayload): MachineTrainedArtifactPayload {
        require(payload.featureSchemaVersion == legacySchemaVersion) {
            "Only schema 4 machine-trained artifacts can be migrated to schema ${MachineTrainedFeatureEncoder.schemaVersion}."
        }
        require(payload.modelType == legacyModelType) {
            "Only schema 4 linear move rankers can be migrated."
        }
        require(payload.weights.size == legacyFeatureNames.size) {
            "Schema 4 artifact weight count ${payload.weights.size} does not match expected count ${legacyFeatureNames.size}."
        }

        val dragonWeights = MutableList(MachineTrainedFeatureEncoder.featureCount) { 0f }
        val ravenWeights = MutableList(MachineTrainedFeatureEncoder.featureCount) { 0f }
        equivalentAbsoluteFeatures.forEach { (legacyName, newName) ->
            val weight = payload.weightFor(legacyName)
            dragonWeights[newIndex(newName)] = weight
            ravenWeights[newIndex(newName)] = weight
        }
        equivalentRelativeFeatures.forEach { (legacyName, newName) ->
            val weight = payload.weightFor(legacyName)
            dragonWeights[newIndex(newName)] = weight
            ravenWeights[newIndex(newName)] = -weight
        }
        mapMoverOpponentFeature(
            payload = payload,
            dragonWeights = dragonWeights,
            ravenWeights = ravenWeights,
            dragonLegacyName = "after-dragons-mobility",
            ravenLegacyName = "after-ravens-mobility",
            moverNewName = "after-mover-legal-move-count",
            opponentNewName = "after-opponent-legal-move-count"
        )
        mapMoverOpponentFeature(
            payload = payload,
            dragonWeights = dragonWeights,
            ravenWeights = ravenWeights,
            dragonLegacyName = "after-dragons-piece-count",
            ravenLegacyName = "after-ravens-piece-count",
            moverNewName = "after-mover-piece-count",
            opponentNewName = "after-opponent-piece-count"
        )

        return MachineTrainedArtifactPayload(
            botId = payload.botId,
            displayName = payload.displayName,
            modelFormatVersion = payload.modelFormatVersion,
            featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
            ruleConfigurationId = payload.ruleConfigurationId,
            trainedAt = payload.trainedAt,
            trainingSummary = payload.trainingSummary.copy(
                evolution = payload.trainingSummary.evolution ?: MachineTrainedEvolutionSummary(
                    promote = false,
                    promotionReason = "Migrated from schema 4 as a schema 5 seed; regenerate or evolve before promotion."
                )
            ),
            modelType = MachineTrainedMoveScorer.supportedModelType,
            bias = payload.bias,
            featureNames = MachineTrainedFeatureEncoder.featureNames,
            dragonWeights = dragonWeights,
            ravenWeights = ravenWeights
        )
    }

    private fun mapMoverOpponentFeature(
        payload: LegacySchemaFourMachineTrainedArtifactPayload,
        dragonWeights: MutableList<Float>,
        ravenWeights: MutableList<Float>,
        dragonLegacyName: String,
        ravenLegacyName: String,
        moverNewName: String,
        opponentNewName: String
    ) {
        val dragonWeight = payload.weightFor(dragonLegacyName)
        val ravenWeight = payload.weightFor(ravenLegacyName)
        dragonWeights[newIndex(moverNewName)] = dragonWeight
        dragonWeights[newIndex(opponentNewName)] = ravenWeight
        ravenWeights[newIndex(moverNewName)] = -ravenWeight
        ravenWeights[newIndex(opponentNewName)] = -dragonWeight
    }

    private fun LegacySchemaFourMachineTrainedArtifactPayload.weightFor(featureName: String): Float =
        weights[legacyFeatureNames.indexOf(featureName)]

    private fun newIndex(featureName: String): Int =
        MachineTrainedFeatureEncoder.featureNames.indexOf(featureName).also { index ->
            require(index >= 0) { "Unknown schema ${MachineTrainedFeatureEncoder.schemaVersion} feature: $featureName" }
        }
}
