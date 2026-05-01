package com.ravensanddragons.training
import com.ravensanddragons.game.GameRules
import com.ravensanddragons.game.GameBotStrategy
import com.ravensanddragons.game.GameSnapshot
import com.ravensanddragons.game.LegalMove
import com.ravensanddragons.game.MachineLearnedFeatureEncoder
import com.ravensanddragons.game.MachineLearnedModelLoader
import com.ravensanddragons.game.MachineLearnedMoveScorer
import com.ravensanddragons.game.Phase
import com.ravensanddragons.game.Piece
import com.ravensanddragons.game.Side
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.io.path.readText

class MachineLearnedTrainingPipelineTest {
    private val objectMapper = trainingObjectMapper()

    @Test
    fun `feature encoder keeps deterministic feature ordering`() {
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

        assertEquals(
            listOf(
                "active-side-dragons",
                "moved-piece-gold",
                "moved-piece-dragon",
                "moved-piece-raven",
                "origin-center-adjacent",
                "origin-edge",
                "origin-corner-adjacent",
                "destination-center-adjacent",
                "destination-edge",
                "destination-corner-adjacent",
                "captured-opponent-count",
                "move-wins-immediately",
                "gold-corner-distance-delta",
                "raven-pressure-delta",
                "after-gold-corner-distance",
                "after-nearest-raven-distance-to-gold",
                "after-ravens-adjacent-to-gold",
                "after-dragons-mobility",
                "after-ravens-mobility",
                "after-piece-count-difference",
                "after-dragons-piece-count",
                "after-ravens-piece-count",
                "after-gold-movable",
                "after-opponent-immediate-win",
                "after-active-side-legal-move-delta",
                "after-position-repeat-risk",
                "after-evaluation-for-active-side"
            ),
            MachineLearnedFeatureEncoder.featureNames
        )
        val features = MachineLearnedFeatureEncoder.encode(
            snapshot,
            LegalMove("a2", "a1"),
            GameRules.movePiece(snapshot, "a2", "a1")
        )

        assertEquals(MachineLearnedFeatureEncoder.featureCount, features.size)
        assertFeatureEquals("active-side-dragons", 1f, features)
        assertFeatureEquals("moved-piece-gold", 1f, features)
        assertFeatureEquals("origin-edge", 1f, features)
        assertFeatureEquals("origin-corner-adjacent", 1f, features)
        assertFeatureEquals("destination-edge", 1f, features)
        assertFeatureEquals("move-wins-immediately", 1f, features)
        assertFeatureEquals("gold-corner-distance-delta", 1f, features)
        assertFeatureEquals("raven-pressure-delta", -1f, features)
        assertFeatureEquals("after-gold-corner-distance", 0f, features)
        assertFeatureEquals("after-nearest-raven-distance-to-gold", 12f, features)
        assertFeatureEquals("after-ravens-adjacent-to-gold", 0f, features)
        assertFeatureEquals("after-piece-count-difference", 1f, features)
        assertFeatureEquals("after-dragons-piece-count", 2f, features)
        assertFeatureEquals("after-ravens-piece-count", 1f, features)
        assertFeatureEquals("after-evaluation-for-active-side", 1_000_000f, features)
    }

    @Test
    fun `dataset generation stays scoped to one ruleset`() {
        val generator = MachineLearnedDatasetGenerator(
            selfPlayRunner = StubSelfPlayRunner(),
            clock = fixedClock(),
            expertStrategyFactory = { _, _ ->
                object : GameBotStrategy {
                    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove =
                        legalMoves.first()
                }
            }
        )

        val dataset = generator.generate(
            MachineLearnedDatasetGenerationRequest(
                ruleConfigurationId = "sherwood-rules",
                selfPlayBotIds = listOf("random", "simple"),
                gamesPerMatchup = 1,
                sampleStride = 3,
                maxSampledPositionsPerGame = 2,
                maxPliesPerGame = 24,
                initialSeed = 7
            )
        )

        assertEquals("sherwood-rules", dataset.ruleConfigurationId)
        assertEquals(MachineLearnedFeatureEncoder.schemaVersion, dataset.featureSchemaVersion)
        assertEquals(4, dataset.selfPlayGames)
        assertTrue(dataset.examples.isNotEmpty())
        assertTrue(dataset.examples.all { it.ruleConfigurationId == "sherwood-rules" })
        assertTrue(dataset.examples.all { it.featureSchemaVersion == MachineLearnedFeatureEncoder.schemaVersion })
        assertTrue(dataset.examples.all { it.features.size == MachineLearnedFeatureEncoder.featureCount })
    }

