package com.ravensanddragons.training

import com.ravensanddragons.game.BotRegistry
import com.ravensanddragons.game.GameBotStrategy
import com.ravensanddragons.game.GameRules
import com.ravensanddragons.game.GameSnapshot
import com.ravensanddragons.game.MachineLearnedBotStrategy
import com.ravensanddragons.game.MachineLearnedModel
import com.ravensanddragons.game.Phase
import com.ravensanddragons.game.Side
import com.ravensanddragons.game.TurnType

enum class MachineLearnedLeagueBot {
    candidate,
    incumbent,
    baseline,
    candidateSelfPlay
}

enum class CandidateMatchResult {
    win,
    loss,
    draw,
    notApplicable
}

enum class HardPositionSource {
    candidateLoss,
    longGame
}

data class MachineLearnedPromotionThresholds(
    val minimumWinRate: Double = 0.55,
    val maximumLossRate: Double = 0.35
)

data class MachineLearnedStrengtheningRequest(
    val ruleConfigurationId: String,
    val candidateModel: MachineLearnedModel,
    val incumbentModel: MachineLearnedModel,
    val gamesPerPairing: Int = 1,
    val selfPlayGames: Int = 1,
    val baselineBotIds: List<String> = listOf(BotRegistry.minimaxBotId, BotRegistry.deepMinimaxBotId),
    val maxPliesPerGame: Int = 300,
    val openingRandomPlies: Int = 2,
    val initialSeed: Int = 1,
    val longGamePlyThreshold: Int = 120,
    val maxHardPositions: Int = 64,
    val promotionThresholds: MachineLearnedPromotionThresholds = MachineLearnedPromotionThresholds()
)

data class MachineLearnedStrengtheningReport(
    val ruleConfigurationId: String,
    val matches: List<MachineLearnedLeagueMatch>,
    val hardPositions: List<HardPositionReplayCandidate>,
    val promotionDecision: MachineLearnedPromotionDecision
)

data class MachineLearnedLeagueMatch(
    val ruleConfigurationId: String,
    val dragonsBot: MachineLearnedLeagueBot,
    val ravensBot: MachineLearnedLeagueBot,
    val dragonsBotId: String,
    val ravensBotId: String,
    val seed: Int,
    val openingRandomPlies: Int,
    val turnCount: Int,
    val outcome: String,
    val candidateResult: CandidateMatchResult
)

data class HardPositionReplayCandidate(
    val source: HardPositionSource,
    val matchSeed: Int,
    val plyIndex: Int,
    val activeSide: Side,
    val legalMoveCount: Int,
    val positionKey: String
)

data class MachineLearnedPromotionDecision(
    val promote: Boolean,
    val candidateWins: Int,
    val candidateLosses: Int,
    val candidateDraws: Int,
    val winRate: Double,
    val lossRate: Double,
    val reason: String
)

