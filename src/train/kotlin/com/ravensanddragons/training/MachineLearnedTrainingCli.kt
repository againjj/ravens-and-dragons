package com.ravensanddragons.training
import java.nio.file.Path
import java.time.Clock
import kotlin.io.path.absolute

fun main(args: Array<String>) {
    val options = TrainingCliOptions.parse(args.toList())
    val objectMapper = trainingObjectMapper()
    val clock = Clock.systemUTC()
    val datasetProgress = DecileProgressLine(System.out, "Generating dataset")
    val trainingProgress = DecileProgressLine(System.out, "Training model")

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
    println("Workers: ${options.workerCount}")
}

private data class TrainingCliOptions(
    val ruleConfigurationId: String = "sherwood-rules",
    val expertBotId: String = com.ravensanddragons.game.BotRegistry.deepMinimaxBotId,
    val selfPlayBotIds: List<String> = listOf(
        com.ravensanddragons.game.BotRegistry.randomBotId,
        com.ravensanddragons.game.BotRegistry.simpleBotId,
        com.ravensanddragons.game.BotRegistry.minimaxBotId,
        com.ravensanddragons.game.BotRegistry.deepMinimaxBotId
    ),
    val gamesPerMatchup: Int = 1,
    val sampleStride: Int = 2,
    val maxSampledPositionsPerGame: Int = 8,
    val maxPliesPerGame: Int = 300,
    val initialSeed: Int = 1,
    val workerCount: Int = defaultTrainingWorkerCount(),
    val outputDir: Path = Path.of("build", "machine-learned-candidate"),
    val datasetFilename: String = "sherwood-rules.dataset.json",
    val artifactFilename: String = "sherwood-rules.generated.json"
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
                ruleConfigurationId = ruleConfigurationId,
                expertBotId = values["expert-bot-id"] ?: com.ravensanddragons.game.BotRegistry.deepMinimaxBotId,
                selfPlayBotIds = values["self-play-bot-ids"]
                    ?.split(",")
                    ?.map(String::trim)
                    ?.filter(String::isNotBlank)
                    ?: listOf(
                        com.ravensanddragons.game.BotRegistry.randomBotId,
                        com.ravensanddragons.game.BotRegistry.simpleBotId,
                        com.ravensanddragons.game.BotRegistry.minimaxBotId,
                        com.ravensanddragons.game.BotRegistry.deepMinimaxBotId
                    ),
                gamesPerMatchup = values["games-per-matchup"]?.toInt() ?: 1,
                sampleStride = values["sample-stride"]?.toInt() ?: 2,
                maxSampledPositionsPerGame = values["max-sampled-positions-per-game"]?.toInt() ?: 8,
                maxPliesPerGame = values["max-plies-per-game"]?.toInt() ?: 300,
                initialSeed = values["initial-seed"]?.toInt() ?: 1,
                workerCount = values["worker-count"]?.toInt() ?: defaultTrainingWorkerCount(),
                outputDir = values["output-dir"]?.let(Path::of) ?: Path.of("build", "machine-learned-candidate"),
                datasetFilename = values["dataset-filename"] ?: "$ruleConfigurationId.dataset.json",
                artifactFilename = values["artifact-filename"] ?: "$ruleConfigurationId.generated.json"
            )
        }
    }
}
