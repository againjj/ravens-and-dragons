package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import java.time.Clock
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max

enum class MachineTrainedEvolutionParticipantType {
    candidate,
    incumbent,
    baseline
}

enum class MachineTrainedEvolutionResult {
    win,
    loss,
    draw
}

enum class MachineTrainedCandidateOrigin {
    incumbent,
    seed,
    mutation,
    crossover
}

data class MachineTrainedEvolutionPromotionThresholds(
    val minimumWinRate: Double = 0.55,
    val maximumLossRate: Double = 0.35
)

data class MachineTrainedEvolutionRequest(
    val ruleConfigurationId: String,
    val incumbentModel: MachineTrainedModel,
    val seedModels: List<MachineTrainedModel> = emptyList(),
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
    val survivorComparisonGamesPerPairing: Int = 4,
    val workerCount: Int = defaultTrainingWorkerCount(),
    val promotionThresholds: MachineTrainedEvolutionPromotionThresholds = MachineTrainedEvolutionPromotionThresholds()
)

data class MachineTrainedEvolutionReport(
    val ruleConfigurationId: String,
    val generationSummaries: List<MachineTrainedGenerationSummary>,
    val survivorComparisonMatches: List<MachineTrainedEvolutionMatch>,
    val survivorComparisonRankings: List<MachineTrainedEvolutionRanking>,
    val finalPromotionDecision: MachineTrainedEvolutionPromotionDecision,
    val bestCandidateId: String
)

data class MachineTrainedEvolutionResultBundle(
    val bestModel: MachineTrainedModel,
    val survivorModels: List<MachineTrainedEvolutionSurvivorModel>,
    val report: MachineTrainedEvolutionReport
)

data class MachineTrainedEvolutionSurvivorModel(
    val candidateId: String,
    val model: MachineTrainedModel
)

data class MachineTrainedGenerationSummary(
    val generation: Int,
    val candidates: List<MachineTrainedCandidateSummary>,
    val matches: List<MachineTrainedEvolutionMatch>,
    val survivorIds: List<String>,
    val bestCandidateId: String
)

data class MachineTrainedCandidateSummary(
    val id: String,
    val generation: Int,
    val origin: MachineTrainedCandidateOrigin,
    val parentIds: List<String>,
    val score: Double,
    val wins: Int,
    val losses: Int,
    val draws: Int
)

data class MachineTrainedEvolutionMatch(
    val ruleConfigurationId: String,
    val dragonsType: MachineTrainedEvolutionParticipantType,
    val ravensType: MachineTrainedEvolutionParticipantType,
    val dragonsId: String,
    val ravensId: String,
    val seed: Int,
    val openingRandomPlies: Int,
    val turnCount: Int,
    val outcome: String,
    val candidateResults: Map<String, MachineTrainedEvolutionResult>
)

data class MachineTrainedEvolutionPromotionDecision(
    val promote: Boolean,
    val candidateWins: Int,
    val candidateLosses: Int,
    val candidateDraws: Int,
    val winRate: Double,
    val lossRate: Double,
    val reason: String
)

data class MachineTrainedEvolutionRanking(
    val rank: Int,
    val participantType: MachineTrainedEvolutionParticipantType,
    val participantId: String,
    val score: Double,
    val wins: Int,
    val losses: Int,
    val draws: Int
)

