package com.ravensanddragons.training

import com.fasterxml.jackson.databind.ObjectMapper
import com.ravensanddragons.game.BotRegistry
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import kotlin.io.path.absolute
import kotlin.io.path.absolutePathString

fun main(args: Array<String>) {
    val options = TrainingCliOptions.parse(args.toList())
    val objectMapper = trainingObjectMapper()
    val clock = Clock.systemUTC()
    val datasetProgress = DecileProgressLine(System.out, "Generating dataset")
    val trainingProgress = DecileProgressLine(System.out, "Training model")

    if (options.mode == TrainingCliMode.evolve) {
        runEvolution(options, objectMapper, clock)
        return
    }

    val datasetGenerator = MachineLearnedDatasetGenerator(
        clock = clock,
        progressListener = TrainingProgressListener { completed, total ->
            datasetProgress.update(completed, total)
        }
    )
    val datasetCodec = TrainingExampleCodec(objectMapper)
    val trainer = MachineLearnedTrainer(
        clock = clock,
        progressListener = TrainingProgressListener { completed, total ->
            trainingProgress.update(completed, total)
        }
    )
    val artifactWriter = MachineLearnedArtifactWriter(objectMapper)
    val artifactReader = MachineLearnedArtifactReader(objectMapper)

    datasetProgress.start()
    val dataset = datasetGenerator.generate(
        MachineLearnedDatasetGenerationRequest(
            ruleConfigurationId = options.ruleConfigurationId,
            expertBotId = options.expertBotId,
            selfPlayBotIds = options.selfPlayBotIds,
            gamesPerMatchup = options.gamesPerMatchup,
            sampleStride = options.sampleStride,
            maxSampledPositionsPerGame = options.maxSampledPositionsPerGame,
            maxPliesPerGame = options.maxPliesPerGame,
            openingRandomPlies = options.openingRandomPlies,
            initialSeed = options.initialSeed,
            workerCount = options.workerCount
        )
    )
    datasetProgress.finish()

    trainingProgress.start()
    val model = trainer.train(dataset)
    trainingProgress.finish()

    val datasetPath = options.outputDir.resolve(options.datasetFilename)
    val artifactPath = options.outputDir.resolve(options.artifactFilename)

    datasetCodec.write(datasetPath, dataset)
    artifactWriter.write(artifactPath, model)
    artifactReader.read(artifactPath)

    println("Generated ${dataset.examples.size} training examples for ${dataset.ruleConfigurationId}.")
    println("Dataset: ${datasetPath.absolute()}")
    println("Artifact: ${artifactPath.absolute()}")
    println("Self-play games: ${dataset.selfPlayGames}")
    println("Expert bot: ${dataset.expertBotId}")
    println("Opening random plies: ${options.openingRandomPlies}")
    println("Workers: ${options.workerCount}")
}

private fun runEvolution(
    options: TrainingCliOptions,
    objectMapper: ObjectMapper,
    clock: Clock
) {
    val incumbentPath = requireNotNull(options.incumbentArtifactPath) {
        "--incumbent-artifact is required when --mode evolve."
    }
    val artifactReader = MachineLearnedArtifactReader(objectMapper)
    val artifactWriter = MachineLearnedArtifactWriter(objectMapper)
    val reportPath = options.outputDir.resolve(options.evolutionReportFilename)
    val bestArtifactPath = options.outputDir.resolve(options.evolvedArtifactFilename)
    val result = MachineLearnedEvolutionLoop(clock = clock).run(
        MachineLearnedEvolutionRequest(
            ruleConfigurationId = options.ruleConfigurationId,
            incumbentModel = artifactReader.read(incumbentPath),
            seedModel = options.seedArtifactPath?.let(artifactReader::read),
            populationSize = options.populationSize,
            survivorCount = options.survivorCount,
            generations = options.generations,
            gamesPerPairing = options.gamesPerMatchup,
            baselineBotIds = options.baselineBotIds,
            maxPliesPerGame = options.maxPliesPerGame,
            openingRandomPlies = options.openingRandomPlies,
            initialSeed = options.initialSeed,
            mutationRate = options.mutationRate,
            mutationScale = options.mutationScale,
            crossoverRate = options.crossoverRate,
            eliteCount = options.eliteCount,
            finalGateGamesPerPairing = options.finalGateGamesPerPairing,
            promotionThresholds = MachineLearnedEvolutionPromotionThresholds(
                minimumWinRate = options.minimumPromotionWinRate,
                maximumLossRate = options.maximumPromotionLossRate
            )
        )
    )

    artifactWriter.write(bestArtifactPath, result.bestModel)
    reportPath.parent?.let(Files::createDirectories)
    Files.newBufferedWriter(reportPath).use { writer ->
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, result.report)
    }

    val matchCount = result.report.generationSummaries.sumOf { summary -> summary.matches.size } +
        result.report.finalGateMatches.size
    println("Ran ${result.report.generationSummaries.size} evolution generations for ${result.report.ruleConfigurationId}.")
    println("Evolution matches: $matchCount")
    println("Best candidate: ${result.report.bestCandidateId}")
    println("Candidate wins: ${result.report.finalPromotionDecision.candidateWins}")
    println("Candidate losses: ${result.report.finalPromotionDecision.candidateLosses}")
    println("Candidate draws: ${result.report.finalPromotionDecision.candidateDraws}")
    println("Promotion: ${result.report.finalPromotionDecision.promote} (${result.report.finalPromotionDecision.reason})")
    println("Best artifact: ${bestArtifactPath.absolutePathString()}")
    println("Report: ${reportPath.absolutePathString()}")
}

