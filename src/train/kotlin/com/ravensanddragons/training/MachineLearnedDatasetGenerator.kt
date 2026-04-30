package com.ravensanddragons.training

import com.ravensanddragons.game.BotRegistry
import com.ravensanddragons.game.GameBotStrategy
import com.ravensanddragons.game.GameRules
import com.ravensanddragons.game.MachineLearnedFeatureEncoder
import java.time.Clock
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.Future

data class MachineLearnedDatasetGenerationRequest(
    val ruleConfigurationId: String,
    val expertBotId: String = BotRegistry.deepMinimaxBotId,
    val selfPlayBotIds: List<String> = listOf(
        BotRegistry.randomBotId,
        BotRegistry.simpleBotId,
        BotRegistry.minimaxBotId,
        BotRegistry.deepMinimaxBotId
    ),
    val gamesPerMatchup: Int = 1,
    val sampleStride: Int = 2,
    val maxSampledPositionsPerGame: Int = 8,
    val maxPliesPerGame: Int = 300,
    val initialSeed: Int = 1,
    val workerCount: Int = defaultTrainingWorkerCount()
)

class MachineLearnedDatasetGenerator(
    private val selfPlayRunner: MachineLearnedSelfPlayRunner = MachineLearnedSelfPlayRunner(),
    private val clock: Clock = Clock.systemUTC(),
    private val expertStrategyFactory: (MachineLearnedDatasetGenerationRequest) -> GameBotStrategy = { request ->
        BotRegistry(SeededRandomIndexSource(request.initialSeed + 10_000))
            .requireSupportedDefinition(request.expertBotId, request.ruleConfigurationId)
            .strategy
    }
) {
    fun generate(request: MachineLearnedDatasetGenerationRequest): MachineLearnedDataset {
        require(request.ruleConfigurationId.isNotBlank()) {
            "Training dataset ruleConfigurationId must be non-empty."
        }
        require(request.gamesPerMatchup > 0) {
            "Training dataset gamesPerMatchup must be positive."
        }
        require(request.sampleStride > 0) {
            "Training dataset sampleStride must be positive."
        }
        require(request.maxSampledPositionsPerGame > 0) {
            "Training dataset maxSampledPositionsPerGame must be positive."
        }
        require(request.maxPliesPerGame > 0) {
            "Training dataset maxPliesPerGame must be positive."
        }
        require(request.workerCount > 0) {
            "Training dataset workerCount must be positive."
        }
        require(request.selfPlayBotIds.isNotEmpty()) {
            "Training dataset selfPlayBotIds must not be empty."
        }

        val tasks = buildTasks(request)
        val workerCount = minOf(request.workerCount, tasks.size)
        val results = executeTasks(tasks, workerCount) { task ->
            generateTaskResult(task, request)
        }
        val examples = results
            .sortedBy(TaskResult::index)
            .flatMap(TaskResult::examples)

        require(examples.isNotEmpty()) {
            "Training dataset generation produced no examples for ${request.ruleConfigurationId}."
        }
        require(examples.all { it.ruleConfigurationId == request.ruleConfigurationId }) {
            "Training dataset generation mixed rule configurations."
        }
        require(examples.all { it.featureSchemaVersion == MachineLearnedFeatureEncoder.schemaVersion }) {
            "Training dataset generation mixed feature schema versions."
        }

        return MachineLearnedDataset(
            ruleConfigurationId = request.ruleConfigurationId,
            featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
            generatedAt = clock.instant(),
            expertBotId = request.expertBotId,
            selfPlayBotIds = request.selfPlayBotIds.distinct(),
            selfPlayGames = tasks.size,
            examples = examples
        )
    }

    private fun buildTasks(request: MachineLearnedDatasetGenerationRequest): List<TaskDefinition> {
        val tasks = mutableListOf<TaskDefinition>()
        var nextSeed = request.initialSeed
        var nextIndex = 0

        request.selfPlayBotIds.forEach { dragonsBotId ->
            request.selfPlayBotIds.forEach { ravensBotId ->
                repeat(request.gamesPerMatchup) {
                    tasks += TaskDefinition(
                        index = nextIndex++,
                        matchup = SelfPlayMatchup(
                            ruleConfigurationId = request.ruleConfigurationId,
                            dragonsBotId = dragonsBotId,
                            ravensBotId = ravensBotId,
                            seed = nextSeed++,
                            maxPlies = request.maxPliesPerGame
                        )
                    )
                }
            }
        }

        return tasks
    }

    private fun generateTaskResult(
        task: TaskDefinition,
        request: MachineLearnedDatasetGenerationRequest
    ): TaskResult {
        val expertStrategy = expertStrategyFactory(request)
        val game = selfPlayRunner.play(task.matchup)
        val examples = mutableListOf<TrainingExample>()

        game.sampledPositions
            .asSequence()
            .filter { sampled -> sampled.legalMoves.size > 1 }
            .filter { sampled -> sampled.plyIndex % request.sampleStride == 0 }
            .take(request.maxSampledPositionsPerGame)
            .forEach { sampled ->
                val expertMove = expertStrategy.chooseMove(sampled.snapshot, sampled.legalMoves)
                sampled.legalMoves.forEach { candidateMove ->
                    val nextSnapshot = GameRules.movePiece(
                        sampled.snapshot,
                        candidateMove.origin,
                        candidateMove.destination
                    )
                    examples += TrainingExample(
                        ruleConfigurationId = request.ruleConfigurationId,
                        featureSchemaVersion = MachineLearnedFeatureEncoder.schemaVersion,
                        boardSize = sampled.snapshot.boardSize,
                        activeSide = sampled.snapshot.activeSide,
                        candidateMove = candidateMove,
                        expertMove = expertMove,
                        features = MachineLearnedFeatureEncoder.encode(
                            sampled.snapshot,
                            candidateMove,
                            nextSnapshot
                        ).toList(),
                        label = if (candidateMove == expertMove) 1f else 0f,
                        source = TrainingExampleSource.expertImitation
                    )
                }
            }

        return TaskResult(index = task.index, examples = examples)
    }

    private fun <T> executeTasks(
        tasks: List<TaskDefinition>,
        workerCount: Int,
        block: (TaskDefinition) -> T
    ): List<T> {
        if (tasks.isEmpty()) {
            return emptyList()
        }
        if (workerCount <= 1) {
            return tasks.map(block)
        }

        val executor = Executors.newFixedThreadPool(workerCount)
        return try {
            val futures = tasks.map { task ->
                executor.submit(Callable { block(task) })
            }
            futures.map(Future<T>::get)
        } finally {
            executor.shutdown()
        }
    }

    private data class TaskDefinition(
        val index: Int,
        val matchup: SelfPlayMatchup
    )

    private data class TaskResult(
        val index: Int,
        val examples: List<TrainingExample>
    )
}
