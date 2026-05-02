package com.ravensanddragons.training

import com.fasterxml.jackson.databind.ObjectMapper
import com.ravensanddragons.game.BotRegistry
import com.ravensanddragons.game.MachineLearnedArtifactRunSummary
import com.ravensanddragons.game.MachineLearnedEvolutionSummary
import com.ravensanddragons.game.MachineLearnedModel
import com.ravensanddragons.game.MachineLearnedTrainingSummary
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.io.path.absolute
import kotlin.io.path.absolutePathString

fun main(args: Array<String>) {
    val options = TrainingCliOptions.parse(args.toList())
    val objectMapper = trainingObjectMapper()
    val clock = Clock.systemUTC()
    val datasetProgress = DecileProgressLine(System.out, "Generating dataset")
    val trainingProgress = DecileProgressLine(System.out, "Training model")
    val runId = options.resolvedRunId(clock.instant())

    if (options.mode == TrainingCliMode.evolve) {
        runEvolution(options, objectMapper, clock, runId)
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

    val datasetPath = options.outputDir.resolve(options.resolvedDatasetFilename(runId))
    val artifactPath = options.outputDir.resolve(options.resolvedArtifactFilename(runId))
    val modelWithSummary = model.copy(
        trainingSummary = (model.trainingSummary ?: MachineLearnedTrainingSummary()).copy(
            selfPlayBotIds = options.selfPlayBotIds,
            gamesPerMatchup = options.gamesPerMatchup,
            sampleStride = options.sampleStride,
            maxSampledPositionsPerGame = options.maxSampledPositionsPerGame,
            maxPliesPerGame = options.maxPliesPerGame,
            openingRandomPlies = options.openingRandomPlies,
            run = options.runSummary(
                runId = runId,
                artifactPath = artifactPath,
                datasetPath = datasetPath,
                commandLine = args.joinToString(" ")
            )
        )
    )

    datasetCodec.write(datasetPath, dataset)
    artifactWriter.write(artifactPath, modelWithSummary)
    artifactReader.read(artifactPath)

    println("Generated ${dataset.examples.size} training examples for ${dataset.ruleConfigurationId}.")
    println("Run id: $runId")
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
    clock: Clock,
    runId: String
) {
    val incumbentPath = requireNotNull(options.incumbentArtifactPath) {
        "--incumbent-artifact is required when --mode evolve."
    }
    val artifactReader = MachineLearnedArtifactReader(objectMapper)
    val artifactWriter = MachineLearnedArtifactWriter(objectMapper)
    val reportPath = options.outputDir.resolve(options.resolvedEvolutionReportFilename(runId))
    val bestArtifactPath = options.outputDir.resolve(options.resolvedEvolvedArtifactFilename(runId))
    val evolutionProgress = DecileProgressLine(System.out, "Running evolution matches")
    val evolutionLoop = MachineLearnedEvolutionLoop(
        clock = clock,
        progressListener = TrainingProgressListener { completed, total ->
            evolutionProgress.update(completed, total)
        }
    )

    evolutionProgress.start()
    val result = evolutionLoop.run(
        MachineLearnedEvolutionRequest(
            ruleConfigurationId = options.ruleConfigurationId,
            incumbentModel = artifactReader.read(incumbentPath),
            seedModels = options.seedArtifactPaths.map(artifactReader::read),
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
            survivorComparisonGamesPerPairing = options.survivorComparisonGamesPerPairing,
            workerCount = options.workerCount,
            promotionThresholds = MachineLearnedEvolutionPromotionThresholds(
                minimumWinRate = options.minimumPromotionWinRate,
                maximumLossRate = options.maximumPromotionLossRate
            )
        )
    )
    evolutionProgress.finish()

    val bestModelWithSummary = result.bestModel.withEvolutionSummary(
        options = options,
        runId = runId,
        artifactPath = bestArtifactPath,
        reportPath = reportPath,
        commandLine = options.cliArguments.joinToString(" "),
        report = result.report
    )
    artifactWriter.write(bestArtifactPath, bestModelWithSummary)
    val survivorArtifactPaths = result.survivorModels.map { survivor ->
        val path = options.outputDir.resolve("$runId.${survivor.candidateId}.json")
        artifactWriter.write(
            path,
            survivor.model.withEvolutionSummary(
                options = options,
                runId = runId,
                artifactPath = path,
                reportPath = reportPath,
                commandLine = options.cliArguments.joinToString(" "),
                report = result.report
            )
        )
        path
    }
    reportPath.parent?.let(Files::createDirectories)
    Files.newBufferedWriter(reportPath).use { writer ->
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, result.report)
    }

    val matchCount = result.report.generationSummaries.sumOf { summary -> summary.matches.size } +
        result.report.survivorComparisonMatches.size
    println("Ran ${result.report.generationSummaries.size} evolution generations for ${result.report.ruleConfigurationId}.")
    println("Run id: $runId")
    println("Evolution matches: $matchCount")
    println("Survivor comparison rankings:")
    result.report.survivorComparisonRankings.forEach { ranking ->
        println(
            "${ranking.rank}. ${ranking.participantType}:${ranking.participantId} " +
                "score=${ranking.score} wins=${ranking.wins} losses=${ranking.losses} draws=${ranking.draws}"
        )
    }
    println("Workers: ${options.workerCount}")
    println("Best candidate: ${result.report.bestCandidateId}")
    println("Candidate wins: ${result.report.finalPromotionDecision.candidateWins}")
    println("Candidate losses: ${result.report.finalPromotionDecision.candidateLosses}")
    println("Candidate draws: ${result.report.finalPromotionDecision.candidateDraws}")
    println("Promotion: ${result.report.finalPromotionDecision.promote} (${result.report.finalPromotionDecision.reason})")
    println("Best artifact: ${bestArtifactPath.absolutePathString()}")
    println("Survivor artifacts:")
    survivorArtifactPaths.forEach { path ->
        println(path.absolutePathString())
    }
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
    val cliArguments: List<String> = emptyList(),
    val runId: String? = null,
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
    val datasetFilename: String? = null,
    val artifactFilename: String? = null,
    val seedArtifactPaths: List<Path> = emptyList(),
    val incumbentArtifactPath: Path? = null,
    val baselineBotIds: List<String> = defaultEvolutionBaselineBotIds,
    val populationSize: Int = 24,
    val survivorCount: Int = 6,
    val generations: Int = 20,
    val mutationRate: Double = 0.15,
    val mutationScale: Float = 0.1f,
    val crossoverRate: Double = 0.5,
    val eliteCount: Int = 2,
    val survivorComparisonGamesPerPairing: Int = 4,
    val minimumPromotionWinRate: Double = 0.55,
    val maximumPromotionLossRate: Double = 0.35,
    val evolutionReportFilename: String? = null,
    val evolvedArtifactFilename: String? = null
) {
    fun resolvedRunId(now: Instant): String {
        val value = runId ?: "${ruleConfigurationId}.${mode.name}.${runIdTimestampFormatter.format(now)}"
        require(runIdPattern.matches(value)) {
            "Machine-learned training run id may contain only letters, numbers, dots, underscores, and hyphens."
        }
        return value
    }

    fun resolvedDatasetFilename(resolvedRunId: String): String =
        datasetFilename ?: "$resolvedRunId.dataset.json"

    fun resolvedArtifactFilename(resolvedRunId: String): String =
        artifactFilename ?: "$resolvedRunId.generated.json"

    fun resolvedEvolutionReportFilename(resolvedRunId: String): String =
        evolutionReportFilename ?: "$resolvedRunId.evolution-report.json"

    fun resolvedEvolvedArtifactFilename(resolvedRunId: String): String =
        evolvedArtifactFilename ?: "$resolvedRunId.evolved.json"

    fun runSummary(
        runId: String,
        artifactPath: Path,
        commandLine: String,
        datasetPath: Path? = null,
        reportPath: Path? = null
    ): MachineLearnedArtifactRunSummary =
        MachineLearnedArtifactRunSummary(
            runId = runId,
            mode = mode.name,
            commandLine = commandLine.ifBlank { null },
            initialSeed = initialSeed,
            workerCount = workerCount,
            outputDir = outputDir.normalizedPathString(),
            datasetPath = datasetPath?.normalizedPathString(),
            artifactPath = artifactPath.normalizedPathString(),
            evolutionReportPath = reportPath?.normalizedPathString()
        )

    companion object {
        private val runIdTimestampFormatter = DateTimeFormatter
            .ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC)
        private val runIdPattern = Regex("[A-Za-z0-9._-]+")

        fun parse(args: List<String>): TrainingCliOptions {
            val values = mutableMapOf<String, MutableList<String>>()
            var index = 0
            while (index < args.size) {
                val token = args[index]
                require(token.startsWith("--")) {
                    "Unexpected argument: $token"
                }
                require(index + 1 < args.size) {
                    "Missing value for $token"
                }
                values.getOrPut(token.removePrefix("--")) { mutableListOf() } += args[index + 1]
                index += 2
            }

            val ruleConfigurationId = values.lastValue("rule-configuration-id") ?: "sherwood-rules"
            return TrainingCliOptions(
                mode = values.lastValue("mode")?.let(TrainingCliMode::valueOf) ?: TrainingCliMode.train,
                cliArguments = args,
                runId = values.lastValue("run-id"),
                ruleConfigurationId = ruleConfigurationId,
                expertBotId = values.lastValue("expert-bot-id") ?: BotRegistry.deepMinimaxBotId,
                selfPlayBotIds = values.lastValue("self-play-bot-ids")
                    ?.split(",")
                    ?.map(String::trim)
                    ?.filter(String::isNotBlank)
                    ?: defaultSelfPlayBotIds,
                gamesPerMatchup = values.lastValue("games-per-matchup")?.toInt() ?: 1,
                sampleStride = values.lastValue("sample-stride")?.toInt() ?: 2,
                maxSampledPositionsPerGame = values.lastValue("max-sampled-positions-per-game")?.toInt() ?: 8,
                maxPliesPerGame = values.lastValue("max-plies-per-game")?.toInt() ?: 300,
                openingRandomPlies = values.lastValue("opening-random-plies")?.toInt() ?: 0,
                initialSeed = values.lastValue("initial-seed")?.toInt() ?: 1,
                workerCount = values.lastValue("worker-count")?.toInt() ?: defaultTrainingWorkerCount(),
                outputDir = values.lastValue("output-dir")?.let(Path::of) ?: Path.of("build", "machine-learned-candidate"),
                datasetFilename = values.lastValue("dataset-filename"),
                artifactFilename = values.lastValue("artifact-filename"),
                seedArtifactPaths = values.allValues("seed-artifact").map(Path::of),
                incumbentArtifactPath = values.lastValue("incumbent-artifact")?.let(Path::of),
                baselineBotIds = values.lastValue("baseline-bot-ids")
                    ?.split(",")
                    ?.map(String::trim)
                    ?.filter(String::isNotBlank)
                    ?: defaultEvolutionBaselineBotIds,
                populationSize = values.lastValue("population-size")?.toInt() ?: 24,
                survivorCount = values.lastValue("survivor-count")?.toInt() ?: 6,
                generations = values.lastValue("generations")?.toInt() ?: 20,
                mutationRate = values.lastValue("mutation-rate")?.toDouble() ?: 0.15,
                mutationScale = values.lastValue("mutation-scale")?.toFloat() ?: 0.1f,
                crossoverRate = values.lastValue("crossover-rate")?.toDouble() ?: 0.5,
                eliteCount = values.lastValue("elite-count")?.toInt() ?: 2,
                survivorComparisonGamesPerPairing = values.lastValue("survivor-comparison-games-per-pairing")?.toInt()
                    ?: values.lastValue("final-gate-games-per-pairing")?.toInt()
                    ?: 4,
                minimumPromotionWinRate = values.lastValue("minimum-promotion-win-rate")?.toDouble() ?: 0.55,
                maximumPromotionLossRate = values.lastValue("maximum-promotion-loss-rate")?.toDouble() ?: 0.35,
                evolutionReportFilename = values.lastValue("report-filename"),
                evolvedArtifactFilename = values.lastValue("evolved-artifact-filename")
            )
        }

        private fun Map<String, List<String>>.lastValue(key: String): String? =
            this[key]?.lastOrNull()

        private fun Map<String, List<String>>.allValues(key: String): List<String> =
            this[key].orEmpty()
    }
}

