package com.ravensanddragons.game

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.persistence.*
import com.ravensanddragons.game.rules.*
import com.ravensanddragons.game.session.*
import com.ravensanddragons.game.web.*


import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource

class MachineTrainedBotPhaseOneTest {

    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val loader = MachineTrainedModelLoader(objectMapper)

    @Test
    fun `loader reads a valid Sherwood artifact`() {
        val model = loader.loadModels(listOf(jsonResource("sherwood-rules.json", validArtifactJson()))).single()

        assertEquals(BotRegistry.machineTrainedBotId, model.metadata.botId)
        assertEquals("Michelle", model.metadata.displayName)
        assertEquals("sherwood-rules", model.metadata.ruleConfigurationId)
        assertEquals(MachineTrainedFeatureEncoder.featureCount, model.dragonWeights.size)
        assertEquals(MachineTrainedFeatureEncoder.featureCount, model.ravenWeights.size)
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

        assertEquals("Unsupported machine-trained model format version: 2.", exception.message)
    }

    @Test
    fun `loader rejects unsupported model types`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource(
                        "sherwood-rules.json",
                        validArtifactJson().replace("\"modelType\": \"side-specialized-linear-move-ranker\"", "\"modelType\": \"tiny-mlp\"")
                    )
                )
            )
        }

        assertEquals("Unsupported machine-trained model type: tiny-mlp.", exception.message)
    }

    @Test
    fun `loader rejects the wrong bot id`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource(
                        "sherwood-rules.json",
                        validArtifactJson().replace("\"botId\": \"machine-trained\"", "\"botId\": \"not-michelle\"")
                    )
                )
            )
        }

        assertEquals("Machine-trained artifact botId must be machine-trained.", exception.message)
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

        assertEquals("Duplicate machine-trained artifacts found for sherwood-rules.", exception.message)
    }

    @Test
    fun `loader rejects schema four artifacts after migration`() {
        val exception = assertThrows(Exception::class.java) {
            loader.loadModels(listOf(jsonResource("sherwood-rules.json", schemaFourArtifactJson())))
        }

        assertTrue(exception.message?.contains("featureNames") == true)
    }

    @Test
    fun `loader rejects wrong side weight length`() {
        val exception = assertThrows(IllegalArgumentException::class.java) {
            loader.loadModels(
                listOf(
                    jsonResource(
                        "sherwood-rules.json",
                        validArtifactJson().replace(
                            "\"ravenWeights\": [${machineTrainedTestWeights().joinToString(", ")}]",
                            "\"ravenWeights\": [0.0]"
                        )
                    )
                )
            )
        }

        assertEquals(
            "Machine-trained artifact raven weight count 1 does not match feature count ${MachineTrainedFeatureEncoder.featureCount}.",
            exception.message
        )
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
                BotRegistry.machineTrainedBotId
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
    fun `machine trained strategy returns a legal move`() {
        val strategy = registryWithMichelle().requireSupportedDefinition(
            BotRegistry.machineTrainedBotId,
            "sherwood-rules"
        ).strategy
        val snapshot = GameRules.startGame("sherwood-rules")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val selectedMove = strategy.chooseMove(snapshot, legalMoves)

        assertTrue(selectedMove in legalMoves)
    }

    @Test
    fun `machine trained strategy prefers an immediate winning move`() {
        val strategy = registryWithMichelle().requireSupportedDefinition(
            BotRegistry.machineTrainedBotId,
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
    fun `machine trained scorer uses the active side vector`() {
        val weights = MutableList(MachineTrainedFeatureEncoder.featureCount) { 0f }
        weights[MachineTrainedFeatureEncoder.featureNames.indexOf("moved-piece-gold")] = 1f
        val model = modelWithWeights(
            dragonWeights = weights,
            ravenWeights = weights.map { -it }
        )
        val features = FloatArray(MachineTrainedFeatureEncoder.featureCount)
        features[MachineTrainedFeatureEncoder.featureNames.indexOf("moved-piece-gold")] = 2f

        assertNotEquals(
            MachineTrainedMoveScorer.score(model, Side.dragons, features),
            MachineTrainedMoveScorer.score(model, Side.ravens, features)
        )
        assertEquals(2f, MachineTrainedMoveScorer.score(model, Side.dragons, features))
        assertEquals(-2f, MachineTrainedMoveScorer.score(model, Side.ravens, features))
    }

    @Test
    fun `machine trained strategy refuses the wrong ruleset`() {
        val strategy = registryWithMichelle().requireDefinitionForTest(BotRegistry.machineTrainedBotId).strategy
        val snapshot = GameRules.startGame("square-one")
        val legalMoves = GameRules.getLegalMoves(snapshot)

        val exception = assertThrows(IllegalArgumentException::class.java) {
            strategy.chooseMove(snapshot, legalMoves)
        }

        assertEquals("Machine-trained bot does not support square-one.", exception.message)
    }

    private fun jsonResource(filename: String, content: String): ByteArrayResource =
        object : ByteArrayResource(content.toByteArray()) {
            override fun getFilename(): String = filename
        }

    private fun registryWithMichelle(): BotRegistry {
        val model = loader.loadModels(listOf(jsonResource("sherwood-rules.json", validArtifactJson()))).single()
        return BotRegistry(FixedRandomIndexSource(), MachineTrainedRegistry(listOf(model)))
    }

    private fun validArtifactJson(): String = """
        {
          "botId": "machine-trained",
          "displayName": "Michelle",
          "modelFormatVersion": 1,
          "featureSchemaVersion": ${MachineTrainedFeatureEncoder.schemaVersion},
          "ruleConfigurationId": "sherwood-rules",
          "trainedAt": "2026-04-30T00:00:00Z",
          "trainingSummary": {
            "expertBotId": "deep-minimax",
            "positions": 16,
            "selfPlayGames": 0
          },
          "modelType": "side-specialized-linear-move-ranker",
          "bias": 0.0,
          "featureNames": [${MachineTrainedFeatureEncoder.featureNames.joinToString(", ") { "\"$it\"" }}],
          "dragonWeights": [${machineTrainedTestWeights().joinToString(", ")}],
          "ravenWeights": [${machineTrainedTestWeights().joinToString(", ")}]
        }
    """.trimIndent()

    private fun schemaFourArtifactJson(): String = """
        {
          "botId": "machine-trained",
          "displayName": "Michelle",
          "modelFormatVersion": 1,
          "featureSchemaVersion": 4,
          "ruleConfigurationId": "sherwood-rules",
          "trainedAt": "2026-04-30T00:00:00Z",
          "trainingSummary": {
            "expertBotId": "deep-minimax",
            "positions": 16,
            "selfPlayGames": 0
          },
          "modelType": "linear-move-ranker",
          "bias": 0.0,
          "weights": [${List(30) { 0f }.joinToString(", ")}]
        }
    """.trimIndent()

    private fun machineTrainedTestWeights(): List<Float> {
        val weights = MutableList(MachineTrainedFeatureEncoder.featureCount) { 0f }
        weights[MachineTrainedFeatureEncoder.featureNames.indexOf("moved-piece-gold")] = -0.2f
        weights[MachineTrainedFeatureEncoder.featureNames.indexOf("captured-opponent-count")] = 1.5f
        weights[MachineTrainedFeatureEncoder.featureNames.indexOf("move-wins-immediately")] = 1000f
        weights[MachineTrainedFeatureEncoder.featureNames.indexOf("after-gold-corner-distance")] = -0.4f
        weights[MachineTrainedFeatureEncoder.featureNames.indexOf("raven-pressure-delta")] = -0.6f
        return weights
    }

    private fun modelWithWeights(dragonWeights: List<Float>, ravenWeights: List<Float>): MachineTrainedModel =
        MachineTrainedModel(
            metadata = MachineTrainedModelMetadata(
                botId = MachineTrainedRegistry.botId,
                displayName = MachineTrainedRegistry.displayName,
                ruleConfigurationId = "sherwood-rules",
                featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
                modelFormatVersion = MachineTrainedModel.supportedModelFormatVersion,
                trainedAt = java.time.Instant.parse("2026-04-30T00:00:00Z")
            ),
            modelType = MachineTrainedMoveScorer.supportedModelType,
            bias = 0f,
            dragonWeights = dragonWeights,
            ravenWeights = ravenWeights,
            trainingSummary = MachineTrainingSummary(expertBotId = "test", positions = 1, selfPlayGames = 1)
        )

    private class FixedRandomIndexSource : RandomIndexSource {
        override fun nextInt(bound: Int): Int = 0
    }

    private fun BotRegistry.requireDefinitionForTest(botId: String): BotDefinition =
        requireSupportedDefinition(botId, "sherwood-rules")
}
