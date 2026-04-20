package com.dragonsvsravens.game

object GameRules {
    const val freePlayRuleConfigurationId = "free-play"
    const val defaultBoardSize = 7
    const val minBoardSize = 3
    const val maxBoardSize = 26

    fun availableRuleConfigurations(): List<RuleConfigurationSummary> =
        RuleCatalog.availableRuleConfigurations()

    fun createInitialSnapshot(
        ruleConfigurationId: String = freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = defaultBoardSize,
        initialBoard: Map<String, Piece>? = null
    ): GameSnapshot =
        GameSnapshotFactory.createInitialSnapshot(ruleConfigurationId, selectedStartingSide, selectedBoardSize, initialBoard)

    fun createIdleSnapshot(
        ruleConfigurationId: String,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = defaultBoardSize
    ): GameSnapshot =
        GameSnapshotFactory.createIdleSnapshot(ruleConfigurationId, selectedStartingSide, selectedBoardSize)

    fun startGame(
        ruleConfigurationId: String = freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons,
        selectedBoardSize: Int = defaultBoardSize,
        initialBoard: Map<String, Piece>? = null
    ): GameSnapshot =
        GameSnapshotFactory.startGame(ruleConfigurationId, selectedStartingSide, selectedBoardSize, initialBoard)

    fun endGame(snapshot: GameSnapshot, outcome: String = "Game ended"): GameSnapshot = snapshot.copy(
        phase = Phase.none,
        activeSide = RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).startingSide,
        pendingMove = null,
        turns = snapshot.turns + TurnRecord(type = TurnType.gameOver, outcome = outcome)
    )

    fun commitTurn(snapshot: GameSnapshot, capturedSquares: List<String> = emptyList()): GameSnapshot =
        RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet.commitPendingTurn(
            snapshot.copy(
                pendingMove = snapshot.pendingMove?.copy(capturedSquares = capturedSquares)
            )
        )

    fun getCapturableSquares(snapshot: GameSnapshot): List<String> =
        RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet.getCapturableSquares(snapshot)

    fun movePiece(snapshot: GameSnapshot, origin: String, destination: String): GameSnapshot {
        require(origin != destination) { "Origin and destination must be different." }

        val piece = snapshot.board[origin] ?: throw IllegalArgumentException("No piece exists at $origin.")
        require(!snapshot.board.containsKey(destination)) { "Destination $destination is occupied." }
        require(sideOwnsPiece(snapshot.activeSide, piece)) { "The active side cannot move the piece at $origin." }

        val configuration = RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId)
        configuration.ruleSet.validateMove(snapshot, origin, destination, piece)
        return configuration.ruleSet.applyMove(snapshot, origin, destination, piece)
    }

    fun getLegalMoves(snapshot: GameSnapshot): List<LegalMove> {
        if (snapshot.phase != Phase.move) {
            return emptyList()
        }

        val ruleSet = RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet
        return snapshot.board.entries
            .asSequence()
            .filter { (_, piece) -> sideOwnsPiece(snapshot.activeSide, piece) }
            .flatMap { (origin, piece) ->
                BoardCoordinates.allSquares(snapshot.boardSize)
                    .asSequence()
                    .filter { destination -> destination != origin && !snapshot.board.containsKey(destination) }
                    .mapNotNull { destination ->
                        try {
                            ruleSet.validateMove(snapshot, origin, destination, piece)
                            LegalMove(origin = origin, destination = destination)
                        } catch (_: IllegalArgumentException) {
                            null
                        } catch (_: IllegalStateException) {
                            null
                        }
                    }
            }
            .sortedWith(compareBy(LegalMove::origin, LegalMove::destination))
            .toList()
    }

    fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot =
        RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet.capturePiece(snapshot, square)

    fun isManualCapture(snapshot: GameSnapshot): Boolean =
        RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).summary.hasManualCapture

    fun hasManualEndGame(snapshot: GameSnapshot): Boolean =
        RuleCatalog.getRuleConfiguration(snapshot.ruleConfigurationId).summary.hasManualEndGame

    fun getRuleConfigurationSummary(ruleConfigurationId: String): RuleConfigurationSummary =
        RuleCatalog.getRuleConfiguration(ruleConfigurationId).summary

    fun validateBoardSize(boardSize: Int) {
        require(BoardCoordinates.isValidBoardSize(boardSize)) {
            "Board size must be between ${minBoardSize}x${minBoardSize} and ${maxBoardSize}x${maxBoardSize}."
        }
    }

    fun sideOwnsPiece(side: Side, piece: Piece): Boolean =
        when (piece) {
            Piece.gold -> side == Side.dragons
            Piece.dragon -> side == Side.dragons
            Piece.raven -> side == Side.ravens
        }
}