private fun MachineLearnedModel.withEvolutionSummary(
    options: TrainingCliOptions,
    runId: String,
    artifactPath: Path,
    reportPath: Path,
    commandLine: String,
    report: MachineLearnedEvolutionReport
): MachineLearnedModel =
    copy(
        trainingSummary = trainingSummary.copyForEvolution(
            options = options,
            runId = runId,
            artifactPath = artifactPath,
            reportPath = reportPath,
            commandLine = commandLine,
            report = report
        )
    )

private fun MachineLearnedTrainingSummary?.copyForEvolution(
    options: TrainingCliOptions,
    runId: String,
    artifactPath: Path,
    reportPath: Path,
    commandLine: String,
    report: MachineLearnedEvolutionReport
) = (this ?: MachineLearnedTrainingSummary()).copy(
    maxPliesPerGame = options.maxPliesPerGame,
    openingRandomPlies = options.openingRandomPlies,
    run = options.runSummary(
        runId = runId,
        artifactPath = artifactPath,
        reportPath = reportPath,
        commandLine = commandLine
    ),
    evolution = MachineLearnedEvolutionSummary(
        bestCandidateId = report.bestCandidateId,
        promote = report.finalPromotionDecision.promote,
        winRate = report.finalPromotionDecision.winRate,
        lossRate = report.finalPromotionDecision.lossRate,
        candidateWins = report.finalPromotionDecision.candidateWins,
        candidateLosses = report.finalPromotionDecision.candidateLosses,
        candidateDraws = report.finalPromotionDecision.candidateDraws,
        promotionReason = report.finalPromotionDecision.reason,
        baselineBotIds = options.baselineBotIds,
        seedArtifactPaths = options.seedArtifactPaths.map { it.normalizedPathString() },
        incumbentArtifactPath = options.incumbentArtifactPath?.normalizedPathString()
    )
)

private fun Path.normalizedPathString(): String =
    normalize().toString()