class MachineTrainedEvolutionLoop(
    private val clock: Clock = Clock.systemUTC(),
    private val progressListener: TrainingProgressListener = TrainingProgressListener { _, _ -> },
    private val baselineRegistryFactory: (Int) -> BotRegistry = { seed -> BotRegistry(SeededRandomIndexSource(seed)) }
) {
    fun run(request: MachineTrainedEvolutionRequest): MachineTrainedEvolutionResultBundle {
        validate(request)

        val random = SeededRandomIndexSource(request.initialSeed)
        var nextSeed = request.initialSeed
        var nextCandidateIndex = 1
        var population = initialPopulation(request, random) { "g0-c${nextCandidateIndex++}" }
        val generationSummaries = mutableListOf<MachineTrainedGenerationSummary>()
        val progressTotal = totalMatchCount(request)
        var progressCompleted = 0
        var finalSurvivors = emptyList<EvolutionCandidate>()

        repeat(request.generations) { generation ->
            val generationTasks = buildGenerationTasks(request, population, nextSeed)
            val matches = playTasks(request, generationTasks, progressCompleted, progressTotal)
            progressCompleted += generationTasks.size
            nextSeed += matches.size
            val scored = scorePopulation(population, matches)
            val ranked = scored.sortedByRank()
            val survivors = ranked.take(request.survivorCount)
            val best = survivors.first().candidate
            finalSurvivors = survivors.map(ScoredCandidate::candidate)

            generationSummaries += MachineTrainedGenerationSummary(
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

        val comparisonTasks = buildSurvivorComparisonTasks(request, finalSurvivors, nextSeed)
        val comparisonMatches = playTasks(request, comparisonTasks, progressCompleted, progressTotal)
        val comparisonRankings = rankComparisonParticipants(comparisonTasks, comparisonMatches)
        val finalBest = bestSurvivorComparisonCandidate(finalSurvivors, comparisonRankings)
        val finalPromotionDecision = decideFinalPromotion(
            candidateId = finalBest.id,
            rankings = comparisonRankings,
            matches = comparisonMatches,
            thresholds = request.promotionThresholds
        )

        return MachineTrainedEvolutionResultBundle(
            bestModel = finalBest.model,
            survivorModels = finalSurvivors.map { survivor ->
                MachineTrainedEvolutionSurvivorModel(
                    candidateId = survivor.id,
                    model = survivor.model
                )
            },
            report = MachineTrainedEvolutionReport(
                ruleConfigurationId = request.ruleConfigurationId,
                generationSummaries = generationSummaries,
                survivorComparisonMatches = comparisonMatches,
                survivorComparisonRankings = comparisonRankings,
                finalPromotionDecision = finalPromotionDecision,
                bestCandidateId = finalBest.id
            )
        )
    }

    private fun bestSurvivorComparisonCandidate(
        survivors: List<EvolutionCandidate>,
        rankings: List<MachineTrainedEvolutionRanking>
    ): EvolutionCandidate {
        val bestCandidateRanking = requireNotNull(
            rankings.firstOrNull { ranking ->
                ranking.participantType == MachineTrainedEvolutionParticipantType.candidate
            }
        ) {
            "Machine-trained evolution survivor comparison produced no candidate ranking."
        }
        return survivors.first { survivor -> survivor.id == bestCandidateRanking.participantId }
    }

    private fun initialPopulation(
        request: MachineTrainedEvolutionRequest,
        random: SeededRandomIndexSource,
        idFactory: () -> String
    ): List<EvolutionCandidate> {
        val candidates = mutableListOf<EvolutionCandidate>()
        candidates += EvolutionCandidate(
            id = idFactory(),
            generation = 0,
            origin = MachineTrainedCandidateOrigin.incumbent,
            parentIds = emptyList(),
            model = refreshedModel(request.incumbentModel)
        )
        request.seedModels.forEach { seedModel ->
            candidates += EvolutionCandidate(
                id = idFactory(),
                generation = 0,
                origin = MachineTrainedCandidateOrigin.seed,
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
        request: MachineTrainedEvolutionRequest,
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
        request: MachineTrainedEvolutionRequest,
        parent: EvolutionCandidate,
        generation: Int,
        id: String,
        random: SeededRandomIndexSource
    ): EvolutionCandidate =
        EvolutionCandidate(
            id = id,
            generation = generation,
            origin = MachineTrainedCandidateOrigin.mutation,
            parentIds = listOf(parent.id),
            model = parent.model.copy(
                metadata = refreshedMetadata(parent.model),
                weights = parent.model.weights.map { weight -> maybeMutateWeight(weight, request, random) }
            )
        )

    private fun crossover(
        request: MachineTrainedEvolutionRequest,
        parentA: EvolutionCandidate,
        parentB: EvolutionCandidate,
        generation: Int,
        id: String,
        random: SeededRandomIndexSource
    ): EvolutionCandidate =
        EvolutionCandidate(
            id = id,
            generation = generation,
            origin = MachineTrainedCandidateOrigin.crossover,
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
        request: MachineTrainedEvolutionRequest,
        random: SeededRandomIndexSource
    ): Float {
        if (random.nextUnitDouble() >= request.mutationRate) {
            return weight
        }
        val mutationMagnitude = max(0.01f, abs(weight) * request.mutationScale)
        return weight + random.nextSignedFloat() * mutationMagnitude
    }

    private fun buildGenerationTasks(
        request: MachineTrainedEvolutionRequest,
        population: List<EvolutionCandidate>,
        initialSeed: Int
    ): List<MatchTask> {
        val tasks = mutableListOf<MatchTask>()
        var nextSeed = initialSeed
        var nextIndex = 0

        for (firstIndex in population.indices) {
            for (secondIndex in firstIndex + 1 until population.size) {
                val first = population[firstIndex].participantDefinition()
                val second = population[secondIndex].participantDefinition()
                repeat(request.gamesPerPairing) {
                    tasks += MatchTask(nextIndex++, nextSeed, first, second)
                    nextSeed++
                    tasks += MatchTask(nextIndex++, nextSeed, second, first)
                    nextSeed++
                }
            }
        }

        return tasks
    }

    private fun buildSurvivorComparisonTasks(
        request: MachineTrainedEvolutionRequest,
        survivors: List<EvolutionCandidate>,
        initialSeed: Int
    ): List<MatchTask> {
        val tasks = mutableListOf<MatchTask>()
        var nextSeed = initialSeed
        var nextIndex = 0
        val participants = buildList {
            addAll(survivors.map { survivor -> survivor.participantDefinition() })
            add(
                LeagueParticipantDefinition(
                    type = MachineTrainedEvolutionParticipantType.incumbent,
                    id = "incumbent",
                    model = request.incumbentModel
                )
            )
            addAll(request.baselineBotIds.mapIndexed { index, baselineBotId ->
                baselineDefinition(baselineBotId, index)
            })
        }

        for (firstIndex in participants.indices) {
            for (secondIndex in firstIndex + 1 until participants.size) {
                val first = participants[firstIndex]
                val second = participants[secondIndex]
                repeat(request.survivorComparisonGamesPerPairing) {
                    tasks += MatchTask(nextIndex++, nextSeed, first, second)
                    nextSeed++
                    tasks += MatchTask(nextIndex++, nextSeed, second, first)
                    nextSeed++
                }
            }
        }

        return tasks
    }

    private fun playTasks(
        request: MachineTrainedEvolutionRequest,
        tasks: List<MatchTask>,
        alreadyCompleted: Int,
        totalMatches: Int
    ): List<MachineTrainedEvolutionMatch> {
        if (tasks.isEmpty()) {
            return emptyList()
        }
        val workerCount = minOf(request.workerCount, tasks.size)
        val results = if (workerCount <= 1) {
            tasks.mapIndexed { index, task ->
                playTask(request, task).also {
                    progressListener.report(alreadyCompleted + index + 1, totalMatches)
                }
            }
        } else {
            val executor = Executors.newFixedThreadPool(workerCount)
            try {
                val completionService = ExecutorCompletionService<MatchResult>(executor)
                tasks.forEach { task ->
                    completionService.submit(Callable { playTask(request, task) })
                }
                (1..tasks.size).map { completed ->
                    completionService.take().get().also {
                        progressListener.report(alreadyCompleted + completed, totalMatches)
                    }
                }
            } finally {
                executor.shutdown()
            }
        }

        return results
            .sortedBy(MatchResult::index)
            .map(MatchResult::match)
    }

    private fun playTask(
        request: MachineTrainedEvolutionRequest,
        task: MatchTask
    ): MatchResult =
        MatchResult(
            index = task.index,
            match = play(
                request = request,
                dragons = participant(task.dragons, request, task.seed),
                ravens = participant(task.ravens, request, task.seed),
                seed = task.seed
            )
        )

    private fun totalMatchCount(request: MachineTrainedEvolutionRequest): Int {
        val candidatePairings = request.populationSize * (request.populationSize - 1) / 2
        val generationMatches = candidatePairings * request.gamesPerPairing * 2 * request.generations
        val comparisonParticipantCount = request.survivorCount + 1 + request.baselineBotIds.size
        val comparisonPairings = comparisonParticipantCount * (comparisonParticipantCount - 1) / 2
        val comparisonMatches = comparisonPairings * request.survivorComparisonGamesPerPairing * 2
        return generationMatches + comparisonMatches
    }

    private fun participant(
        definition: LeagueParticipantDefinition,
        request: MachineTrainedEvolutionRequest,
        matchSeed: Int
    ): LeagueParticipant {
        val strategy = when (definition.type) {
            MachineTrainedEvolutionParticipantType.candidate,
            MachineTrainedEvolutionParticipantType.incumbent -> MachineTrainedBotStrategy(
                mapOf(request.ruleConfigurationId to requireNotNull(definition.model))
            )
            MachineTrainedEvolutionParticipantType.baseline -> baselineRegistryFactory(
                matchSeed + 10_000 + requireNotNull(definition.baselineSeedOffset)
            )
                .requireSupportedDefinition(definition.id, request.ruleConfigurationId)
                .strategy
        }
        return LeagueParticipant(definition.type, definition.id, strategy)
    }

    private fun play(
        request: MachineTrainedEvolutionRequest,
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        seed: Int
    ): MachineTrainedEvolutionMatch {
        val openingRandom = SeededRandomIndexSource(seed + 30_000)
        var snapshot = GameRules.startGame(request.ruleConfigurationId)

        repeat(request.maxPliesPerGame) { plyIndex ->
            if (snapshot.turns.lastOrNull()?.type == TurnType.gameOver) {
                return completedMatch(request, dragons, ravens, seed, snapshot)
            }
            require(snapshot.phase == Phase.move) {
                "Machine-trained evolution only supports move-phase turns."
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
        request: MachineTrainedEvolutionRequest,
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        seed: Int,
        snapshot: GameSnapshot
    ): MachineTrainedEvolutionMatch {
        val outcome = snapshot.turns.lastOrNull()?.outcome ?: "Unknown"
        return MachineTrainedEvolutionMatch(
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
    ): Map<String, MachineTrainedEvolutionResult> {
        val results = mutableMapOf<String, MachineTrainedEvolutionResult>()
        if (dragons.type == MachineTrainedEvolutionParticipantType.candidate) {
            results[dragons.id] = resultFor(Side.dragons, outcome)
        }
        if (ravens.type == MachineTrainedEvolutionParticipantType.candidate) {
            results[ravens.id] = resultFor(Side.ravens, outcome)
        }
        return results
    }

    private fun scorePopulation(
        population: List<EvolutionCandidate>,
        matches: List<MachineTrainedEvolutionMatch>
    ): List<ScoredCandidate> =
        population.map { candidate ->
            val results = matches.mapNotNull { match -> match.candidateResults[candidate.id] }
            val wins = results.count { result -> result == MachineTrainedEvolutionResult.win }
            val losses = results.count { result -> result == MachineTrainedEvolutionResult.loss }
            val draws = results.count { result -> result == MachineTrainedEvolutionResult.draw }
            val score = wins.toDouble() + draws.toDouble() * 0.5 - losses.toDouble() * 0.15
            ScoredCandidate(candidate, score, wins, losses, draws)
        }

    private fun rankComparisonParticipants(
        tasks: List<MatchTask>,
        matches: List<MachineTrainedEvolutionMatch>
    ): List<MachineTrainedEvolutionRanking> {
        val participants = tasks
            .flatMap { task -> listOf(task.dragons, task.ravens) }
            .distinctBy { participant -> participant.key }
        val scored = participants.map { participant ->
            val results = matches.mapNotNull { match -> participant.resultFrom(match) }
            ScoredParticipant(
                participant = participant,
                wins = results.count { result -> result == MachineTrainedEvolutionResult.win },
                losses = results.count { result -> result == MachineTrainedEvolutionResult.loss },
                draws = results.count { result -> result == MachineTrainedEvolutionResult.draw }
            )
        }.sortedWith(
            compareByDescending<ScoredParticipant> { it.score }
                .thenBy { it.participant.type.name }
                .thenBy { it.participant.id }
        )

        return scored.mapIndexed { index, participant ->
            MachineTrainedEvolutionRanking(
                rank = index + 1,
                participantType = participant.participant.type,
                participantId = participant.participant.id,
                score = participant.score,
                wins = participant.wins,
                losses = participant.losses,
                draws = participant.draws
            )
        }
    }

    private fun decideFinalPromotion(
        candidateId: String,
        rankings: List<MachineTrainedEvolutionRanking>,
        matches: List<MachineTrainedEvolutionMatch>,
        thresholds: MachineTrainedEvolutionPromotionThresholds
    ): MachineTrainedEvolutionPromotionDecision {
        val candidate = LeagueParticipantDefinition(MachineTrainedEvolutionParticipantType.candidate, candidateId)
        val results = matches
            .filter { match -> match.hasParticipant(candidate) }
            .filterNot { match -> match.isCandidateOnly() }
            .map { match -> requireNotNull(candidate.resultFrom(match)) }
        val wins = results.count { result -> result == MachineTrainedEvolutionResult.win }
        val losses = results.count { result -> result == MachineTrainedEvolutionResult.loss }
        val draws = results.count { result -> result == MachineTrainedEvolutionResult.draw }
        val total = results.size
        val winRate = if (total == 0) 0.0 else wins.toDouble() / total
        val lossRate = if (total == 0) 1.0 else losses.toDouble() / total
        val candidateRank = rankings.firstOrNull {
            it.participantType == MachineTrainedEvolutionParticipantType.candidate && it.participantId == candidateId
        }?.rank ?: Int.MAX_VALUE
        val bestNonCandidateRank = rankings
            .filterNot { it.participantType == MachineTrainedEvolutionParticipantType.candidate }
            .minOfOrNull(MachineTrainedEvolutionRanking::rank) ?: Int.MAX_VALUE
        val promote = total > 0 &&
            candidateRank < bestNonCandidateRank &&
            winRate >= thresholds.minimumWinRate &&
            lossRate <= thresholds.maximumLossRate
        val reason = if (promote) {
            "Best evolved candidate ranked above the incumbent and baselines in the survivor comparison league."
        } else {
            "Best evolved candidate did not rank above the incumbent and baselines in the survivor comparison league."
        }

        return MachineTrainedEvolutionPromotionDecision(
            promote = promote,
            candidateWins = wins,
            candidateLosses = losses,
            candidateDraws = draws,
            winRate = winRate,
            lossRate = lossRate,
            reason = reason
        )
    }

    private fun baselineDefinition(
        baselineBotId: String,
        seedOffset: Int
    ): LeagueParticipantDefinition =
        LeagueParticipantDefinition(
            type = MachineTrainedEvolutionParticipantType.baseline,
            id = baselineBotId,
            baselineSeedOffset = seedOffset
        )

    private fun EvolutionCandidate.participantDefinition(): LeagueParticipantDefinition =
        LeagueParticipantDefinition(
            type = MachineTrainedEvolutionParticipantType.candidate,
            id = id,
            model = model
        )

    private fun refreshedModel(model: MachineTrainedModel): MachineTrainedModel =
        model.copy(metadata = refreshedMetadata(model))

    private fun refreshedMetadata(model: MachineTrainedModel): MachineTrainedModelMetadata =
        model.metadata.copy(trainedAt = clock.instant())

    private fun validate(request: MachineTrainedEvolutionRequest) {
        require(request.ruleConfigurationId.isNotBlank()) {
            "Machine-trained evolution ruleConfigurationId must be non-empty."
        }
        val summary = GameRules.getRuleConfigurationSummary(request.ruleConfigurationId)
        require(!summary.hasManualCapture) {
            "Machine-trained evolution does not support manual capture rulesets."
        }
        require(!summary.hasManualEndGame) {
            "Machine-trained evolution does not support manual end-game rulesets."
        }
        validateModel("Incumbent", request.incumbentModel, request.ruleConfigurationId)
        request.seedModels.forEach { seedModel ->
            validateModel("Seed", seedModel, request.ruleConfigurationId)
        }
        require(request.populationSize >= 2) {
            "Machine-trained evolution populationSize must be at least 2."
        }
        require(request.seedModels.size + 1 <= request.populationSize) {
            "Machine-trained evolution seed artifact count plus incumbent must not exceed populationSize."
        }
        require(request.survivorCount in 1..request.populationSize) {
            "Machine-trained evolution survivorCount must be between 1 and populationSize."
        }
        require(request.generations > 0) {
            "Machine-trained evolution generations must be positive."
        }
        require(request.gamesPerPairing > 0) {
            "Machine-trained evolution gamesPerPairing must be positive."
        }
        require(request.maxPliesPerGame > 0) {
            "Machine-trained evolution maxPliesPerGame must be positive."
        }
        require(request.openingRandomPlies >= 0) {
            "Machine-trained evolution openingRandomPlies must not be negative."
        }
        require(request.mutationRate in 0.0..1.0) {
            "Machine-trained evolution mutationRate must be between 0 and 1."
        }
        require(request.mutationScale >= 0f) {
            "Machine-trained evolution mutationScale must not be negative."
        }
        require(request.crossoverRate in 0.0..1.0) {
            "Machine-trained evolution crossoverRate must be between 0 and 1."
        }
        require(request.eliteCount in 0..request.survivorCount) {
            "Machine-trained evolution eliteCount must be between 0 and survivorCount."
        }
        require(request.survivorComparisonGamesPerPairing > 0) {
            "Machine-trained evolution survivorComparisonGamesPerPairing must be positive."
        }
        require(request.workerCount > 0) {
            "Machine-trained evolution workerCount must be positive."
        }
        require(request.promotionThresholds.minimumWinRate in 0.0..1.0) {
            "Machine-trained evolution minimumWinRate must be between 0 and 1."
        }
        require(request.promotionThresholds.maximumLossRate in 0.0..1.0) {
            "Machine-trained evolution maximumLossRate must be between 0 and 1."
        }
    }

    private fun validateModel(
        label: String,
        model: MachineTrainedModel,
        ruleConfigurationId: String
    ) {
        require(model.metadata.ruleConfigurationId == ruleConfigurationId) {
            "$label artifact is for ${model.metadata.ruleConfigurationId}, not $ruleConfigurationId."
        }
        require(model.metadata.featureSchemaVersion == MachineTrainedFeatureEncoder.schemaVersion) {
            "$label artifact feature schema ${model.metadata.featureSchemaVersion} does not match encoder schema ${MachineTrainedFeatureEncoder.schemaVersion}."
        }
        require(model.modelType == MachineTrainedMoveScorer.supportedModelType) {
            "$label artifact model type ${model.modelType} is not supported for evolution."
        }
        require(model.weights.size == MachineTrainedFeatureEncoder.featureCount) {
            "$label artifact weight count ${model.weights.size} does not match encoder feature count ${MachineTrainedFeatureEncoder.featureCount}."
        }
    }

    private data class EvolutionCandidate(
        val id: String,
        val generation: Int,
        val origin: MachineTrainedCandidateOrigin,
        val parentIds: List<String>,
        val model: MachineTrainedModel
    )

    private data class ScoredCandidate(
        val candidate: EvolutionCandidate,
        val score: Double,
        val wins: Int,
        val losses: Int,
        val draws: Int
    ) {
        fun summary(): MachineTrainedCandidateSummary =
            MachineTrainedCandidateSummary(
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
        val type: MachineTrainedEvolutionParticipantType,
        val id: String,
        val strategy: GameBotStrategy
    )

    private data class LeagueParticipantDefinition(
        val type: MachineTrainedEvolutionParticipantType,
        val id: String,
        val model: MachineTrainedModel? = null,
        val baselineSeedOffset: Int? = null
    ) {
        val key: String = "${type.name}:$id"

        fun resultFrom(match: MachineTrainedEvolutionMatch): MachineTrainedEvolutionResult? =
            when {
                match.dragonsType == type && match.dragonsId == id -> resultFor(Side.dragons, match.outcome)
                match.ravensType == type && match.ravensId == id -> resultFor(Side.ravens, match.outcome)
                else -> null
            }
    }

    private data class MatchTask(
        val index: Int,
        val seed: Int,
        val dragons: LeagueParticipantDefinition,
        val ravens: LeagueParticipantDefinition
    )

    private data class MatchResult(
        val index: Int,
        val match: MachineTrainedEvolutionMatch
    )

    private data class ScoredParticipant(
        val participant: LeagueParticipantDefinition,
        val wins: Int,
        val losses: Int,
        val draws: Int
    ) {
        val score: Double = wins.toDouble() + draws.toDouble() * 0.5 - losses.toDouble() * 0.15
    }

    private companion object {
        fun List<ScoredCandidate>.sortedByRank(): List<ScoredCandidate> =
            sortedWith(compareByDescending<ScoredCandidate> { it.score }.thenBy { it.candidate.id })

        fun MachineTrainedEvolutionMatch.hasParticipant(participant: LeagueParticipantDefinition): Boolean =
            (dragonsType == participant.type && dragonsId == participant.id) ||
                (ravensType == participant.type && ravensId == participant.id)

        fun MachineTrainedEvolutionMatch.isCandidateOnly(): Boolean =
            dragonsType == MachineTrainedEvolutionParticipantType.candidate &&
                ravensType == MachineTrainedEvolutionParticipantType.candidate

        fun resultFor(candidateSide: Side, outcome: String): MachineTrainedEvolutionResult =
            when (outcome) {
                "Dragons win" -> if (candidateSide == Side.dragons) {
                    MachineTrainedEvolutionResult.win
                } else {
                    MachineTrainedEvolutionResult.loss
                }
                "Ravens win" -> if (candidateSide == Side.ravens) {
                    MachineTrainedEvolutionResult.win
                } else {
                    MachineTrainedEvolutionResult.loss
                }
                else -> MachineTrainedEvolutionResult.draw
            }

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