class MachineLearnedStrengtheningLoop(
    private val baselineRegistryFactory: (Int) -> BotRegistry = { seed -> BotRegistry(SeededRandomIndexSource(seed)) }
) {
    fun run(request: MachineLearnedStrengtheningRequest): MachineLearnedStrengtheningReport {
        validate(request)

        val candidateStrategy = MachineLearnedBotStrategy(mapOf(request.ruleConfigurationId to request.candidateModel))
        val incumbentStrategy = MachineLearnedBotStrategy(mapOf(request.ruleConfigurationId to request.incumbentModel))
        val candidate = machineLearnedParticipant(MachineLearnedLeagueBot.candidate, candidateStrategy)
        val incumbent = machineLearnedParticipant(MachineLearnedLeagueBot.incumbent, incumbentStrategy)
        val candidateSelfPlay = machineLearnedParticipant(MachineLearnedLeagueBot.candidateSelfPlay, candidateStrategy)
        val matches = mutableListOf<CompletedLeagueMatch>()
        var nextSeed = request.initialSeed

        repeat(request.gamesPerPairing) {
            matches += play(
                request = request,
                dragons = candidate,
                ravens = incumbent,
                seed = nextSeed++
            )
            matches += play(
                request = request,
                dragons = incumbent,
                ravens = candidate,
                seed = nextSeed++
            )
        }

        request.baselineBotIds.forEach { baselineBotId ->
            repeat(request.gamesPerPairing) {
                val baselineAsRavens = baselineParticipant(request, baselineBotId, nextSeed + 10_000)
                matches += play(
                    request = request,
                    dragons = candidate,
                    ravens = baselineAsRavens,
                    seed = nextSeed++
                )

                val baselineAsDragons = baselineParticipant(request, baselineBotId, nextSeed + 10_000)
                matches += play(
                    request = request,
                    dragons = baselineAsDragons,
                    ravens = candidate,
                    seed = nextSeed++
                )
            }
        }

        repeat(request.selfPlayGames) {
            matches += play(
                request = request,
                dragons = candidateSelfPlay,
                ravens = candidateSelfPlay,
                seed = nextSeed++
            )
        }

        val hardPositions = mineHardPositions(matches, request)
        val publicMatches = matches.map(CompletedLeagueMatch::summary)

        return MachineLearnedStrengtheningReport(
            ruleConfigurationId = request.ruleConfigurationId,
            matches = publicMatches,
            hardPositions = hardPositions,
            promotionDecision = decidePromotion(publicMatches, request.promotionThresholds)
        )
    }

    private fun validate(request: MachineLearnedStrengtheningRequest) {
        require(request.ruleConfigurationId.isNotBlank()) {
            "Machine-learned strengthening ruleConfigurationId must be non-empty."
        }
        require(request.candidateModel.metadata.ruleConfigurationId == request.ruleConfigurationId) {
            "Candidate artifact is for ${request.candidateModel.metadata.ruleConfigurationId}, not ${request.ruleConfigurationId}."
        }
        require(request.incumbentModel.metadata.ruleConfigurationId == request.ruleConfigurationId) {
            "Incumbent artifact is for ${request.incumbentModel.metadata.ruleConfigurationId}, not ${request.ruleConfigurationId}."
        }
        require(request.gamesPerPairing > 0) {
            "Machine-learned strengthening gamesPerPairing must be positive."
        }
        require(request.selfPlayGames >= 0) {
            "Machine-learned strengthening selfPlayGames must not be negative."
        }
        require(request.maxPliesPerGame > 0) {
            "Machine-learned strengthening maxPliesPerGame must be positive."
        }
        require(request.openingRandomPlies >= 0) {
            "Machine-learned strengthening openingRandomPlies must not be negative."
        }
        require(request.longGamePlyThreshold > 0) {
            "Machine-learned strengthening longGamePlyThreshold must be positive."
        }
        require(request.maxHardPositions >= 0) {
            "Machine-learned strengthening maxHardPositions must not be negative."
        }
        require(request.promotionThresholds.minimumWinRate in 0.0..1.0) {
            "Machine-learned strengthening minimumWinRate must be between 0 and 1."
        }
        require(request.promotionThresholds.maximumLossRate in 0.0..1.0) {
            "Machine-learned strengthening maximumLossRate must be between 0 and 1."
        }
    }

    private fun baselineParticipant(
        request: MachineLearnedStrengtheningRequest,
        baselineBotId: String,
        seed: Int
    ): LeagueParticipant =
        LeagueParticipant(
            bot = MachineLearnedLeagueBot.baseline,
            botId = baselineBotId,
            strategy = baselineRegistryFactory(seed)
                .requireSupportedDefinition(baselineBotId, request.ruleConfigurationId)
                .strategy
        )

    private fun machineLearnedParticipant(
        bot: MachineLearnedLeagueBot,
        strategy: GameBotStrategy
    ): LeagueParticipant =
        LeagueParticipant(
            bot = bot,
            botId = BotRegistry.machineLearnedBotId,
            strategy = strategy
        )

    private fun play(
        request: MachineLearnedStrengtheningRequest,
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        seed: Int
    ): CompletedLeagueMatch {
        val sampledPositions = mutableListOf<SelfPlayPosition>()
        val openingRandom = SeededRandomIndexSource(seed + 30_000)
        var snapshot = GameRules.startGame(request.ruleConfigurationId)

        repeat(request.maxPliesPerGame) { plyIndex ->
            if (snapshot.turns.lastOrNull()?.type == TurnType.gameOver) {
                return completedMatch(request, dragons, ravens, seed, snapshot, sampledPositions)
            }
            require(snapshot.phase == Phase.move) {
                "Machine-learned strengthening only supports move-phase turns."
            }

            val legalMoves = GameRules.getLegalMoves(snapshot)
            if (legalMoves.isEmpty()) {
                snapshot = GameRules.endGame(snapshot, "Strengthening stopped: no legal moves")
                return completedMatch(request, dragons, ravens, seed, snapshot, sampledPositions)
            }

            val selectedMove = if (plyIndex < request.openingRandomPlies) {
                legalMoves[openingRandom.nextInt(legalMoves.size)]
            } else {
                val participant = when (snapshot.activeSide) {
                    Side.dragons -> dragons
                    Side.ravens -> ravens
                }
                participant.strategy.chooseMove(snapshot, legalMoves)
            }

            sampledPositions += SelfPlayPosition(
                plyIndex = plyIndex,
                snapshot = snapshot,
                legalMoves = legalMoves.toList()
            )
            snapshot = GameRules.movePiece(snapshot, selectedMove.origin, selectedMove.destination)
        }

        return completedMatch(
            request = request,
            dragons = dragons,
            ravens = ravens,
            seed = seed,
            snapshot = GameRules.endGame(snapshot, "Strengthening draw by ply limit"),
            sampledPositions = sampledPositions
        )
    }

    private fun completedMatch(
        request: MachineLearnedStrengtheningRequest,
        dragons: LeagueParticipant,
        ravens: LeagueParticipant,
        seed: Int,
        snapshot: GameSnapshot,
        sampledPositions: List<SelfPlayPosition>
    ): CompletedLeagueMatch {
        val outcome = snapshot.turns.lastOrNull()?.outcome ?: "Unknown"
        return CompletedLeagueMatch(
            summary = MachineLearnedLeagueMatch(
                ruleConfigurationId = request.ruleConfigurationId,
                dragonsBot = dragons.bot,
                ravensBot = ravens.bot,
                dragonsBotId = dragons.botId,
                ravensBotId = ravens.botId,
                seed = seed,
                openingRandomPlies = request.openingRandomPlies,
                turnCount = snapshot.turns.size,
                outcome = outcome,
                candidateResult = candidateResult(dragons.bot, ravens.bot, outcome)
            ),
            sampledPositions = sampledPositions
        )
    }

    private fun candidateResult(
        dragonsBot: MachineLearnedLeagueBot,
        ravensBot: MachineLearnedLeagueBot,
        outcome: String
    ): CandidateMatchResult {
        val candidateSide = when {
            dragonsBot == MachineLearnedLeagueBot.candidate && ravensBot != MachineLearnedLeagueBot.candidate -> Side.dragons
            ravensBot == MachineLearnedLeagueBot.candidate && dragonsBot != MachineLearnedLeagueBot.candidate -> Side.ravens
            else -> return CandidateMatchResult.notApplicable
        }

        return when (outcome) {
            "Dragons win" -> if (candidateSide == Side.dragons) CandidateMatchResult.win else CandidateMatchResult.loss
            "Ravens win" -> if (candidateSide == Side.ravens) CandidateMatchResult.win else CandidateMatchResult.loss
            else -> CandidateMatchResult.draw
        }
    }

    private fun mineHardPositions(
        matches: List<CompletedLeagueMatch>,
        request: MachineLearnedStrengtheningRequest
    ): List<HardPositionReplayCandidate> =
        matches
            .asSequence()
            .flatMap { match ->
                val source = when {
                    match.summary.candidateResult == CandidateMatchResult.loss -> HardPositionSource.candidateLoss
                    match.summary.turnCount >= request.longGamePlyThreshold -> HardPositionSource.longGame
                    else -> null
                }
                source?.let { hardPositionSource ->
                    match.sampledPositions.asSequence()
                        .filter { position -> position.legalMoves.size > 1 }
                        .map { position ->
                            HardPositionReplayCandidate(
                                source = hardPositionSource,
                                matchSeed = match.summary.seed,
                                plyIndex = position.plyIndex,
                                activeSide = position.snapshot.activeSide,
                                legalMoveCount = position.legalMoves.size,
                                positionKey = trainingPositionKey(position.snapshot, position.legalMoves)
                            )
                        }
                } ?: emptySequence()
            }
            .distinctBy(HardPositionReplayCandidate::positionKey)
            .take(request.maxHardPositions)
            .toList()

    private fun decidePromotion(
        matches: List<MachineLearnedLeagueMatch>,
        thresholds: MachineLearnedPromotionThresholds
    ): MachineLearnedPromotionDecision {
        val candidateMatches = matches.filter { match ->
            match.candidateResult != CandidateMatchResult.notApplicable
        }
        val wins = candidateMatches.count { it.candidateResult == CandidateMatchResult.win }
        val losses = candidateMatches.count { it.candidateResult == CandidateMatchResult.loss }
        val draws = candidateMatches.count { it.candidateResult == CandidateMatchResult.draw }
        val total = candidateMatches.size
        val winRate = if (total == 0) 0.0 else wins.toDouble() / total
        val lossRate = if (total == 0) 1.0 else losses.toDouble() / total
        val promote = total > 0 &&
            winRate >= thresholds.minimumWinRate &&
            lossRate <= thresholds.maximumLossRate
        val reason = if (promote) {
            "Candidate cleared win-rate and loss-rate thresholds."
        } else {
            "Candidate did not clear promotion thresholds."
        }

        return MachineLearnedPromotionDecision(
            promote = promote,
            candidateWins = wins,
            candidateLosses = losses,
            candidateDraws = draws,
            winRate = winRate,
            lossRate = lossRate,
            reason = reason
        )
    }

    private data class LeagueParticipant(
        val bot: MachineLearnedLeagueBot,
        val botId: String,
        val strategy: GameBotStrategy
    )

    private data class CompletedLeagueMatch(
        val summary: MachineLearnedLeagueMatch,
        val sampledPositions: List<SelfPlayPosition>
    )
}
