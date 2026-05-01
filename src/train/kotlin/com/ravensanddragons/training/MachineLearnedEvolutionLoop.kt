package com.ravensanddragons.training

import com.ravensanddragons.game.BotRegistry
import com.ravensanddragons.game.GameBotStrategy
import com.ravensanddragons.game.GameRules
import com.ravensanddragons.game.GameSnapshot
import com.ravensanddragons.game.MachineLearnedBotStrategy
import com.ravensanddragons.game.MachineLearnedFeatureEncoder
import com.ravensanddragons.game.MachineLearnedModel
import com.ravensanddragons.game.MachineLearnedModelMetadata
import com.ravensanddragons.game.MachineLearnedMoveScorer
import com.ravensanddragons.game.Phase
import com.ravensanddragons.game.Side
import com.ravensanddragons.game.TurnType
import java.time.Clock
import kotlin.math.abs
import kotlin.math.max

enum class MachineLearnedEvolutionParticipantType {
    candidate,
    incumbent,
    baseline
}

enum class MachineLearnedEvolutionResult {
    win,
    loss,
    draw,
    notApplicable
}

enum class MachineLearnedCandidateOrigin {
    incumbent,
    seed,
    mutation,
    crossover
}

data class MachineLearnedEvolutionPromotionThresholds(
    val minimumWinRate: Double = 0.55,
    val maximumLossRate: Double = 0.35
)

data class MachineLearnedEvolutionRequest(
    val ruleConfigurationId: String,
    val incumbentModel: MachineLearnedModel,
    val seedModel: MachineLearnedModel? = null,
    val populationSize: Int = 24,
    val survivorCount: Int = 6,
    val generations: Int = 20,
    val gamesPerPairing: Int = 1,
    val baselineBotIds: List<String> = listOf(BotRegistry.minimaxBotId, BotRegistry.deepMinimaxBotId),
    val maxPliesPerGame: Int = 300,
    val openingRandomPlies: Int = 2,
    val initialSeed: Int = 1,
    val mutationRate: Double = 0.15,
    val mutationScale: Float = 0.1f,
    val crossoverRate: Double = 0.5,
    val eliteCount: Int = 2,
    val finalGateGamesPerPairing: Int = 4,
    val promotionThresholds: MachineLearnedEvolutionPromotionThresholds = MachineLearnedEvolutionPromotionThresholds()
)

data class MachineLearnedEvolutionReport(
    val ruleConfigurationId: String,
    val generationSummaries: List<MachineLearnedGenerationSummary>,
    val finalGateMatches: List<MachineLearnedEvolutionMatch>,
    val finalPromotionDecision: MachineLearnedEvolutionPromotionDecision,
    val bestCandidateId: String
)

data class MachineLearnedEvolutionResultBundle(
    val bestModel: MachineLearnedModel,
    val report: MachineLearnedEvolutionReport
)

data class MachineLearnedGenerationSummary(
    val generation: Int,
    val candidates: List<MachineLearnedCandidateSummary>,
    val matches: List<MachineLearnedEvolutionMatch>,
    val survivorIds: List<String>,
    val bestCandidateId: String
)

data class MachineLearnedCandidateSummary(
    val id: String,
    val generation: Int,
    val origin: MachineLearnedCandidateOrigin,
    val parentIds: List<String>,
    val score: Double,
    val wins: Int,
    val losses: Int,
    val draws: Int
)

data class MachineLearnedEvolutionMatch(
    val ruleConfigurationId: String,
    val dragonsType: MachineLearnedEvolutionParticipantType,
    val ravensType: MachineLearnedEvolutionParticipantType,
    val dragonsId: String,
    val ravensId: String,
    val seed: Int,
    val openingRandomPlies: Int,
    val turnCount: Int,
    val outcome: String,
    val candidateResults: Map<String, MachineLearnedEvolutionResult>
)

data class MachineLearnedEvolutionPromotionDecision(
    val promote: Boolean,
    val candidateWins: Int,
    val candidateLosses: Int,
    val candidateDraws: Int,
    val winRate: Double,
    val lossRate: Double,
    val reason: String
)

