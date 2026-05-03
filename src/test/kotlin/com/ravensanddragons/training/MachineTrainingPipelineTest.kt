package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.io.path.readText

class MachineTrainingPipelineTest {
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
            ),
            MachineTrainedFeatureEncoder.featureNames
        )
        val features = MachineTrainedFeatureEncoder.encode(
            snapshot,
            LegalMove("a2", "a1"),
            GameRules.movePiece(snapshot, "a2", "a1")
        )

        assertEquals(MachineTrainedFeatureEncoder.featureCount, features.size)
        assertFeatureEquals("moved-piece-gold", 1f, features)
        assertFeatureEquals("move-wins-immediately", 1f, features)
        assertFeatureEquals("mover-origin-edge", 1f, features)
        assertFeatureEquals("mover-origin-corner-adjacent", 1f, features)
        assertFeatureEquals("mover-destination-edge", 1f, features)
        assertFeatureEquals("gold-origin-edge", 1f, features)
        assertFeatureEquals("gold-origin-corner-adjacent", 1f, features)
        assertFeatureEquals("gold-destination-edge", 1f, features)
        assertFeatureEquals("gold-corner-distance-delta", 1f, features)
        assertFeatureEquals("raven-pressure-delta", -1f, features)
        assertFeatureEquals("after-gold-corner-distance", 0f, features)
        assertFeatureEquals("after-nearest-raven-distance-to-gold", 12f, features)
        assertFeatureEquals("after-ravens-adjacent-to-gold", 0f, features)
        assertFeatureEquals("after-opponent-captures", 0f, features)
        assertFeatureEquals("after-dragons-piece-count", 2f, features)
        assertFeatureEquals("after-ravens-piece-count", 1f, features)
        assertFeatureEquals("after-evaluation-for-active-side", 1_000_000f, features)
    }

    @Test
    fun `feature encoder flips relative features for raven moves`() {
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "a2" to Piece.gold,
                "d5" to Piece.dragon,
                "g7" to Piece.raven
            ),
            boardSize = 7,
            specialSquare = "d4",
            phase = Phase.move,
            activeSide = Side.ravens,
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = "sherwood-rules",
            positionKeys = listOf("initial")
        )

        val features = MachineTrainedFeatureEncoder.encode(
            snapshot,
            LegalMove("g7", "b7"),
            GameRules.movePiece(snapshot, "g7", "b7")
        )

        assertFeatureEquals("mover-origin-edge", 1f, features)
        assertFeatureEquals("mover-destination-edge", 1f, features)
        assertFeatureEquals("gold-origin-edge", 0f, features)
        assertFeatureEquals("gold-corner-distance-delta", 0f, features)
        assertFeatureEquals("after-gold-corner-distance", -1f, features)
        assertFeatureEquals("after-dragons-piece-count", -2f, features)
        assertFeatureEquals("after-ravens-piece-count", -1f, features)
    }

    @Test
    fun `feature encoder counts pieces the opponent could capture next`() {
        val snapshot = GameSnapshot(
            board = linkedMapOf(
                "b2" to Piece.gold,
                "d5" to Piece.dragon,
                "d7" to Piece.raven
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

        val features = MachineTrainedFeatureEncoder.encode(
            snapshot,
            LegalMove("b2", "b1"),
            GameRules.movePiece(snapshot, "b2", "b1")
        )

        assertFeatureEquals("after-opponent-captures", 1f, features)
    }

    @Test
    fun `dataset generation stays scoped to one ruleset`() {
        val generator = MachineTrainedDatasetGenerator(
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
            MachineTrainedDatasetGenerationRequest(
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
        assertEquals(MachineTrainedFeatureEncoder.schemaVersion, dataset.featureSchemaVersion)
        assertEquals(4, dataset.selfPlayGames)
        assertTrue(dataset.examples.isNotEmpty())
        assertTrue(dataset.examples.all { it.ruleConfigurationId == "sherwood-rules" })
        assertTrue(dataset.examples.all { it.featureSchemaVersion == MachineTrainedFeatureEncoder.schemaVersion })
        assertTrue(dataset.examples.all { it.features.size == MachineTrainedFeatureEncoder.featureCount })
    }

    @Test
    fun `dataset generation reports completed task progress`() {
        val reports = mutableListOf<Pair<Int, Int>>()
        val generator = MachineTrainedDatasetGenerator(
            selfPlayRunner = StubSelfPlayRunner(),
            clock = fixedClock(),
            progressListener = TrainingProgressListener { completed, total ->
                reports += completed to total
            },
            expertStrategyFactory = { _, _ ->
                object : GameBotStrategy {
                    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove =
                        legalMoves.first()
                }
            }
        )

        generator.generate(
            MachineTrainedDatasetGenerationRequest(
                ruleConfigurationId = "sherwood-rules",
                selfPlayBotIds = listOf("random", "simple"),
                gamesPerMatchup = 1,
                sampleStride = 3,
                maxSampledPositionsPerGame = 2,
                maxPliesPerGame = 24,
                initialSeed = 7,
                workerCount = 1
            )
        )

        assertEquals(
            listOf(1 to 4, 2 to 4, 3 to 4, 4 to 4),
            reports
        )
    }

    @Test
    fun `dataset generation passes opening diversity into self play matchups`() {
        val runner = RecordingSelfPlayRunner()
        val generator = MachineTrainedDatasetGenerator(
            selfPlayRunner = runner,
            clock = fixedClock(),
            expertStrategyFactory = { _, _ ->
                object : GameBotStrategy {
                    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove =
                        legalMoves.first()
                }
            }
        )

        generator.generate(
            MachineTrainedDatasetGenerationRequest(
                ruleConfigurationId = "sherwood-rules",
                selfPlayBotIds = listOf("random"),
                gamesPerMatchup = 1,
                sampleStride = 1,
                maxSampledPositionsPerGame = 1,
                maxPliesPerGame = 24,
                openingRandomPlies = 3,
                initialSeed = 7,
                workerCount = 1
            )
        )

        assertEquals(listOf(3), runner.matchups.map(SelfPlayMatchup::openingRandomPlies))
    }

    @Test
    fun `dataset codec round trips generated examples`() {
        val dataset = MachineTrainedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("random", "simple"),
            selfPlayGames = 2,
            examples = listOf(
                TrainingExample(
                    positionKey = "position-1",
                    ruleConfigurationId = "sherwood-rules",
                    featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
                    boardSize = 7,
                    activeSide = Side.ravens,
                    candidateMove = LegalMove("d7", "c7"),
                    expertMove = LegalMove("d7", "c7"),
                    features = featureVector("after-gold-corner-distance" to -1f),
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
        val dataset = MachineTrainedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("random", "simple"),
            selfPlayGames = 2,
            examples = listOf(
                example(
                    label = 1f,
                    features = featureVector(
                        "moved-piece-gold" to 1f,
                        "move-wins-immediately" to 1f,
                        "after-evaluation-for-active-side" to 1_000_000f
                    )
                ),
                example(
                    label = 0f,
                    features = featureVector(
                        "after-gold-corner-distance" to 3f,
                        "after-evaluation-for-active-side" to 18f
                    )
                )
            )
        )
        val trainer = MachineTrainedTrainer(fixedClock())
        val writer = MachineTrainedArtifactWriter(objectMapper)
        val reader = MachineTrainedArtifactReader(objectMapper)
        val runtimeLoader = MachineTrainedModelLoader(objectMapper)
        val path = Files.createTempDirectory("michelle-artifact").resolve("sherwood-rules.json")

        val model = trainer.train(dataset).copy(
            trainingSummary = MachineTrainingSummary(
                expertBotId = "deep-minimax",
                positions = 1,
                selfPlayGames = 2,
                selfPlayBotIds = listOf("random", "simple"),
                gamesPerMatchup = 1,
                sampleStride = 2,
                maxSampledPositionsPerGame = 8,
                maxPliesPerGame = 300,
                openingRandomPlies = 2,
                run = MachineTrainedArtifactRunSummary(
                    runId = "sherwood-rules.train.20260430T120000Z",
                    mode = "train",
                    initialSeed = 7,
                    workerCount = 2,
                    outputDir = "build/machine-trained-candidate",
                    datasetPath = "build/machine-trained-candidate/sherwood-rules.train.20260430T120000Z.dataset.json",
                    artifactPath = "build/machine-trained-candidate/sherwood-rules.train.20260430T120000Z.generated.json"
                ),
                evolution = MachineTrainedEvolutionSummary(
                    bestCandidateId = "g1-c3",
                    promote = true,
                    winRate = 0.6,
                    lossRate = 0.2,
                    candidateWins = 3,
                    candidateLosses = 1,
                    candidateDraws = 1,
                    promotionReason = "Test promotion.",
                    baselineBotIds = listOf("minimax", "deep-minimax")
                )
            )
        )
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
        assertTrue(artifactJson.contains("\"runId\" : \"sherwood-rules.train.20260430T120000Z\""))
        assertTrue(artifactJson.contains("\"selfPlayBotIds\" : [ \"random\", \"simple\" ]"))
        assertTrue(artifactJson.contains("\"bestCandidateId\" : \"g1-c3\""))
        assertEquals(model, loadedByReader)
        assertEquals(model, runtimeLoaded)
    }

    @Test
    fun `trainer rejects mixed ruleset datasets`() {
        val trainer = MachineTrainedTrainer(fixedClock())
        val dataset = MachineTrainedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("random"),
            selfPlayGames = 1,
            examples = listOf(
                example(label = 1f, features = List(MachineTrainedFeatureEncoder.featureCount) { 0f }),
                example(
                    label = 0f,
                    features = List(MachineTrainedFeatureEncoder.featureCount) { 1f },
                    ruleConfigurationId = "square-one"
                )
            )
        )

        val exception = assertThrows<IllegalArgumentException> {
            trainer.train(dataset)
        }

        assertEquals("Machine training dataset mixed rule configurations.", exception.message)
    }

    @Test
    fun `trainer ranks the labeled move above alternatives for a position`() {
        val trainer = MachineTrainedTrainer(fixedClock())
        val dataset = MachineTrainedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("simple"),
            selfPlayGames = 1,
            examples = listOf(
                example(
                    positionKey = "position-a",
                    label = 1f,
                    features = featureVector(
                        "captured-opponent-count" to 1f,
                        "after-ravens-adjacent-to-gold" to 2f,
                        "after-evaluation-for-active-side" to 40f
                    )
                ),
                example(
                    positionKey = "position-a",
                    label = 0f,
                    features = featureVector(
                        "after-gold-corner-distance" to 6f,
                        "after-ravens-adjacent-to-gold" to -1f,
                        "after-evaluation-for-active-side" to -20f
                    )
                ),
                example(
                    positionKey = "position-b",
                    label = 1f,
                    features = featureVector(
                        "captured-opponent-count" to 1f,
                        "after-gold-corner-distance" to 3f,
                        "after-opponent-captures" to 1f,
                        "after-evaluation-for-active-side" to 25f
                    )
                ),
                example(
                    positionKey = "position-b",
                    label = 0f,
                    features = featureVector(
                        "after-gold-corner-distance" to 7f,
                        "after-opponent-captures" to 2f,
                        "after-evaluation-for-active-side" to -30f
                    )
                )
            )
        )

        val model = trainer.train(dataset)

        assertTrue(
            MachineTrainedMoveScorer.score(model, dataset.examples[0].features.toFloatArray()) >
                MachineTrainedMoveScorer.score(model, dataset.examples[1].features.toFloatArray())
        )
        assertTrue(
            MachineTrainedMoveScorer.score(model, dataset.examples[2].features.toFloatArray()) >
                MachineTrainedMoveScorer.score(model, dataset.examples[3].features.toFloatArray())
        )
    }

    @Test
    fun `trainer reports completed epoch progress`() {
        val reports = mutableListOf<Pair<Int, Int>>()
        val trainer = MachineTrainedTrainer(
            clock = fixedClock(),
            progressListener = TrainingProgressListener { completed, total ->
                reports += completed to total
            }
        )
        val dataset = MachineTrainedDataset(
            ruleConfigurationId = "sherwood-rules",
            featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
            generatedAt = Instant.parse("2026-04-30T00:00:00Z"),
            expertBotId = "deep-minimax",
            selfPlayBotIds = listOf("simple"),
            selfPlayGames = 1,
            examples = listOf(
                example(
                    label = 1f,
                    features = featureVector("after-evaluation-for-active-side" to 10f)
                ),
                example(
                    label = 0f,
                    features = featureVector("after-evaluation-for-active-side" to -10f)
                )
            )
        )

        trainer.train(dataset)

        assertEquals(
            (1..12).map { it to 12 },
            reports
        )
    }

    @Test
    fun `evolution loop runs candidate leagues and survivor comparison rankings`() {
        val progressReports = mutableListOf<Pair<Int, Int>>()
        val loop = MachineTrainedEvolutionLoop(
            clock = fixedClock(),
            progressListener = TrainingProgressListener { completed, total ->
                progressReports += completed to total
            }
        )

        val result = loop.run(
            MachineTrainedEvolutionRequest(
                ruleConfigurationId = "sherwood-rules",
                incumbentModel = model(
                    featureName = "after-evaluation-for-active-side",
                    weight = -1f
                ),
                seedModels = listOf(
                    model(
                        featureName = "after-evaluation-for-active-side",
                        weight = 1f
                    )
                ),
                populationSize = 3,
                survivorCount = 2,
                generations = 2,
                gamesPerPairing = 1,
                baselineBotIds = listOf("random"),
                maxPliesPerGame = 8,
                openingRandomPlies = 1,
                initialSeed = 11,
                mutationRate = 0.5,
                mutationScale = 0.1f,
                crossoverRate = 1.0,
                eliteCount = 1,
                survivorComparisonGamesPerPairing = 1,
                workerCount = 2,
                promotionThresholds = MachineTrainedEvolutionPromotionThresholds(
                    minimumWinRate = 0.0,
                    maximumLossRate = 1.0
                )
            )
        )
        val report = result.report

        assertEquals("sherwood-rules", report.ruleConfigurationId)
        assertEquals(2, report.generationSummaries.size)
        assertTrue(report.generationSummaries.all { summary -> summary.candidates.size == 3 })
        assertTrue(report.generationSummaries.all { summary -> summary.survivorIds.size == 2 })
        assertTrue(report.generationSummaries.all { summary -> summary.matches.all { it.openingRandomPlies == 1 } })
        assertTrue(report.generationSummaries.all { summary -> summary.matches.all { it.turnCount > 0 } })
        assertTrue(
            report.generationSummaries.all { summary ->
                summary.matches.all { match ->
                    match.dragonsType == MachineTrainedEvolutionParticipantType.candidate &&
                        match.ravensType == MachineTrainedEvolutionParticipantType.candidate
                }
            }
        )
        assertEquals(12, report.survivorComparisonMatches.size)
        assertEquals(
            2,
            report.survivorComparisonRankings.count {
                it.participantType == MachineTrainedEvolutionParticipantType.candidate
            }
        )
        assertEquals(
            1,
            report.survivorComparisonRankings.count {
                it.participantType == MachineTrainedEvolutionParticipantType.baseline
            }
        )
        assertEquals(
            1,
            report.survivorComparisonRankings.count {
                it.participantType == MachineTrainedEvolutionParticipantType.incumbent
            }
        )
        assertEquals(listOf(1, 2, 3, 4), report.survivorComparisonRankings.map(MachineTrainedEvolutionRanking::rank))
        assertEquals(
            report.survivorComparisonRankings.first {
                it.participantType == MachineTrainedEvolutionParticipantType.candidate
            }.participantId,
            report.bestCandidateId
        )
        assertEquals(report.generationSummaries.last().survivorIds, result.survivorModels.map { it.candidateId })
        assertEquals(MachineTrainedFeatureEncoder.featureCount, result.bestModel.weights.size)
        assertEquals((1..24).map { it to 24 }, progressReports)
    }

    @Test
    fun `decile progress line prints compact milestones`() {
        val output = StringBuilder()
        val progress = DecileProgressLine(output, "Generating dataset")

        progress.start()
        progress.update(completed = 1, total = 4)
        progress.update(completed = 2, total = 4)
        progress.update(completed = 3, total = 4)
        progress.update(completed = 4, total = 4)
        progress.finish()

        assertEquals(
            "Generating dataset:\n0%..10%..20%..30%..40%..50%..60%..70%..80%..90%..100%\n",
            output.toString()
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
        featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
        boardSize = 7,
        activeSide = Side.ravens,
        candidateMove = LegalMove("d7", "c7"),
        expertMove = LegalMove("d7", "c7"),
        features = features,
        label = label,
        source = TrainingExampleSource.expertImitation
    )

    private fun featureVector(vararg values: Pair<String, Float>): List<Float> {
        val features = MutableList(MachineTrainedFeatureEncoder.featureCount) { 0f }
        values.forEach { (name, value) ->
            val index = MachineTrainedFeatureEncoder.featureNames.indexOf(name)
            require(index >= 0) { "Unknown machine-trained feature: $name" }
            features[index] = value
        }
        return features
    }

    private fun model(featureName: String, weight: Float): MachineTrainedModel {
        val weights = MutableList(MachineTrainedFeatureEncoder.featureCount) { 0f }
        val index = MachineTrainedFeatureEncoder.featureNames.indexOf(featureName)
        require(index >= 0) { "Unknown machine-trained feature: $featureName" }
        weights[index] = weight
        return MachineTrainedModel(
            metadata = MachineTrainedModelMetadata(
                botId = MachineTrainedRegistry.botId,
                displayName = MachineTrainedRegistry.displayName,
                ruleConfigurationId = "sherwood-rules",
                featureSchemaVersion = MachineTrainedFeatureEncoder.schemaVersion,
                modelFormatVersion = MachineTrainedModel.supportedModelFormatVersion,
                trainedAt = Instant.parse("2026-04-30T12:00:00Z")
            ),
            modelType = MachineTrainedMoveScorer.supportedModelType,
            bias = 0f,
            weights = weights,
            trainingSummary = MachineTrainingSummary(
                expertBotId = "test",
                positions = 1,
                selfPlayGames = 1
            )
        )
    }

    private fun assertFeatureEquals(featureName: String, expected: Float, features: FloatArray) {
        val index = MachineTrainedFeatureEncoder.featureNames.indexOf(featureName)
        require(index >= 0) { "Unknown machine-trained feature: $featureName" }
        assertEquals(expected, features[index])
    }

    private fun fixedClock(now: Instant = Instant.parse("2026-04-30T12:00:00Z")): Clock =
        Clock.fixed(now, ZoneOffset.UTC)

    private open class StubSelfPlayRunner : MachineTrainedSelfPlayRunner(
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

    private class RecordingSelfPlayRunner : StubSelfPlayRunner() {
        val matchups = mutableListOf<SelfPlayMatchup>()

        override fun play(matchup: SelfPlayMatchup): CompletedSelfPlayGame {
            matchups += matchup
            return super.play(matchup)
        }
    }
}
