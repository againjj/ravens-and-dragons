package com.ravensanddragons.training

import com.ravensanddragons.game.BotRegistry
import com.ravensanddragons.game.GameBotStrategy
import com.ravensanddragons.game.GameRules
import com.ravensanddragons.game.MachineLearnedFeatureEncoder
import java.time.Clock

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
    val initialSeed: Int = 1
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
        require(request.selfPlayBotIds.isNotEmpty()) {
            "Training dataset selfPlayBotIds must not be empty."
        }

        val expertStrategy = expertStrategyFactory(request)

        val examples = mutableListOf<TrainingExample>()
        var selfPlayGames = 0
        var nextSeed = request.initialSeed

        request.selfPlayBotIds.forEach { dragonsBotId ->
            request.selfPlayBotIds.forEach { ravensBotId ->
                repeat(request.gamesPerMatchup) {
                    val game = selfPlayRunner.play(
                        SelfPlayMatchup(
                            ruleConfigurationId = request.ruleConfigurationId,
                            dragonsBotId = dragonsBotId,
                            ravensBotId = ravensBotId,
                            seed = nextSeed++,
                            maxPlies = request.maxPliesPerGame
                        )
                    )
                    selfPlayGames += 1

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
                }
            }
        }

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
            selfPlayGames = selfPlayGames,
            examples = examples
        )
    }
}
