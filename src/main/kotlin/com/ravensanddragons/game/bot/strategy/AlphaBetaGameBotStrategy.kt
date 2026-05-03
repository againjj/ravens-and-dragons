package com.ravensanddragons.game.bot.strategy

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


class AlphaBetaGameBotStrategy(
    private val searchDepth: Int = 4,
    private val searchObserver: MinimaxSearchObserver = NoOpMinimaxSearchObserver
) : GameBotStrategy {
    private data class MutableSearchKey(
        val positionKey: String,
        val depthRemaining: Int,
        val maximizingSide: Side
    )

    private data class MutableEvaluationKey(
        val positionKey: String,
        val perspectiveSide: Side
    )

    private data class OrderedMove(
        val move: LegalMove,
        val index: Int,
        val priority: Int,
        val captureCount: Int
    )

    private data class MutableSearchCaches(
        val legalMovesByPosition: MutableMap<String, List<LegalMove>> = mutableMapOf(),
        val legalMoveCountsByPosition: MutableMap<String, MutableMap<Side, Int>> = mutableMapOf(),
        val evaluationsByPosition: MutableMap<MutableEvaluationKey, Int> = mutableMapOf(),
        val transpositionTable: MutableMap<MutableSearchKey, TranspositionEntry> = mutableMapOf(),
        val historyScoresByMove: MutableMap<HistoryKey, Int> = mutableMapOf()
    )

    private enum class BoundType {
        exact,
        lower,
        upper
    }

    private data class SearchKey(
        val snapshot: GameSnapshot,
        val depthRemaining: Int,
        val maximizingSide: Side
    )

    private data class EvaluationKey(
        val snapshot: GameSnapshot,
        val perspectiveSide: Side
    )

    private data class SearchState(
        val legalMovesBySnapshot: MutableMap<GameSnapshot, List<LegalMove>> = mutableMapOf(),
        val legalMoveCountsBySnapshot: MutableMap<GameSnapshot, Int> = mutableMapOf(),
        val childPositionsBySnapshot: MutableMap<GameSnapshot, List<ChildPosition>> = mutableMapOf(),
        val evaluationsByPosition: MutableMap<EvaluationKey, Int> = mutableMapOf(),
        val transpositionTable: MutableMap<SearchKey, TranspositionEntry> = mutableMapOf(),
        val historyScoresByMove: MutableMap<HistoryKey, Int> = mutableMapOf()
    )

    private data class ChildPosition(
        val move: LegalMove,
        val nextSnapshot: GameSnapshot,
        val index: Int,
        val priority: Int,
        val captureCount: Int
    )

    private data class TranspositionEntry(
        val score: Int,
        val boundType: BoundType,
        val bestMove: LegalMove?
    )

    private data class HistoryKey(
        val side: Side,
        val move: LegalMove
    )

    init {
        require(searchDepth >= 1) { "Alpha-beta bot requires a search depth of at least 1." }
    }

    override fun chooseMove(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        require(legalMoves.isNotEmpty()) { "Alpha-beta bot requires at least one legal move." }

        BotStrategySupport.findImmediateWinningMove(snapshot, legalMoves)?.let { return it }

        if (OriginalStyleMutableSearchState.supports(snapshot) &&
            snapshot.phase == Phase.move &&
            snapshot.pendingMove == null
        ) {
            return chooseMoveWithMutableState(snapshot, legalMoves)
        }

        val maximizingSide = snapshot.activeSide
        val searchState = SearchState()
        searchState.legalMovesBySnapshot[snapshot] = legalMoves
        val orderedMoves = orderMoves(
            snapshot = snapshot,
            searchState = searchState,
            preferredMove = null
        )
        var bestMove = orderedMoves.first()
        var bestScore = minimax(
            snapshot = bestMove.nextSnapshot,
            depthRemaining = searchDepth - 1,
            maximizingSide = maximizingSide,
            alpha = Int.MIN_VALUE,
            beta = Int.MAX_VALUE,
            searchState = searchState
        )
        var alpha = bestScore

        for (index in 1 until orderedMoves.size) {
            val child = orderedMoves[index]
            val score = minimax(
                snapshot = child.nextSnapshot,
                depthRemaining = searchDepth - 1,
                maximizingSide = maximizingSide,
                alpha = alpha,
                beta = Int.MAX_VALUE,
                searchState = searchState
            )
            if (score > bestScore) {
                bestMove = child
                bestScore = score
            }
            if (score > alpha) {
                alpha = score
            }
        }

        return bestMove.move
    }

    private fun chooseMoveWithMutableState(snapshot: GameSnapshot, legalMoves: List<LegalMove>): LegalMove {
        val state = OriginalStyleMutableSearchState.fromSnapshot(snapshot)
        val caches = MutableSearchCaches()
        caches.legalMovesByPosition[state.positionCacheKey()] = legalMoves

        val maximizingSide = snapshot.activeSide
        val orderedMoves = orderMoves(state, caches, preferredMove = null)
        var bestMove = orderedMoves.first()
        var bestScore: Int
        run {
            val undo = state.makeMove(bestMove.move)
            try {
                bestScore = minimax(
                    state = state,
                    depthRemaining = searchDepth - 1,
                    maximizingSide = maximizingSide,
                    alpha = Int.MIN_VALUE,
                    beta = Int.MAX_VALUE,
                    caches = caches
                )
            } finally {
                state.undo(undo)
            }
        }
        var alpha = bestScore

        for (index in 1 until orderedMoves.size) {
            val child = orderedMoves[index]
            val undo = state.makeMove(child.move)
            val score = try {
                minimax(
                    state = state,
                    depthRemaining = searchDepth - 1,
                    maximizingSide = maximizingSide,
                    alpha = alpha,
                    beta = Int.MAX_VALUE,
                    caches = caches
                )
            } finally {
                state.undo(undo)
            }
            if (score > bestScore) {
                bestMove = child
                bestScore = score
            }
            if (score > alpha) {
                alpha = score
            }
        }

        return bestMove.move
    }

    private fun minimax(
        snapshot: GameSnapshot,
        depthRemaining: Int,
        maximizingSide: Side,
        alpha: Int,
        beta: Int,
        searchState: SearchState
    ): Int {
        searchObserver.onNodeEvaluated()

        BotStrategySupport.terminalScore(snapshot, maximizingSide)?.let { return it }

        if (depthRemaining == 0 || snapshot.phase != Phase.move) {
            return evaluateForSide(snapshot, maximizingSide, searchState)
        }

        val searchKey = SearchKey(snapshot, depthRemaining, maximizingSide)
        var currentAlpha = alpha
        var currentBeta = beta
        val cachedEntry = searchState.transpositionTable[searchKey]
        cachedEntry?.let { entry ->
            when (entry.boundType) {
                BoundType.exact -> return entry.score
                BoundType.lower -> currentAlpha = maxOf(currentAlpha, entry.score)
                BoundType.upper -> currentBeta = minOf(currentBeta, entry.score)
            }
            if (currentAlpha >= currentBeta) {
                return entry.score
            }
        }

        val legalMoves = legalMoves(snapshot, searchState)
        if (legalMoves.isEmpty()) {
            return evaluateForSide(snapshot, maximizingSide, searchState)
        }

        val orderedMoves = orderMoves(
            snapshot = snapshot,
            searchState = searchState,
            preferredMove = cachedEntry?.bestMove
        )
        val originalAlpha = currentAlpha
        val originalBeta = currentBeta

        return if (snapshot.activeSide == maximizingSide) {
            var bestScore = Int.MIN_VALUE
            var bestMove = orderedMoves.first().move

            for (child in orderedMoves) {
                val score = minimax(
                    snapshot = child.nextSnapshot,
                    depthRemaining = depthRemaining - 1,
                    maximizingSide = maximizingSide,
                    alpha = currentAlpha,
                    beta = currentBeta,
                    searchState = searchState
                )
                if (score > bestScore) {
                    bestScore = score
                    bestMove = child.move
                }
                if (score > currentAlpha) {
                    currentAlpha = score
                }
                if (currentAlpha >= currentBeta) {
                    recordHistoryScore(snapshot.activeSide, child.move, depthRemaining, searchState)
                    break
                }
            }

            storeTranspositionEntry(
                searchKey = searchKey,
                score = bestScore,
                bestMove = bestMove,
                alpha = originalAlpha,
                beta = originalBeta,
                searchState = searchState
            )
            bestScore
        } else {
            var bestScore = Int.MAX_VALUE
            var bestMove = orderedMoves.first().move

            for (child in orderedMoves) {
                val score = minimax(
                    snapshot = child.nextSnapshot,
                    depthRemaining = depthRemaining - 1,
                    maximizingSide = maximizingSide,
                    alpha = currentAlpha,
                    beta = currentBeta,
                    searchState = searchState
                )
                if (score < bestScore) {
                    bestScore = score
                    bestMove = child.move
                }
                if (score < currentBeta) {
                    currentBeta = score
                }
                if (currentAlpha >= currentBeta) {
                    recordHistoryScore(snapshot.activeSide, child.move, depthRemaining, searchState)
                    break
                }
            }

            storeTranspositionEntry(
                searchKey = searchKey,
                score = bestScore,
                bestMove = bestMove,
                alpha = originalAlpha,
                beta = originalBeta,
                searchState = searchState
            )
            bestScore
        }
    }

    private fun minimax(
        state: OriginalStyleMutableSearchState,
        depthRemaining: Int,
        maximizingSide: Side,
        alpha: Int,
        beta: Int,
        caches: MutableSearchCaches
    ): Int {
        searchObserver.onNodeEvaluated()

        state.terminalOutcome?.let { outcome ->
            return when (outcome) {
                "Dragons win" -> if (maximizingSide == Side.dragons) 1_000_000 else -1_000_000
                "Ravens win" -> if (maximizingSide == Side.ravens) 1_000_000 else -1_000_000
                else -> 0
            }
        }

        if (depthRemaining == 0 || state.phase != Phase.move) {
            return evaluateForSide(state, maximizingSide, caches)
        }

        val searchKey = MutableSearchKey(state.searchCacheKey(), depthRemaining, maximizingSide)
        var currentAlpha = alpha
        var currentBeta = beta
        val cachedEntry = caches.transpositionTable[searchKey]
        cachedEntry?.let { entry ->
            when (entry.boundType) {
                BoundType.exact -> return entry.score
                BoundType.lower -> currentAlpha = maxOf(currentAlpha, entry.score)
                BoundType.upper -> currentBeta = minOf(currentBeta, entry.score)
            }
            if (currentAlpha >= currentBeta) {
                return entry.score
            }
        }

        val legalMoves = legalMoves(state, caches)
        if (legalMoves.isEmpty()) {
            return evaluateForSide(state, maximizingSide, caches)
        }

        val orderedMoves = orderMoves(state, caches, preferredMove = cachedEntry?.bestMove)
        val originalAlpha = currentAlpha
        val originalBeta = currentBeta

        return if (state.activeSide == maximizingSide) {
            var bestScore = Int.MIN_VALUE
            var bestMove = orderedMoves.first().move

            for (orderedMove in orderedMoves) {
                val undo = state.makeMove(orderedMove.move)
                val score = try {
                    minimax(
                        state = state,
                        depthRemaining = depthRemaining - 1,
                        maximizingSide = maximizingSide,
                        alpha = currentAlpha,
                        beta = currentBeta,
                        caches = caches
                    )
                } finally {
                    state.undo(undo)
                }
                if (score > bestScore) {
                    bestScore = score
                    bestMove = orderedMove.move
                }
                if (score > currentAlpha) {
                    currentAlpha = score
                }
                if (currentAlpha >= currentBeta) {
                    recordHistoryScore(state.activeSide, orderedMove.move, depthRemaining, caches.historyScoresByMove)
                    break
                }
            }

            storeTranspositionEntry(
                searchKey = searchKey,
                score = bestScore,
                bestMove = bestMove,
                alpha = originalAlpha,
                beta = originalBeta,
                transpositionTable = caches.transpositionTable
            )
            bestScore
        } else {
            var bestScore = Int.MAX_VALUE
            var bestMove = orderedMoves.first().move

            for (orderedMove in orderedMoves) {
                val undo = state.makeMove(orderedMove.move)
                val score = try {
                    minimax(
                        state = state,
                        depthRemaining = depthRemaining - 1,
                        maximizingSide = maximizingSide,
                        alpha = currentAlpha,
                        beta = currentBeta,
                        caches = caches
                    )
                } finally {
                    state.undo(undo)
                }
                if (score < bestScore) {
                    bestScore = score
                    bestMove = orderedMove.move
                }
                if (score < currentBeta) {
                    currentBeta = score
                }
                if (currentAlpha >= currentBeta) {
                    recordHistoryScore(state.activeSide, orderedMove.move, depthRemaining, caches.historyScoresByMove)
                    break
                }
            }

            storeTranspositionEntry(
                searchKey = searchKey,
                score = bestScore,
                bestMove = bestMove,
                alpha = originalAlpha,
                beta = originalBeta,
                transpositionTable = caches.transpositionTable
            )
            bestScore
        }
    }

    private fun orderMoves(
        snapshot: GameSnapshot,
        searchState: SearchState,
        preferredMove: LegalMove?
    ): List<ChildPosition> {
        val positions = childPositions(snapshot, searchState)
        if (positions.size < 2) {
            return positions
        }

        val orderedPositions = ArrayList<ChildPosition>(positions.size)
        var preferredPosition: ChildPosition? = null
        val winningMoves = ArrayList<ChildPosition>()
        val capturingMoves = ArrayList<ChildPosition>()
        val quietMoves = ArrayList<ChildPosition>()

        for (position in positions) {
            if (position.move == preferredMove) {
                preferredPosition = position
                continue
            }

            when (position.priority) {
                3 -> winningMoves.add(position)
                2 -> capturingMoves.add(position)
                else -> quietMoves.add(position)
            }
        }

        preferredPosition?.let { orderedPositions.add(it) }
        appendHistoryOrderedMoves(winningMoves, orderedPositions, snapshot.activeSide, searchState)
        appendHistoryOrderedMoves(capturingMoves, orderedPositions, snapshot.activeSide, searchState)
        appendHistoryOrderedMoves(quietMoves, orderedPositions, snapshot.activeSide, searchState)

        return orderedPositions
    }

    private fun orderMoves(
        state: OriginalStyleMutableSearchState,
        caches: MutableSearchCaches,
        preferredMove: LegalMove?
    ): List<OrderedMove> {
        val legalMoves = legalMoves(state, caches)
        if (legalMoves.size < 2) {
            return legalMoves.mapIndexed { index, move ->
                OrderedMove(move = move, index = index, priority = 1, captureCount = 0)
            }
        }

        val orderedMoves = ArrayList<OrderedMove>(legalMoves.size)
        var preferredOrderedMove: OrderedMove? = null
        val winningMoves = ArrayList<OrderedMove>()
        val capturingMoves = ArrayList<OrderedMove>()
        val quietMoves = ArrayList<OrderedMove>()

        legalMoves.forEachIndexed { index, move ->
            val mover = state.activeSide
            val undo = state.makeMove(move)
            val orderedMove = try {
                val isWinningMove = when (state.terminalOutcome) {
                    "Dragons win" -> mover == Side.dragons
                    "Ravens win" -> mover == Side.ravens
                    else -> false
                }
                OrderedMove(
                    move = move,
                    index = index,
                    priority = when {
                        isWinningMove -> 3
                        undo.captureCount > 0 -> 2
                        else -> 1
                    },
                    captureCount = undo.captureCount
                )
            } finally {
                state.undo(undo)
            }

            if (move == preferredMove) {
                preferredOrderedMove = orderedMove
            } else {
                when (orderedMove.priority) {
                    3 -> winningMoves.add(orderedMove)
                    2 -> capturingMoves.add(orderedMove)
                    else -> quietMoves.add(orderedMove)
                }
            }
        }

        preferredOrderedMove?.let { orderedMoves.add(it) }
        appendHistoryOrderedMoves(winningMoves, orderedMoves, state.activeSide, caches.historyScoresByMove)
        appendHistoryOrderedMoves(capturingMoves, orderedMoves, state.activeSide, caches.historyScoresByMove)
        appendHistoryOrderedMoves(quietMoves, orderedMoves, state.activeSide, caches.historyScoresByMove)

        return orderedMoves
    }

    private fun childPositions(snapshot: GameSnapshot, searchState: SearchState): List<ChildPosition> =
        searchState.childPositionsBySnapshot.getOrPut(snapshot) {
            legalMoves(snapshot, searchState)
                .mapIndexed { index, move ->
                    val nextSnapshot = applyMove(snapshot, move)
                    val captureCount = BotStrategySupport.capturedOpponentCount(snapshot, nextSnapshot, snapshot.activeSide)
                    ChildPosition(
                        move = move,
                        nextSnapshot = nextSnapshot,
                        index = index,
                        priority = when {
                            BotStrategySupport.isWinningSnapshotFor(nextSnapshot, snapshot.activeSide) -> 3
                            captureCount > 0 -> 2
                            else -> 1
                        },
                        captureCount = captureCount
                    )
                }
        }

    private fun evaluateForSide(
        snapshot: GameSnapshot,
        maximizingSide: Side,
        searchState: SearchState
    ): Int = searchState.evaluationsByPosition.getOrPut(EvaluationKey(snapshot, maximizingSide)) {
        BotStrategySupport.evaluateForSide(snapshot, maximizingSide) { evaluatedSnapshot ->
            countLegalMoves(evaluatedSnapshot, searchState)
        }
    }

    private fun evaluateForSide(
        state: OriginalStyleMutableSearchState,
        maximizingSide: Side,
        caches: MutableSearchCaches
    ): Int {
        val evaluationKey = MutableEvaluationKey(state.positionCacheKey(), maximizingSide)
        return caches.evaluationsByPosition.getOrPut(evaluationKey) {
            state.evaluateForSide(maximizingSide) { side ->
                countLegalMoves(state, side, caches)
            }
        }
    }

    private fun legalMoves(snapshot: GameSnapshot, searchState: SearchState): List<LegalMove> =
        searchState.legalMovesBySnapshot.getOrPut(snapshot) {
            if (OriginalStyleBotSearch.supports(snapshot)) {
                OriginalStyleBotSearch.getLegalMoves(snapshot)
            } else {
                GameRules.getLegalMoves(snapshot)
            }
        }

    private fun countLegalMoves(snapshot: GameSnapshot, searchState: SearchState): Int =
        searchState.legalMoveCountsBySnapshot.getOrPut(snapshot) {
            if (OriginalStyleBotSearch.supports(snapshot)) {
                OriginalStyleBotSearch.countLegalMoves(snapshot)
            } else {
                GameRules.countLegalMoves(snapshot)
            }
        }

    private fun applyMove(snapshot: GameSnapshot, move: LegalMove): GameSnapshot =
        if (OriginalStyleBotSearch.supports(snapshot)) {
            OriginalStyleBotSearch.applyMove(snapshot, move)
        } else {
            BotStrategySupport.applyMove(snapshot, move)
        }

    private fun legalMoves(
        state: OriginalStyleMutableSearchState,
        caches: MutableSearchCaches
    ): List<LegalMove> = caches.legalMovesByPosition.getOrPut(state.positionCacheKey()) { state.legalMoves() }

    private fun countLegalMoves(
        state: OriginalStyleMutableSearchState,
        side: Side,
        caches: MutableSearchCaches
    ): Int {
        val originalActiveSide = state.activeSide
        val originalPhase = state.phase
        val originalOutcome = state.terminalOutcome
        return try {
            if (state.phase != Phase.move || state.terminalOutcome != null || state.activeSide != side) {
                state.phase = Phase.move
                state.activeSide = side
                state.terminalOutcome = null
            }
            val positionKey = state.positionCacheKey()
            val countsBySide = caches.legalMoveCountsByPosition.getOrPut(positionKey) { mutableMapOf() }
            countsBySide.getOrPut(side) { state.countLegalMoves() }
        } finally {
            state.activeSide = originalActiveSide
            state.phase = originalPhase
            state.terminalOutcome = originalOutcome
        }
    }

    private fun storeTranspositionEntry(
        searchKey: SearchKey,
        score: Int,
        bestMove: LegalMove,
        alpha: Int,
        beta: Int,
        searchState: SearchState
    ) {
        val boundType = when {
            score <= alpha -> BoundType.upper
            score >= beta -> BoundType.lower
            else -> BoundType.exact
        }
        searchState.transpositionTable[searchKey] = TranspositionEntry(
            score = score,
            boundType = boundType,
            bestMove = bestMove
        )
    }

    private fun storeTranspositionEntry(
        searchKey: MutableSearchKey,
        score: Int,
        bestMove: LegalMove,
        alpha: Int,
        beta: Int,
        transpositionTable: MutableMap<MutableSearchKey, TranspositionEntry>
    ) {
        val boundType = when {
            score <= alpha -> BoundType.upper
            score >= beta -> BoundType.lower
            else -> BoundType.exact
        }
        transpositionTable[searchKey] = TranspositionEntry(
            score = score,
            boundType = boundType,
            bestMove = bestMove
        )
    }

    private fun historyScore(
        side: Side,
        move: LegalMove,
        searchState: SearchState
    ): Int = searchState.historyScoresByMove[HistoryKey(side, move)] ?: 0

    private fun recordHistoryScore(
        side: Side,
        move: LegalMove,
        depthRemaining: Int,
        searchState: SearchState
    ) {
        val key = HistoryKey(side, move)
        val increment = depthRemaining * depthRemaining
        searchState.historyScoresByMove[key] = historyScore(side, move, searchState) + increment
    }

    private fun recordHistoryScore(
        side: Side,
        move: LegalMove,
        depthRemaining: Int,
        historyScoresByMove: MutableMap<HistoryKey, Int>
    ) {
        val key = HistoryKey(side, move)
        val increment = depthRemaining * depthRemaining
        historyScoresByMove[key] = (historyScoresByMove[key] ?: 0) + increment
    }

    private fun appendHistoryOrderedMoves(
        source: List<ChildPosition>,
        destination: MutableList<ChildPosition>,
        side: Side,
        searchState: SearchState
    ) {
        if (source.isEmpty()) {
            return
        }
        if (source.size == 1) {
            destination.add(source.first())
            return
        }

        source
            .sortedWith(
                compareByDescending<ChildPosition> { historyScore(side, it.move, searchState) }
                    .thenByDescending { it.captureCount }
                    .thenBy { it.index }
            )
            .forEach(destination::add)
    }

    private fun appendHistoryOrderedMoves(
        source: List<OrderedMove>,
        destination: MutableList<OrderedMove>,
        side: Side,
        historyScoresByMove: MutableMap<HistoryKey, Int>
    ) {
        if (source.isEmpty()) {
            return
        }
        if (source.size == 1) {
            destination.add(source.first())
            return
        }

        source
            .sortedWith(
                compareByDescending<OrderedMove> { historyScoresByMove[HistoryKey(side, it.move)] ?: 0 }
                    .thenByDescending { it.captureCount }
                    .thenBy { it.index }
            )
            .forEach(destination::add)
    }
}