private enum class TrainingCliMode {
    train,
    evolve
}

private val defaultSelfPlayBotIds = listOf(
    BotRegistry.randomBotId,
    BotRegistry.simpleBotId,
    BotRegistry.minimaxBotId,
    BotRegistry.deepMinimaxBotId
)

private val defaultEvolutionBaselineBotIds = listOf(
    BotRegistry.minimaxBotId,
    BotRegistry.deepMinimaxBotId
)

private data class TrainingCliOptions(
    val mode: TrainingCliMode = TrainingCliMode.train,
    val ruleConfigurationId: String = "sherwood-rules",
    val expertBotId: String = BotRegistry.deepMinimaxBotId,
    val selfPlayBotIds: List<String> = defaultSelfPlayBotIds,
    val gamesPerMatchup: Int = 1,
    val sampleStride: Int = 2,
    val maxSampledPositionsPerGame: Int = 8,
    val maxPliesPerGame: Int = 300,
    val openingRandomPlies: Int = 0,
    val initialSeed: Int = 1,
    val workerCount: Int = defaultTrainingWorkerCount(),
    val outputDir: Path = Path.of("build", "machine-learned-candidate"),
    val datasetFilename: String = "sherwood-rules.dataset.json",
    val artifactFilename: String = "sherwood-rules.generated.json",
    val seedArtifactPath: Path? = null,
    val incumbentArtifactPath: Path? = null,
    val baselineBotIds: List<String> = defaultEvolutionBaselineBotIds,
    val populationSize: Int = 24,
    val survivorCount: Int = 6,
    val generations: Int = 20,
    val mutationRate: Double = 0.15,
    val mutationScale: Float = 0.1f,
    val crossoverRate: Double = 0.5,
    val eliteCount: Int = 2,
    val finalGateGamesPerPairing: Int = 4,
    val minimumPromotionWinRate: Double = 0.55,
    val maximumPromotionLossRate: Double = 0.35,
    val evolutionReportFilename: String = "sherwood-rules.evolution-report.json",
    val evolvedArtifactFilename: String = "sherwood-rules.evolved.json"
) {
    companion object {
        fun parse(args: List<String>): TrainingCliOptions {
            val values = mutableMapOf<String, String>()
            var index = 0
            while (index < args.size) {
                val token = args[index]
                require(token.startsWith("--")) {
                    "Unexpected argument: $token"
                }
                require(index + 1 < args.size) {
                    "Missing value for $token"
                }
                values[token.removePrefix("--")] = args[index + 1]
                index += 2
            }

            val ruleConfigurationId = values["rule-configuration-id"] ?: "sherwood-rules"
            return TrainingCliOptions(
                mode = values["mode"]?.let(TrainingCliMode::valueOf) ?: TrainingCliMode.train,
                ruleConfigurationId = ruleConfigurationId,
                expertBotId = values["expert-bot-id"] ?: BotRegistry.deepMinimaxBotId,
                selfPlayBotIds = values["self-play-bot-ids"]
                    ?.split(",")
                    ?.map(String::trim)
                    ?.filter(String::isNotBlank)
                    ?: defaultSelfPlayBotIds,
                gamesPerMatchup = values["games-per-matchup"]?.toInt() ?: 1,
                sampleStride = values["sample-stride"]?.toInt() ?: 2,
                maxSampledPositionsPerGame = values["max-sampled-positions-per-game"]?.toInt() ?: 8,
                maxPliesPerGame = values["max-plies-per-game"]?.toInt() ?: 300,
                openingRandomPlies = values["opening-random-plies"]?.toInt() ?: 0,
                initialSeed = values["initial-seed"]?.toInt() ?: 1,
                workerCount = values["worker-count"]?.toInt() ?: defaultTrainingWorkerCount(),
                outputDir = values["output-dir"]?.let(Path::of) ?: Path.of("build", "machine-learned-candidate"),
                datasetFilename = values["dataset-filename"] ?: "$ruleConfigurationId.dataset.json",
                artifactFilename = values["artifact-filename"] ?: "$ruleConfigurationId.generated.json",
                seedArtifactPath = values["seed-artifact"]?.let(Path::of),
                incumbentArtifactPath = values["incumbent-artifact"]?.let(Path::of),
                baselineBotIds = values["baseline-bot-ids"]
                    ?.split(",")
                    ?.map(String::trim)
                    ?.filter(String::isNotBlank)
                    ?: defaultEvolutionBaselineBotIds,
                populationSize = values["population-size"]?.toInt() ?: 24,
                survivorCount = values["survivor-count"]?.toInt() ?: 6,
                generations = values["generations"]?.toInt() ?: 20,
                mutationRate = values["mutation-rate"]?.toDouble() ?: 0.15,
                mutationScale = values["mutation-scale"]?.toFloat() ?: 0.1f,
                crossoverRate = values["crossover-rate"]?.toDouble() ?: 0.5,
                eliteCount = values["elite-count"]?.toInt() ?: 2,
                finalGateGamesPerPairing = values["final-gate-games-per-pairing"]?.toInt() ?: 4,
                minimumPromotionWinRate = values["minimum-promotion-win-rate"]?.toDouble() ?: 0.55,
                maximumPromotionLossRate = values["maximum-promotion-loss-rate"]?.toDouble() ?: 0.35,
                evolutionReportFilename = values["report-filename"] ?: "$ruleConfigurationId.evolution-report.json",
                evolvedArtifactFilename = values["evolved-artifact-filename"] ?: "$ruleConfigurationId.evolved.json"
            )
        }
    }
}