    @Test
    fun `dataset codec round trips generated examples`() {
        val dataset = MachineLearnedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("random", "simple"),
            selfPlayGames = 2,
            examples = listOf(
                TrainingExample(
                    positionKey = "position-1",
                    ruleConfigurationId = "sherwood-rules",
                    featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
                    boardSize = 7,
                    activeSide = Side.ravens,
                    candidateMove = LegalMove("d7", "c7"),
                    expertMove = LegalMove("d7", "c7"),
                    features = featureVector("active-side-dragons" to -1f, "moved-piece-raven" to 1f),
                    label = 1f,
                    source = TrainingExampleSource.expertImitation
                )
            )
        )
        val codec = TrainingExampleCodec(objectMapper)
        val path = Files.createTempDirectory("michelle-dataset").resolve("dataset.json")

        codec.write(path, dataset)
        val loaded = codec.read(path)

        assertEquals(dataset, loaded)
    }

    @Test
    fun `artifact writer round trips with runtime loader`() {
        val dataset = MachineLearnedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("random", "simple"),
            selfPlayGames = 2,
            examples = listOf(
                example(
                    label = 1f,
                    features = featureVector(
                        "active-side-dragons" to 1f,
                        "moved-piece-gold" to 1f,
                        "move-wins-immediately" to 1f,
                        "after-evaluation-for-active-side" to 1_000_000f
                    )
                ),
                example(
                    label = 0f,
                    features = featureVector(
                        "active-side-dragons" to 1f,
                        "moved-piece-dragon" to 1f,
                        "after-gold-corner-distance" to 3f,
                        "after-evaluation-for-active-side" to 18f
                    )
                )
            )
        )
        val trainer = MachineLearnedTrainer(fixedClock())
        val writer = MachineLearnedArtifactWriter(objectMapper)
        val reader = MachineLearnedArtifactReader(objectMapper)
        val runtimeLoader = MachineLearnedModelLoader(objectMapper)
        val path = Files.createTempDirectory("michelle-artifact").resolve("sherwood-rules.json")

        val model = trainer.train(dataset)
        writer.write(path, model)
        val artifactJson = path.readText()

        val loadedByReader = reader.read(path)
        val runtimeLoaded = runtimeLoader.loadModels(
            listOf(
                object : org.springframework.core.io.ByteArrayResource(artifactJson.toByteArray()) {
                    override fun getFilename(): String = "sherwood-rules.json"
                }
            )
        ).single()

        assertTrue(artifactJson.contains("\"trainedAt\" : \"2026-04-30T12:00:00Z\""))
        assertEquals(model, loadedByReader)
        assertEquals(model, runtimeLoaded)
    }

    @Test
    fun `trainer rejects mixed ruleset datasets`() {
        val trainer = MachineLearnedTrainer(fixedClock())
        val dataset = MachineLearnedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("random"),
            selfPlayGames = 1,
            examples = listOf(
                example(label = 1f, features = List(MachineLearnedFeatureEncoder.featureCount) { 0f }),
                example(
                    label = 0f,
                    features = List(MachineLearnedFeatureEncoder.featureCount) { 1f },
                    ruleConfigurationId = "square-one"
                )
            )
        )

        val exception = assertThrows<IllegalArgumentException> {
            trainer.train(dataset)
        }

        assertEquals("Machine-learned training dataset mixed rule configurations.", exception.message)
    }

    @Test
    fun `trainer ranks the labeled move above alternatives for a position`() {
        val trainer = MachineLearnedTrainer(fixedClock())
        val dataset = MachineLearnedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("simple"),
            selfPlayGames = 1,
            examples = listOf(
                example(
                    positionKey = "position-a",
                    label = 1f,
                    features = featureVector(
                        "moved-piece-raven" to 1f,
                        "captured-opponent-count" to 1f,
                        "after-ravens-adjacent-to-gold" to 2f,
                        "after-evaluation-for-active-side" to 40f
                    )
                ),
                example(
                    positionKey = "position-a",
                    label = 0f,
                    features = featureVector(
                        "moved-piece-raven" to 1f,
                        "after-gold-corner-distance" to 6f,
                        "after-ravens-adjacent-to-gold" to -1f,
                        "after-evaluation-for-active-side" to -20f
                    )
                ),
                example(
                    positionKey = "position-b",
                    label = 1f,
                    features = featureVector(
                        "moved-piece-dragon" to 1f,
                        "captured-opponent-count" to 1f,
                        "after-gold-corner-distance" to 3f,
                        "after-piece-count-difference" to 1f,
                        "after-evaluation-for-active-side" to 25f
                    )
                ),
                example(
                    positionKey = "position-b",
                    label = 0f,
                    features = featureVector(
                        "moved-piece-dragon" to 1f,
                        "after-gold-corner-distance" to 7f,
                        "after-piece-count-difference" to -2f,
                        "after-evaluation-for-active-side" to -30f
                    )
                )
            )
        )

        val model = trainer.train(dataset)

        assertTrue(
            MachineLearnedMoveScorer.score(model, dataset.examples[0].features.toFloatArray()) >
                MachineLearnedMoveScorer.score(model, dataset.examples[1].features.toFloatArray())
        )
        assertTrue(
            MachineLearnedMoveScorer.score(model, dataset.examples[2].features.toFloatArray()) >
                MachineLearnedMoveScorer.score(model, dataset.examples[3].features.toFloatArray())
        )
    }

    private fun example(
        positionKey: String = "position-1",
        label: Float,
        features: List<Float>,
        ruleConfigurationId: String = "sherwood-rules"
    ): TrainingExample = TrainingExample(
        positionKey = positionKey,
        ruleConfigurationId = ruleConfigurationId,
        featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
        boardSize = 7,
        activeSide = Side.ravens,
        candidateMove = LegalMove("d7", "c7"),
        expertMove = LegalMove("d7", "c7"),
        features = features,
        label = label,
        source = TrainingExampleSource.expertImitation
    )

    private fun featureVector(vararg values: Pair<String, Float>): List<Float> {
        val features = MutableList(MachineLearnedFeatureEncoder.featureCount) { 0f }
        values.forEach { (name, value) ->
            val index = MachineLearnedFeatureEncoder.featureNames.indexOf(name)
            require(index >= 0) { "Unknown machine-learned feature: $name" }
            features[index] = value
        }
        return features
    }

    private fun assertFeatureEquals(featureName: String, expected: Float, features: FloatArray) {
        val index = MachineLearnedFeatureEncoder.featureNames.indexOf(featureName)
        require(index >= 0) { "Unknown machine-learned feature: $featureName" }
        assertEquals(expected, features[index])
    }

    private fun fixedClock(now: Instant = Instant.parse("2026-04-30T12:00:00Z")): Clock =
        Clock.fixed(now, ZoneOffset.UTC)

    private class StubSelfPlayRunner : MachineLearnedSelfPlayRunner(
        botRegistryFactory = { error("Stub runner should not create a bot registry.") }
    ) {
        override fun play(matchup: SelfPlayMatchup): CompletedSelfPlayGame {
            val opening = GameRules.startGame(matchup.ruleConfigurationId)
            val firstMoves = GameRules.getLegalMoves(opening)
            val afterFirstMove = GameRules.movePiece(opening, firstMoves.first().origin, firstMoves.first().destination)
            val secondMoves = GameRules.getLegalMoves(afterFirstMove)
            return CompletedSelfPlayGame(
                matchup = matchup,
                finalSnapshot = afterFirstMove,
                sampledPositions = listOf(
                    SelfPlayPosition(
                        plyIndex = 0,
                        snapshot = opening,
                        legalMoves = firstMoves
                    ),
                    SelfPlayPosition(
                        plyIndex = 3,
                        snapshot = afterFirstMove,
                        legalMoves = secondMoves
                    )
                )
            )
        }
    }
}
