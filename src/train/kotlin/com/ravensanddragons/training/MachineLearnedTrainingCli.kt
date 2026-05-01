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

    if (options.mode == TrainingCliMode.strengthen) {
        runStrengthening(options, objectMapper)
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

private fun runStrengthening(
    options: TrainingCliOptions,
    objectMapper: ObjectMapper
) {
    val candidatePath = requireNotNull(options.candidateArtifactPath) {
        "--candidate-artifact is required when --mode strengthen."
    }
    val incumbentPath = requireNotNull(options.incumbentArtifactPath) {
        "--incumbent-artifact is required when --mode strengthen."
    }
    val artifactReader = MachineLearnedArtifactReader(objectMapper)
    val reportPath = options.outputDir.resolve(options.reportFilename)
    val report = MachineLearnedStrengtheningLoop().run(
        MachineLearnedStrengtheningRequest(
            ruleConfigurationId = options.ruleConfigurationId,
            candidateModel = artifactReader.read(candidatePath),
            incumbentModel = artifactReader.read(incumbentPath),
            gamesPerPairing = options.gamesPerMatchup,
            selfPlayGames = options.selfPlayGames,
            baselineBotIds = options.baselineBotIds,
            maxPliesPerGame = options.maxPliesPerGame,
            openingRandomPlies = options.openingRandomPlies,
            initialSeed = options.initialSeed,
            longGamePlyThreshold = options.longGamePlyThreshold,
            maxHardPositions = options.maxHardPositions,
            promotionThresholds = MachineLearnedPromotionThresholds(
                minimumWinRate = options.minimumPromotionWinRate,
                maximumLossRate = options.maximumPromotionLossRate
            )
        )
    )

    reportPath.parent?.let(Files::createDirectories)
    Files.newBufferedWriter(reportPath).use { writer ->
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, report)
    }

    println("Ran ${report.matches.size} strengthening games for ${report.ruleConfigurationId}.")
    println("Candidate wins: ${report.promotionDecision.candidateWins}")
    println("Candidate losses: ${report.promotionDecision.candidateLosses}")
    println("Candidate draws: ${report.promotionDecision.candidateDraws}")
    println("Promotion: ${report.promotionDecision.promote} (${report.promotionDecision.reason})")
    println("Hard positions: ${report.hardPositions.size}")
    println("Report: ${reportPath.absolutePathString()}")
}

private enum class TrainingCliMode {
    train,
    strengthen
}

private val defaultSelfPlayBotIds = listOf(
    BotRegistry.randomBotId,
    BotRegistry.simpleBotId,
    BotRegistry.minimaxBotId,
    BotRegistry.deepMinimaxBotId
)

private val defaultStrengtheningBaselineBotIds = listOf(
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
    val candidateArtifactPath: Path? = null,
    val incumbentArtifactPath: Path? = null,
    val baselineBotIds: List<String> = defaultStrengtheningBaselineBotIds,
    val selfPlayGames: Int = 1,
    val longGamePlyThreshold: Int = 120,
    val maxHardPositions: Int = 64,
    val minimumPromotionWinRate: Double = 0.55,
    val maximumPromotionLossRate: Double = 0.35,
    val reportFilename: String = "sherwood-rules.strengthening-report.json"
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
                candidateArtifactPath = values["candidate-artifact"]?.let(Path::of),
                incumbentArtifactPath = values["incumbent-artifact"]?.let(Path::of),
                baselineBotIds = values["baseline-bot-ids"]
                    ?.split(",")
                    ?.map(String::trim)
                    ?.filter(String::isNotBlank)
                    ?: defaultStrengtheningBaselineBotIds,
                selfPlayGames = values["self-play-games"]?.toInt() ?: 1,
                longGamePlyThreshold = values["long-game-ply-threshold"]?.toInt() ?: 120,
                maxHardPositions = values["max-hard-positions"]?.toInt() ?: 64,
                minimumPromotionWinRate = values["minimum-promotion-win-rate"]?.toDouble() ?: 0.55,
                maximumPromotionLossRate = values["maximum-promotion-loss-rate"]?.toDouble() ?: 0.35,
                reportFilename = values["report-filename"] ?: "$ruleConfigurationId.strengthening-report.json"
            )
        }
    }
}
