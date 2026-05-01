package com.ravensanddragons.game

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource

class MachineLearnedBotPhaseOneTest {

    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val loader = MachineLearnedModelLoader(objectMapper)

    @Test
    fun `loader reads a valid Sherwood artifact`() {
        val model = loader.loadModels(listOf(jsonResource("sherwood-rules.json", validArtifactJson()))).single()

        assertEquals(BotRegistry.machineLearnedBotId, model.metadata.botId)
        assertEquals("Michelle", model.metadata.displayName)
        assertEquals("sherwood-rules", model.metadata.ruleConfigurationId)
        assertEquals(MachineLearnedFeatureEncoder.featureCount, model.weights.size)
    }

    @Test
    fun `loader rejects unsupported artifact versions`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource(
                        "sherwood-rules.json",
                        validArtifactJson().replace("\"modelFormatVersion\": 1", "\"modelFormatVersion\": 2")
                    )
                )
            )
        }

        assertEquals("Unsupported machine-learned model format version: 2.", exception.message)
    }

    @Test
    fun `loader rejects unsupported model types`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource(
                        "sherwood-rules.json",
                        validArtifactJson().replace("\"modelType\": \"linear-move-ranker\"", "\"modelType\": \"tiny-mlp\"")
                    )
                )
            )
        }

        assertEquals("Unsupported machine-learned model type: tiny-mlp.", exception.message)
    }

    @Test
    fun `loader rejects the wrong bot id`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource(
                        "sherwood-rules.json",
                        validArtifactJson().replace("\"botId\": \"machine-learned\"", "\"botId\": \"not-michelle\"")
                    )
                )
            )
        }

        assertEquals("Machine-learned artifact botId must be machine-learned.", exception.message)
    }

    @Test
    fun `loader rejects duplicate ruleset artifacts`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource("one.json", validArtifactJson()),
                    jsonResource("two.json", validArtifactJson())
                )
            )
        }

        assertEquals("Duplicate machine-learned artifacts found for sherwood-rules.", exception.message)
    }

    @Test
    fun `Michelle appears only for rulesets with a loaded artifact`() {
        val registry = registryWithMichelle()

        assertEquals(
            listOf(
                BotRegistry.randomBotId,
                BotRegistry.simpleBotId,
                BotRegistry.minimaxBotId,
                BotRegistry.deepMinimaxBotId,
                BotRegistry.machineLearnedBotId
            ),
            registry.availableBotsFor("sherwood-rules").map(BotSummary::id)
        )
        assertEquals(
            listOf(
                BotRegistry.randomBotId,
                BotRegistry.simpleBotId,
                BotRegistry.minimaxBotId,
                BotRegistry.deepMinimaxBotId
            ),
            registry.availableBotsFor("square-one").map(BotSummary::id)
        )
    }

    @Test
    fun `machine learned strategy returns a legal move`() {
        val strategy = registryWithMichelle().requireSupportedDefinition(
            BotRegistry.machineLearnedBotId,
            "sherwood-rules"
        ).strategy
        val snapshot = GameRules.startGame("sherwood-rules")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val selectedMove = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(selectedMove in legalMoves)
    }

    @Test
    fun `machine learned strategy prefers an immediate winning move`() {
        val strategy = registryWithMichelle().requireSupportedDefinition(
            BotRegistry.machineLearnedBotId,
            "sherwood-rules"
        ).strategy
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "a2" to Piece.gold,
                "d5" to Piece.dragon,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.dragons,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "sherwood-rules",
            positionKeys = listOf("initial")
        )
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val selectedMove = strategy.chooseMove(snapshot, legalMoves)

        assertEquals(LegalMove("a2", "a1"), selectedMove)
    }

    @Test
    fun `machine learned strategy refuses the wrong ruleset`() {
        val strategy = registryWithMichelle().requireDefinitionForTest(BotRegistry.machineLearnedBotId).strategy
        val snapshot = GameRules.startGame("square-one")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val exception = assertThrows(IllegalArgumentException::class.java) {
            strategy.chooseMove(snapshot, legalMoves)
        }

        assertEquals("Machine-learned bot does not support square-one.", exception.message)
    }

    private fun jsonResource(filename: String, content: String): ByteArrayResource =
        object : ByteArrayResource(content.toByteArray()) {
            override fun getFilename(): String = filename
        }

    private fun registryWithMichelle(): BotRegistry {
        val model = loader.loadModels(listOf(jsonResource("sherwood-rules.json", validArtifactJson()))).single()
        return BotRegistry(FixedRandomIndexSource(), MachineLearnedRegistry(listOf(model)))
    }

    private fun validArtifactJson(): String = """
        {
          "botId": "machine-learned",
          "displayName": "Michelle",
          "modelFormatVersion": 1,
          "featureSchemaVersion": ${MachineLearnedFeatureEncoder.schemaVersion},
          "ruleConfigurationId": "sherwood-rules",
          "trainedAt": "2026-04-30T00:00:00Z",
          "trainingSummary": {
            "expertBotId": "deep-minimax",
            "positions": 16,
            "selfPlayGames": 0
          },
          "modelType": "linear-move-ranker",
          "bias": 0.0,
          "weights": [${machineLearnedTestWeights().joinToString(", ")}]
        }
    """.trimIndent()

    private fun machineLearnedTestWeights(): List<Float> {
        val weights = MutableList(MachineLearnedFeatureEncoder.featureCount) { 0f }
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("moved-piece-gold")] = -0.2f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("moved-piece-dragon")] = 0.1f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("moved-piece-raven")] = 0.1f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("captured-opponent-count")] = 1.5f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("move-wins-immediately")] = 1000f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("after-gold-corner-distance")] = -0.4f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("raven-pressure-delta")] = -0.6f
        weights[MachineLearnedFeatureEncoder.featureNames.indexOf("after-evaluation-for-active-side")] = 0.002f
        return weights
    }

    private class FixedRandomIndexSource : RandomIndexSource {
        override fun nextInt(bound: Int): Int = 0
    }

    private fun BotRegistry.requireDefinitionForTest(botId: String): BotDefinition =
        requireSupportedDefinition(botId, "sherwood-rules")
}
