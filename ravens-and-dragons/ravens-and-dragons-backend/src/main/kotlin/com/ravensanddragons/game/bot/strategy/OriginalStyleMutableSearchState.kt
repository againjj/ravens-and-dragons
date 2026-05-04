package com.ravensanddragons.game.bot.strategy

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import kotlin.math.abs

internal class OriginalStyleMutableSearchState private constructor(
    val ruleConfigurationId: String,
    val boardSize: Int,
    val specialSquare: String,
    private val goldMovesOneSquareAtATime: Boolean,
    private val board: LinkedHashMap<String, Piece>,
    private val positionKeys: MutableList<String>,
    var phase: Phase,
    var activeSide: Side,
    var terminalOutcome: String?
) {
    private var boardKeyCache: String? = null
    private var positionHistoryKeyCache: String? = null

    data class Undo(
        val origin: String,
        val destination: String,
        val movedPiece: Piece,
        val capturedPieces: List<Pair<String, Piece>>,
        val previousPhase: Phase,
        val previousActiveSide: Side,
        val previousTerminalOutcome: String?,
        val previousPositionKeyCount: Int
    ) {
        val captureCount: Int = capturedPieces.size
    }

    data class EvaluationWeights(
        val material: Int,
        val mobility: Int,
        val goldProgress: Int,
        val ravenPressure: Int
    )

    companion object {
        private val originalStyleWeights = EvaluationWeights(
            material = 35,
            mobility = 3,
            goldProgress = 20,
            ravenPressure = 15
        )

        private val squareOneWeights = EvaluationWeights(
            material = 45,
            mobility = 4,
            goldProgress = 12,
            ravenPressure = 18
        )

        fun supports(snapshot: GameSnapshot): Boolean =
            OriginalStyleBotSearch.supports(snapshot)

        fun fromSnapshot(snapshot: GameSnapshot): OriginalStyleMutableSearchState {
            val goldMovesOneSquareAtATime = snapshot.ruleConfigurationId != "original-game"
            val terminalOutcome = snapshot.turns.lastOrNull()
                ?.takeIf { it.type == TurnType.gameOver }
                ?.outcome
            return OriginalStyleMutableSearchState(
                ruleConfigurationId = snapshot.ruleConfigurationId,
                boardSize = snapshot.boardSize,
                specialSquare = snapshot.specialSquare,
                goldMovesOneSquareAtATime = goldMovesOneSquareAtATime,
                board = LinkedHashMap(snapshot.board),
                positionKeys = snapshot.positionKeys.toMutableList(),
                phase = snapshot.phase,
                activeSide = snapshot.activeSide,
                terminalOutcome = terminalOutcome
            )
        }
    }

    fun positionCacheKey(): String = buildString {
        append(ruleConfigurationId)
        append('|')
        append(phase.name)
        append('|')
        append(activeSide.name)
        append('|')
        append(terminalOutcome ?: "-")
        append('|')
        append(boardKey())
    }

    fun searchCacheKey(): String = buildString {
        append(positionCacheKey())
        append('|')
        append(positionHistoryKey())
    }

    fun legalMoves(): List<LegalMove> {
        if (phase != Phase.move || terminalOutcome != null) {
            return emptyList()
        }

        return collectLegalMoves().sortedWith(compareBy(LegalMove::origin, LegalMove::destination))
    }

    fun countLegalMoves(): Int {
        if (phase != Phase.move || terminalOutcome != null) {
            return 0
        }

        var legalMoveCount = 0
        val entries = board.entries.toList()
        for ((origin, piece) in entries) {
            if (!sideOwnsPiece(activeSide, piece)) {
                continue
            }

            if (goldMovesOneSquareAtATime && piece == Piece.gold) {
                for (destination in BoardCoordinates.neighbors(origin, boardSize)) {
                    if (!board.containsKey(destination) && isLegalMove(origin, destination, piece)) {
                        legalMoveCount += 1
                    }
                }
                continue
            }

            for (ray in BoardCoordinates.orthogonalRays(origin, boardSize)) {
                for (destination in ray) {
                    if (board.containsKey(destination)) {
                        break
                    }
                    if (isLegalMove(origin, destination, piece)) {
                        legalMoveCount += 1
                    }
                }
            }
        }

        return legalMoveCount
    }

    fun evaluateForSide(perspectiveSide: Side, legalMoveCounter: (Side) -> Int): Int {
        terminalScore(perspectiveSide)?.let { return it }

        val weights = when (ruleConfigurationId) {
            "square-one", "square-one-x-9" -> squareOneWeights
            else -> originalStyleWeights
        }

        val opponent = RuleEngineSupport.oppositeSide(perspectiveSide)
        val dragonsMaterial = board.values.count { it == Piece.dragon || it == Piece.gold }
        val ravensMaterial = board.values.count { it == Piece.raven }

        var score = 0
        score += when (perspectiveSide) {
            Side.dragons -> (dragonsMaterial - ravensMaterial) * weights.material
            Side.ravens -> (ravensMaterial - dragonsMaterial) * weights.material
        }
        score += (legalMoveCounter(perspectiveSide) - legalMoveCounter(opponent)) * weights.mobility

        val goldDistance = goldCornerDistance()
        score += when (perspectiveSide) {
            Side.dragons -> -goldDistance * weights.goldProgress
            Side.ravens -> goldDistance * weights.goldProgress
        }

        val ravenPressure = ravenPressure()
        score += when (perspectiveSide) {
            Side.dragons -> -ravenPressure * weights.ravenPressure
            Side.ravens -> ravenPressure * weights.ravenPressure
        }

        return score
    }

    fun makeMove(move: LegalMove): Undo {
        val movedPiece = board.remove(move.origin)
            ?: throw IllegalArgumentException("No piece exists at ${move.origin}.")
        invalidateCachedKeys()
        board[move.destination] = movedPiece

        val previousPhase = phase
        val previousActiveSide = activeSide
        val previousTerminalOutcome = terminalOutcome
        val previousPositionKeyCount = positionKeys.size

        val capturedSquares = getAutomaticallyCapturedSquares(previousActiveSide)
        val capturedPieces = capturedSquares.map { square ->
            square to requireNotNull(board.remove(square))
        }

        val outcome = determineOutcome(move.destination)
        activeSide = RuleEngineSupport.oppositeSide(previousActiveSide)
        if (outcome != null) {
            phase = Phase.none
            terminalOutcome = outcome
            return Undo(
                origin = move.origin,
                destination = move.destination,
                movedPiece = movedPiece,
                capturedPieces = capturedPieces,
                previousPhase = previousPhase,
                previousActiveSide = previousActiveSide,
                previousTerminalOutcome = previousTerminalOutcome,
                previousPositionKeyCount = previousPositionKeyCount
            )
        }

        val positionKey = positionKey()
        if (positionKeys.contains(positionKey)) {
            phase = Phase.none
            terminalOutcome = "Draw by repetition"
        } else {
            positionKeys.add(positionKey)
            phase = Phase.move
            terminalOutcome = null
            if (countLegalMoves() == 0) {
                phase = Phase.none
                terminalOutcome = "Draw by no legal move"
            }
        }

        return Undo(
            origin = move.origin,
            destination = move.destination,
            movedPiece = movedPiece,
            capturedPieces = capturedPieces,
            previousPhase = previousPhase,
            previousActiveSide = previousActiveSide,
            previousTerminalOutcome = previousTerminalOutcome,
            previousPositionKeyCount = previousPositionKeyCount
        )
    }

    fun undo(undo: Undo) {
        while (positionKeys.size > undo.previousPositionKeyCount) {
            positionKeys.removeAt(positionKeys.lastIndex)
        }
        phase = undo.previousPhase
        activeSide = undo.previousActiveSide
        terminalOutcome = undo.previousTerminalOutcome

        board.remove(undo.destination)
        undo.capturedPieces.forEach { (square, piece) ->
            board[square] = piece
        }
        board[undo.origin] = undo.movedPiece
        invalidateCachedKeys()
    }

    private fun collectLegalMoves(limit: Int? = null): MutableList<LegalMove> {
        val legalMoves = mutableListOf<LegalMove>()
        val entries = board.entries.toList()
        for ((origin, piece) in entries) {
            if (!sideOwnsPiece(activeSide, piece)) {
                continue
            }

            if (goldMovesOneSquareAtATime && piece == Piece.gold) {
                for (destination in BoardCoordinates.neighbors(origin, boardSize)) {
                    if (board.containsKey(destination)) {
                        continue
                    }
                    if (isLegalMove(origin, destination, piece)) {
                        legalMoves += LegalMove(origin, destination)
                        if (limit != null && legalMoves.size >= limit) {
                            return legalMoves
                        }
                    }
                }
                continue
            }

            for (ray in BoardCoordinates.orthogonalRays(origin, boardSize)) {
                for (destination in ray) {
                    if (board.containsKey(destination)) {
                        break
                    }
                    if (isLegalMove(origin, destination, piece)) {
                        legalMoves += LegalMove(origin, destination)
                        if (limit != null && legalMoves.size >= limit) {
                            return legalMoves
                        }
                    }
                }
            }
        }
        return legalMoves
    }

    private fun isLegalMove(origin: String, destination: String, piece: Piece): Boolean {
        val path = BoardCoordinates.pathBetween(origin, destination, boardSize)
        if (path.isEmpty() && origin[0] != destination[0] && origin.drop(1) != destination.drop(1)) {
            return false
        }
        if (goldMovesOneSquareAtATime && piece == Piece.gold &&
            !BoardCoordinates.isOrthogonallyAdjacent(origin, destination, boardSize)
        ) {
            return false
        }
        if (path.any(board::containsKey)) {
            return false
        }
        if (BoardCoordinates.isCenter(destination, specialSquare)) {
            return false
        }
        if (piece != Piece.gold && BoardCoordinates.isCorner(destination, boardSize)) {
            return false
        }
        if (isIllegalEnemySandwich(destination, piece)) {
            return false
        }
        if (wouldExposeFriendlyPieceToCapture(origin, destination, piece)) {
            return false
        }

        return true
    }

    private fun wouldExposeFriendlyPieceToCapture(origin: String, destination: String, piece: Piece): Boolean {
        board.remove(origin)
        board[destination] = piece
        val opposingSide = RuleEngineSupport.oppositeSide(activeSide)
        return try {
            if (piece == Piece.gold) {
                if (isGoldCaptured(destination)) {
                    return true
                }
            } else if (isRegularPieceCaptured(destination, opposingSide)) {
                return true
            }

            val capturedSquares = getAutomaticallyCapturedSquares(activeSide)
            val capturedPieces = capturedSquares.map { square ->
                square to requireNotNull(board.remove(square))
            }
            try {
                val exposedSquares = HashSet<String>(2 + capturedSquares.size * 5)
                addExposedFriendlySquares(exposedSquares, origin, destination)
                addExposedFriendlySquares(exposedSquares, destination, destination)
                for (capturedSquare in capturedSquares) {
                    addExposedFriendlySquares(exposedSquares, capturedSquare, destination)
                }

                for (square in exposedSquares) {
                    when (board.getValue(square)) {
                        Piece.gold -> if (isGoldCaptured(square)) {
                            return true
                        }
                        else -> if (isRegularPieceCaptured(square, opposingSide)) {
                            return true
                        }
                    }
                }
                false
            } finally {
                capturedPieces.forEach { (square, capturedPiece) ->
                    board[square] = capturedPiece
                }
            }
        } finally {
            board.remove(destination)
            board[origin] = piece
        }
    }

    private fun addExposedFriendlySquares(exposedSquares: MutableSet<String>, changedSquare: String, excludedSquare: String) {
        addFriendlyCandidate(exposedSquares, changedSquare, excludedSquare)
        for (neighbor in BoardCoordinates.neighbors(changedSquare, boardSize)) {
            addFriendlyCandidate(exposedSquares, neighbor, excludedSquare)
        }
    }

    private fun addFriendlyCandidate(exposedSquares: MutableSet<String>, square: String, excludedSquare: String) {
        if (square == excludedSquare) {
            return
        }
        val piece = board[square] ?: return
        if (sideOwnsPiece(activeSide, piece)) {
            exposedSquares.add(square)
        }
    }

    private fun determineOutcome(destination: String): String? {
        if (board[destination] == Piece.gold && BoardCoordinates.isCorner(destination, boardSize)) {
            return "Dragons win"
        }
        if (board.values.none { it == Piece.raven }) {
            return "Dragons win"
        }
        return if (board.values.none { it == Piece.gold }) {
            "Ravens win"
        } else {
            null
        }
    }

    private fun getAutomaticallyCapturedSquares(capturingSide: Side): List<String> =
        board.entries
            .asSequence()
            .filter { (_, piece) -> !sideOwnsPiece(capturingSide, piece) }
            .filter { (square, piece) ->
                if (piece == Piece.gold) {
                    isGoldCaptured(square)
                } else {
                    isRegularPieceCaptured(square, capturingSide)
                }
            }
            .map { (square) -> square }
            .sorted()
            .toList()

    private fun isGoldCaptured(square: String): Boolean {
        if (BoardCoordinates.isCenter(square, specialSquare)) {
            return BoardCoordinates.neighbors(square, boardSize).all { board[it] == Piece.raven }
        }
        if (BoardCoordinates.isOrthogonallyAdjacent(square, specialSquare, boardSize)) {
            return BoardCoordinates.neighbors(square, boardSize)
                .asSequence()
                .filter { it != specialSquare }
                .all { board[it] == Piece.raven }
        }
        return isRegularPieceCaptured(square, Side.ravens)
    }

    private fun isRegularPieceCaptured(square: String, capturingSide: Side): Boolean =
        BoardCoordinates.oppositePairs(square, boardSize).any { (first, second) ->
            isHostileSquare(first, capturingSide) && isHostileSquare(second, capturingSide)
        }

    private fun isHostileSquare(square: String, capturingSide: Side): Boolean {
        val piece = board[square]
        if (piece != null) {
            return sideOwnsPiece(capturingSide, piece)
        }
        return BoardCoordinates.isCorner(square, boardSize) ||
            BoardCoordinates.isCenter(square, specialSquare)
    }

    private fun isIllegalEnemySandwich(destination: String, movedPiece: Piece): Boolean =
        BoardCoordinates.oppositePairs(destination, boardSize).any { (first, second) ->
            isEnemy(board[first], movedPiece) && isEnemy(board[second], movedPiece)
        }

    private fun isEnemy(piece: Piece?, movedPiece: Piece): Boolean {
        if (piece == null) {
            return false
        }
        return when (movedPiece) {
            Piece.raven -> piece == Piece.dragon || piece == Piece.gold
            Piece.dragon, Piece.gold -> piece == Piece.raven
        }
    }

    private fun positionKey(): String {
        val boardKey = boardKey()
        return "$ruleConfigurationId|${activeSide.name}|$boardKey"
    }

    private fun boardKey(): String =
        boardKeyCache ?: board.entries
            .sortedBy { it.key }
            .joinToString(",") { "${it.key}:${it.value.name}" }
            .also { boardKeyCache = it }

    private fun positionHistoryKey(): String =
        positionHistoryKeyCache ?: positionKeys.joinToString(",")
            .also { positionHistoryKeyCache = it }

    private fun invalidateCachedKeys() {
        boardKeyCache = null
        positionHistoryKeyCache = null
    }

    private fun goldCornerDistance(): Int {
        val goldSquare = board.entries.firstOrNull { (_, piece) -> piece == Piece.gold }?.key ?: return 0
        return BoardCoordinates.cornerSquares(boardSize)
            .minOf { corner -> manhattanDistance(goldSquare, corner) }
    }

    private fun ravenPressure(): Int {
        val goldSquare = board.entries.firstOrNull { (_, piece) -> piece == Piece.gold }?.key ?: return 100
        val ravens = board.entries.filter { (_, piece) -> piece == Piece.raven }.map { it.key }
        if (ravens.isEmpty()) {
            return 0
        }
        val nearestDistance = ravens.minOf { square -> manhattanDistance(square, goldSquare) }
        val adjacentRavens = ravens.count { square ->
            BoardCoordinates.isOrthogonallyAdjacent(square, goldSquare, boardSize)
        }
        return (adjacentRavens * 4) - nearestDistance
    }

    private fun terminalScore(perspectiveSide: Side): Int? = when (terminalOutcome) {
        "Dragons win" -> if (perspectiveSide == Side.dragons) 1_000_000 else -1_000_000
        "Ravens win" -> if (perspectiveSide == Side.ravens) 1_000_000 else -1_000_000
        null -> null
        else -> 0
    }

    private fun manhattanDistance(first: String, second: String): Int {
        val firstColumn = first[0] - 'a'
        val secondColumn = second[0] - 'a'
        val firstRow = first.drop(1).toInt() - 1
        val secondRow = second.drop(1).toInt() - 1
        return abs(firstColumn - secondColumn) + abs(firstRow - secondRow)
    }

    private fun sideOwnsPiece(side: Side, piece: Piece): Boolean =
        GameRules.sideOwnsPiece(side, piece)

}