class MachineLearnedEvolutionLoop(
    private val clock: Clock = Clock.systemUTC(),
    private val baselineRegistryFactory: (Int) -> BotRegistry = { seed -> BotRegistry(SeededRandomIndexSource(seed)) }
) {
    fun run(request: MachineLearnedEvolutionRequest): MachineLearnedEvolutionResultBundle {
        validate(request)

        val random = SeededRandomIndexSource(request.initialSeed)
        var nextSeed = request.initialSeed
        var nextCandidateIndex = 1
        var population = initialPopulation(request, random) { "g0-c${nextCandidateIndex++}" }
        val generationSummaries = mutableListOf<MachineLearnedGenerationSummary>()

        repeat(request.generations) { generation ->
            val matches = playGeneration(request, population, nextSeed)
            nextSeed += matches.size
            val scored = scorePopulation(population, matches)
            val ranked = scored.sortedByRank()
            val survivors = ranked.take(request.survivorCount)
            val best = survivors.first().candidate

            generationSummaries += MachineLearnedGenerationSummary(
                generation = generation,
                candidates = ranked.map { it.summary() },
                matches = matches,
                survivorIds = survivors.map { it.candidate.id },
                bestCandidateId = best.id
            )

            if (generation < request.generations - 1) {
                population = nextGeneration(
                    request = request,
                    generation = generation + 1,
                    survivors = survivors.map(ScoredCandidate::candidate),
                    random = random,
                    idFactory = { "g${generation + 1}-c${nextCandidateIndex++}" }
                )
            }
        }

        val finalBestId = generationSummaries.last().bestCandidateId
        val finalBest = population.first { candidate -> candidate.id == finalBestId }
        val finalGateMatches = playFinalGate(request, finalBest, nextSeed)
        val finalPromotionDecision = decideFinalPromotion(finalBest.id, finalGateMatches, request.promotionThresholds)

        return MachineLearnedEvolutionResultBundle(
            bestModel = finalBest.model,
            report = MachineLearnedEvolutionReport(
                ruleConfigurationId = request.ruleConfigurationId,
                generationSummaries = generationSummaries,
                finalGateMatches = finalGateMatches,
                finalPromotionDecision = finalPromotionDecision,
                bestCandidateId = finalBest.id
            )
        )
    }

    private fun initialPopulation(
        request: MachineLearnedEvolutionRequest,
        random: SeededRandomIndexSource,
        idFactory: () -> String
    ): List<EvolutionCandidate> {
        val candidates = mutableListOf<EvolutionCandidate>()
        candidates += EvolutionCandidate(
            id = idFactory(),
            generation = 0,
            origin = MachineLearnedCandidateOrigin.incumbent,
            parentIds = emptyList(),
            model = refreshedModel(request.incumbentModel)
        )
        request.seedModel?.let { seedModel ->
            candidates += EvolutionCandidate(
                id = idFactory(),
                generation = 0,
                origin = MachineLearnedCandidateOrigin.seed,
                parentIds = emptyList(),
                model = refreshedModel(seedModel)
            )
        }

        while (candidates.size < request.populationSize) {
            val parent = candidates[random.nextInt(candidates.size)]
            candidates += mutate(
                request = request,
                parent = parent,
                generation = 0,
                id = idFactory(),
                random = random
            )
        }

        return candidates
    }

    private fun nextGeneration(
        request: MachineLearnedEvolutionRequest,
        generation: Int,
        survivors: List<EvolutionCandidate>,
        random: SeededRandomIndexSource,
        idFactory: () -> String
    ): List<EvolutionCandidate> {
        val next = survivors
            .take(request.eliteCount)
            .map { survivor ->
                survivor.copy(
                    id = idFactory(),
                    generation = generation,
                    origin = survivor.origin,
                    parentIds = listOf(survivor.id),
                    model = refreshedModel(survivor.model)
                )
            }
            .toMutableList()

        while (next.size < request.populationSize) {
            val parentAIndex = random.nextInt(survivors.size)
            val parentA = survivors[parentAIndex]
            val child = if (survivors.size > 1 && random.nextUnitDouble() < request.crossoverRate) {
                val parentBIndex = differentIndex(parentAIndex, survivors.size, random)
                val parentB = survivors[parentBIndex]
                crossover(request, parentA, parentB, generation, idFactory(), random)
            } else {
                mutate(request, parentA, generation, idFactory(), random)
            }
            next += child
        }

        return next
    }

    private fun mutate(
        request: MachineLearnedEvolutionRequest,
        parent: EvolutionCandidate,
        generation: Int,
        id: String,
        random: SeededRandomIndexSource
    ): EvolutionCandidate =
        EvolutionCandidate(
            id = id,
            generation = generation,
            origin = MachineLearnedCandidateOrigin.mutation,
            parentIds = listOf(parent.id),
            model = parent.model.copy(
                metadata = refreshedMetadata(parent.model),
                weights = parent.model.weights.map { weight -> maybeMutateWeight(weight, request, random) }
            )
        )

    private fun crossover(
        request: MachineLearnedEvolutionRequest,
        parentA: EvolutionCandidate,
        parentB: EvolutionCandidate,
        generation: Int,
        id: String,
        random: SeededRandomIndexSource
    ): EvolutionCandidate =
        EvolutionCandidate(
            id = id,
            generation = generation,
            origin = MachineLearnedCandidateOrigin.crossover,
            parentIds = listOf(parentA.id, parentB.id),
            model = parentA.model.copy(
                metadata = refreshedMetadata(parentA.model),
                weights = parentA.model.weights.indices.map { index ->
                    val blend = random.nextUnitFloat()
                    val blended = parentA.model.weights[index] * blend + parentB.model.weights[index] * (1f - blend)
                    maybeMutateWeight(blended, request, random)
                }
            )
        )

    private fun maybeMutateWeight(
        weight: Float,
        request: MachineLearnedEvolutionRequest,
        random: SeededRandomIndexSource
    ): Float {
        if (random.nextUnitDouble() >= request.mutationRate) {
            return weight
        }
        val mutationMagnitude = max(0.01f, abs(weight) * request.mutationScale)
        return weight + random.nextSignedFloat() * mutationMagnitude
    }

    private fun playGeneration(
        request: MachineLearnedEvolutionRequest,
        population: List<EvolutionCandidate>,
        initialSeed: Int
    ): List<MachineLearnedEvolutionMatch> {
        val matches = mutableListOf<MachineLearnedEvolutionMatch>()
        var nextSeed = initialSeed

        for (firstIndex in population.indices) {
            for (secondIndex in firstIndex + 1 until population.size) {
                val first = population[firstIndex].participant(request.ruleConfigurationId)
                val second = population[secondIndex].participant(request.ruleConfigurationId)
                repeat(request.gamesPerPairing) {
                    matches += play(request, first, second, nextSeed++)
                    matches += play(request, second, first, nextSeed++)
                }
            }
        }

        request.baselineBotIds.forEach { baselineBotId ->
            population.forEach { candidate ->
                repeat(request.gamesPerPairing) {
                    val baseline = baselineParticipant(request, baselineBotId, nextSeed + 10_000)
                    val candidateParticipant = candidate.participant(request.ruleConfigurationId)
                    matches += play(request, candidateParticipant, baseline, nextSeed++)
                    matches += play(request, baseline, candidateParticipant, nextSeed++)
                }
            }
        }

        return matches
    }

    private fun playFinalGate(
        request: MachineLearnedEvolutionRequest,
        candidate: EvolutionCandidate,
        initialSeed: Int
    ): List<MachineLearnedEvolutionMatch> {
        val matches = mutableListOf<MachineLearnedEvolutionMatch>()
        var nextSeed = initialSeed
        val candidateParticipant = candidate.participant(request.ruleConfigurationId)
        val incumbent = LeagueParticipant(
            type = MachineLearnedEvolutionParticipantType.incumbent,
            id = "incumbent",
            strategy = MachineLearnedBotStrategy(mapOf(request.ruleConfigurationId to request.incumbentModel))
        )

        repeat(request.finalGateGamesPerPairing) {
            matches += play(request, candidateParticipant, incumbent, nextSeed++)
            matches += play(request, incumbent, candidateParticipant, nextSeed++)
        }
        request.baselineBotIds.forEach { baselineBotId ->
            repeat(request.finalGateGamesPerPairing) {
                val baseline = baselineParticipant(request, baselineBotId, nextSeed + 10_000)
                matches += play(request, candidateParticipant, baseline, nextSeed++)
                matches += play(request, baseline, candidateParticipant, nextSeed++)
            }
        }

        return matches
    }

    private fun play(
        request: MachineLearnedEvolutionRequest,
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        seed: Int
    ): MachineLearnedEvolutionMatch {
        val openingRandom = SeededRandomIndexSource(seed + 30_000)
        var snapshot = GameRules.startGame(request.ruleConfigurationId)

        repeat(request.maxPliesPerGame) { plyIndex ->
            if (snapshot.turns.lastOrNull()?.type == TurnType.gameOver) {
                return completedMatch(request, dragons, ravens, seed, snapshot)
            }
            require(snapshot.phase == Phase.move) {
                "Machine-learned evolution only supports move-phase turns."
            }

            val legalMoves = GameRules.getLegalMoves(snapshot)
            if (legalMoves.isEmpty()) {
                snapshot = GameRules.endGame(snapshot, "Evolution stopped: no legal moves")
                return completedMatch(request, dragons, ravens, seed, snapshot)
            }

            val selectedMove = if (plyIndex < request.openingRandomPlies) {
                legalMoves[openingRandom.nextInt(legalMoves.size)]
            } else {
                when (snapshot.activeSide) {
                    Side.dragons -> dragons.strategy
                    Side.ravens -> ravens.strategy
                }.chooseMove(snapshot, legalMoves)
            }
            snapshot = GameRules.movePiece(snapshot, selectedMove.origin, selectedMove.destination)
        }

        return completedMatch(
            request = request,
            dragons = dragons,
            ravens = ravens,
            seed = seed,
            snapshot = GameRules.endGame(snapshot, "Evolution draw by ply limit")
        )
    }

    private fun completedMatch(
        request: MachineLearnedEvolutionRequest,
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        seed: Int,
        snapshot: GameSnapshot
    ): MachineLearnedEvolutionMatch {
        val outcome = snapshot.turns.lastOrNull()?.outcome ?: "Unknown"
        return MachineLearnedEvolutionMatch(
            ruleConfigurationId = request.ruleConfigurationId,
            dragonsType = dragons.type,
            ravensType = ravens.type,
            dragonsId = dragons.id,
            ravensId = ravens.id,
            seed = seed,
            openingRandomPlies = request.openingRandomPlies,
            turnCount = snapshot.turns.size,
            outcome = outcome,
            candidateResults = candidateResults(dragons, ravens, outcome)
        )
    }

    private fun candidateResults(
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        outcome: String
    ): Map<String, MachineLearnedEvolutionResult> {
        val results = mutableMapOf<String, MachineLearnedEvolutionResult>()
        if (dragons.type == MachineLearnedEvolutionParticipantType.candidate) {
            results[dragons.id] = resultFor(Side.dragons, outcome)
        }
        if (ravens.type == MachineLearnedEvolutionParticipantType.candidate) {
            results[ravens.id] = resultFor(Side.ravens, outcome)
        }
        return results
    }

    private fun resultFor(candidateSide: Side, outcome: String): MachineLearnedEvolutionResult =
        when (outcome) {
            "Dragons win" -> if (candidateSide == Side.dragons) {
                MachineLearnedEvolutionResult.win
            } else {
                MachineLearnedEvolutionResult.loss
            }
            "Ravens win" -> if (candidateSide == Side.ravens) {
                MachineLearnedEvolutionResult.win
            } else {
                MachineLearnedEvolutionResult.loss
            }
            else -> MachineLearnedEvolutionResult.draw
        }

    private fun scorePopulation(
        population: List<EvolutionCandidate>,
        matches: List<MachineLearnedEvolutionMatch>
    ): List<ScoredCandidate> =
        population.map { candidate ->
            val results = matches.mapNotNull { match -> match.candidateResults[candidate.id] }
            val wins = results.count { result -> result == MachineLearnedEvolutionResult.win }
            val losses = results.count { result -> result == MachineLearnedEvolutionResult.loss }
            val draws = results.count { result -> result == MachineLearnedEvolutionResult.draw }
            val score = wins.toDouble() + draws.toDouble() * 0.5 - losses.toDouble() * 0.15
            ScoredCandidate(candidate, score, wins, losses, draws)
        }

    private fun decideFinalPromotion(
        candidateId: String,
        matches: List<MachineLearnedEvolutionMatch>,
        thresholds: MachineLearnedEvolutionPromotionThresholds
    ): MachineLearnedEvolutionPromotionDecision {
        val results = matches.mapNotNull { match -> match.candidateResults[candidateId] }
        val wins = results.count { result -> result == MachineLearnedEvolutionResult.win }
        val losses = results.count { result -> result == MachineLearnedEvolutionResult.loss }
        val draws = results.count { result -> result == MachineLearnedEvolutionResult.draw }
        val total = results.size
        val winRate = if (total == 0) 0.0 else wins.toDouble() / total
        val lossRate = if (total == 0) 1.0 else losses.toDouble() / total
        val promote = total > 0 &&
            winRate >= thresholds.minimumWinRate &&
            lossRate <= thresholds.maximumLossRate
        val reason = if (promote) {
            "Best evolved candidate cleared the final incumbent and baseline gate."
        } else {
            "Best evolved candidate did not clear the final incumbent and baseline gate."
        }

        return MachineLearnedEvolutionPromotionDecision(
            promote = promote,
            candidateWins = wins,
            candidateLosses = losses,
            candidateDraws = draws,
            winRate = winRate,
            lossRate = lossRate,
            reason = reason
        )
    }

    private fun baselineParticipant(
        request: MachineLearnedEvolutionRequest,
        baselineBotId: String,
        seed: Int
    ): LeagueParticipant =
        LeagueParticipant(
            type = MachineLearnedEvolutionParticipantType.baseline,
            id = baselineBotId,
            strategy = baselineRegistryFactory(seed)
                .requireSupportedDefinition(baselineBotId, request.ruleConfigurationId)
                .strategy
        )

    private fun EvolutionCandidate.participant(ruleConfigurationId: String): LeagueParticipant =
        LeagueParticipant(
            type = MachineLearnedEvolutionParticipantType.candidate,
            id = id,
            strategy = MachineLearnedBotStrategy(mapOf(ruleConfigurationId to model))
        )

    private fun refreshedModel(model: MachineLearnedModel): MachineLearnedModel =
        model.copy(metadata = refreshedMetadata(model))

    private fun refreshedMetadata(model: MachineLearnedModel): MachineLearnedModelMetadata =
        model.metadata.copy(trainedAt = clock.instant())

    private fun validate(request: MachineLearnedEvolutionRequest) {
        require(request.ruleConfigurationId.isNotBlank()) {
            "Machine-learned evolution ruleConfigurationId must be non-empty."
        }
        val summary = GameRules.getRuleConfigurationSummary(request.ruleConfigurationId)
        require(!summary.hasManualCapture) {
            "Machine-learned evolution does not support manual capture rulesets."
        }
        require(!summary.hasManualEndGame) {
            "Machine-learned evolution does not support manual end-game rulesets."
        }
        validateModel("Incumbent", request.incumbentModel, request.ruleConfigurationId)
        request.seedModel?.let { seedModel ->
            validateModel("Seed", seedModel, request.ruleConfigurationId)
        }
        require(request.populationSize >= 2) {
            "Machine-learned evolution populationSize must be at least 2."
        }
        require(request.survivorCount in 1..request.populationSize) {
            "Machine-learned evolution survivorCount must be between 1 and populationSize."
        }
        require(request.generations > 0) {
            "Machine-learned evolution generations must be positive."
        }
        require(request.gamesPerPairing > 0) {
            "Machine-learned evolution gamesPerPairing must be positive."
        }
        require(request.maxPliesPerGame > 0) {
            "Machine-learned evolution maxPliesPerGame must be positive."
        }
        require(request.openingRandomPlies >= 0) {
            "Machine-learned evolution openingRandomPlies must not be negative."
        }
        require(request.mutationRate in 0.0..1.0) {
            "Machine-learned evolution mutationRate must be between 0 and 1."
        }
        require(request.mutationScale >= 0f) {
            "Machine-learned evolution mutationScale must not be negative."
        }
        require(request.crossoverRate in 0.0..1.0) {
            "Machine-learned evolution crossoverRate must be between 0 and 1."
        }
        require(request.eliteCount in 0..request.survivorCount) {
            "Machine-learned evolution eliteCount must be between 0 and survivorCount."
        }
        require(request.finalGateGamesPerPairing > 0) {
            "Machine-learned evolution finalGateGamesPerPairing must be positive."
        }
        require(request.promotionThresholds.minimumWinRate in 0.0..1.0) {
            "Machine-learned evolution minimumWinRate must be between 0 and 1."
        }
        require(request.promotionThresholds.maximumLossRate in 0.0..1.0) {
            "Machine-learned evolution maximumLossRate must be between 0 and 1."
        }
    }

    private fun validateModel(
        label: String,
        model: MachineLearnedModel,
        ruleConfigurationId: String
    ) {
        require(model.metadata.ruleConfigurationId == ruleConfigurationId) {
            "$label artifact is for ${model.metadata.ruleConfigurationId}, not $ruleConfigurationId."
        }
        require(model.metadata.featureSchemaVersion == MachineLearnedFeatureEncoder.schemaVersion) {
            "$label artifact feature schema ${model.metadata.featureSchemaVersion} does not match encoder schema ${MachineLearnedFeatureEncoder.schemaVersion}."
        }
        require(model.modelType == MachineLearnedMoveScorer.supportedModelType) {
            "$label artifact model type ${model.modelType} is not supported for evolution."
        }
        require(model.weights.size == MachineLearnedFeatureEncoder.featureCount) {
            "$label artifact weight count ${model.weights.size} does not match encoder feature count ${MachineLearnedFeatureEncoder.featureCount}."
        }
    }

    private data class EvolutionCandidate(
        val id: String,
        val generation: Int,
        val origin: MachineLearnedCandidateOrigin,
        val parentIds: List<String>,
        val model: MachineLearnedModel
    )

    private data class ScoredCandidate(
        val candidate: EvolutionCandidate,
        val score: Double,
        val wins: Int,
        val losses: Int,
        val draws: Int
    ) {
        fun summary(): MachineLearnedCandidateSummary =
            MachineLearnedCandidateSummary(
                id = candidate.id,
                generation = candidate.generation,
                origin = candidate.origin,
                parentIds = candidate.parentIds,
                score = score,
                wins = wins,
                losses = losses,
                draws = draws
            )
    }

    private data class LeagueParticipant(
        val type: MachineLearnedEvolutionParticipantType,
        val id: String,
        val strategy: GameBotStrategy
    )

    private companion object {
        fun List<ScoredCandidate>.sortedByRank(): List<ScoredCandidate> =
            sortedWith(compareByDescending<ScoredCandidate> { it.score }.thenBy { it.candidate.id })

        fun differentIndex(
            index: Int,
            size: Int,
            random: SeededRandomIndexSource
        ): Int {
            require(size > 1) { "Cannot choose a distinct index from fewer than two items." }
            val offset = random.nextInt(size - 1) + 1
            return (index + offset) % size
        }
    }
}

private fun SeededRandomIndexSource.nextUnitFloat(): Float =
    nextInt(1_000_001) / 1_000_000f

private fun SeededRandomIndexSource.nextUnitDouble(): Double =
    nextInt(1_000_001) / 1_000_000.0

private fun SeededRandomIndexSource.nextSignedFloat(): Float =
    nextUnitFloat() * 2f - 1f
