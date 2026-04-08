package com.dragonsvsravens.game

object GameRules {
    const val freePlayRuleConfigurationId = "free-play"
    private val setupCycle = listOf(Piece.dragon, Piece.raven, Piece.gold)
    private val originalStylePresetBoard = linkedMapOf(
        "d4" to Piece.gold,
        "d5" to Piece.dragon,
        "c4" to Piece.dragon,
        "e4" to Piece.dragon,
        "d3" to Piece.dragon,
        "d7" to Piece.raven,
        "d6" to Piece.raven,
        "a4" to Piece.raven,
        "b4" to Piece.raven,
        "f4" to Piece.raven,
        "g4" to Piece.raven,
        "d2" to Piece.raven,
        "d1" to Piece.raven
    )

    private data class RuleConfiguration(
        val summary: RuleConfigurationSummary,
        val presetBoard: Map<String, Piece>,
        val startingSide: Side,
        val ruleSet: RuleSet
    )

    private interface RuleSet {
        fun startPhase(): Phase

        fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece)

        fun getCapturableSquares(snapshot: GameSnapshot): List<String> = emptyList()

        fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot

        fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot =
            throw InvalidCommandException("This rule configuration resolves captures automatically.")

        fun commitPendingTurn(snapshot: GameSnapshot): GameSnapshot =
            throw InvalidCommandException("This rule configuration resolves captures automatically.")

        fun finishCommittedTurn(snapshot: GameSnapshot): GameSnapshot = snapshot

        fun positionKey(snapshot: GameSnapshot): String? = null
    }

    private val freePlay = RuleConfiguration(
        summary = RuleConfigurationSummary(
            id = freePlayRuleConfigurationId,
            name = "Free Play",
            descriptionSections = listOf(
                RuleDescriptionSection(
                    heading = "Overview",
                    paragraphs = listOf(
                        "Ravens are trying to steal the dragons' gold! Start a game. Place pieces during setup, then dragons and ravens alternate turns."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Setup Phase",
                    paragraphs = listOf(
                        "Click any square to cycle through dragon, raven, gold, then empty. Click \"End Setup\" when all the pieces are placed."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Turns",
                    paragraphs = listOf(
                        "Dragons move first. Dragons may move the gold on their turns. To move, click on a piece, and then click on the destination square. After moving, you may optionally capture an opposing piece. End the game to play a new game."
                    )
                )
            ),
            hasSetupPhase = true,
            hasManualCapture = true,
            hasManualEndGame = true
        ),
        presetBoard = emptyMap(),
        startingSide = Side.dragons,
        ruleSet = FreePlayRuleSet
    )

    private val trivial = RuleConfiguration(
        summary = RuleConfigurationSummary(
            id = "trivial",
            name = "Trivial Configuration",
            descriptionSections = listOf(
                RuleDescriptionSection(
                    heading = "Overview",
                    paragraphs = listOf(
                        "The dragons need to move the gold to the center."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Setup",
                    paragraphs = listOf(
                        "The game starts from a preset board with dragons at a1 and g7, gold at a2 and g6, and ravens at a7 and g1."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Turns",
                    paragraphs = listOf(
                        "Dragons move first. Pieces can move from any square to any other empty square. Pieces are captured whenever the moved piece ends orthogonally adjacent to opposing pieces."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Winner",
                    paragraphs = listOf(
                        "Dragons win if any gold reaches d4 or all ravens are captured. Ravens win if all gold is captured."
                    )
                )
            ),
            hasSetupPhase = false,
            hasManualCapture = false,
            hasManualEndGame = false
        ),
        presetBoard = linkedMapOf(
            "a1" to Piece.dragon,
            "g7" to Piece.dragon,
            "a2" to Piece.gold,
            "g6" to Piece.gold,
            "a7" to Piece.raven,
            "g1" to Piece.raven
        ),
        startingSide = Side.dragons,
        ruleSet = TrivialRuleSet
    )

    private val originalGame = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "original-game",
            name = "Original Game",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Pieces move any distance orthogonally without jumping. No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            )
        ),
        presetBoard = originalStylePresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleSet()
    )

    private val sherwoodRules = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "sherwood-rules",
            name = "Sherwood Rules",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Dragons and ravens move any distance orthogonally without jumping. The gold may move only one square orthogonally at a time.",
                "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            )
        ),
        presetBoard = originalStylePresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleSet(goldMovesOneSquareAtATime = true)
    )

    private val ruleConfigurations = listOf(freePlay, trivial, originalGame, sherwoodRules)
    private val ruleConfigurationsById = ruleConfigurations.associateBy { it.summary.id }

    fun availableRuleConfigurations(): List<RuleConfigurationSummary> =
        ruleConfigurations.map { it.summary }

    fun createInitialSnapshot(
        ruleConfigurationId: String = freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons
    ): GameSnapshot = createBaseSnapshot(ruleConfigurationId, Phase.none, selectedStartingSide)

    fun createIdleSnapshot(ruleConfigurationId: String, selectedStartingSide: Side = Side.dragons): GameSnapshot =
        createBaseSnapshot(ruleConfigurationId, Phase.none, selectedStartingSide)

    fun startGame(
        ruleConfigurationId: String = freePlayRuleConfigurationId,
        selectedStartingSide: Side = Side.dragons
    ): GameSnapshot {
        val configuration = getRuleConfiguration(ruleConfigurationId)
        val initialSnapshot = createBaseSnapshot(
            configuration.summary.id,
            configuration.ruleSet.startPhase(),
            selectedStartingSide
        )
        return initializePositionHistory(initialSnapshot)
    }

    fun cycleSetupPiece(snapshot: GameSnapshot, square: String): GameSnapshot {
        val board = LinkedHashMap(snapshot.board)
        val nextPiece = nextSetupPiece(board[square])

        if (nextPiece == null) {
            board.remove(square)
        } else {
            board[square] = nextPiece
        }

        return snapshot.copy(board = board)
    }

    fun endSetup(snapshot: GameSnapshot, selectedStartingSide: Side = Side.dragons): GameSnapshot =
        initializePositionHistory(
            snapshot.copy(
                phase = Phase.move,
                activeSide = resolveStartingSide(snapshot.ruleConfigurationId, selectedStartingSide),
                pendingMove = null
            )
        )

    fun endGame(snapshot: GameSnapshot, outcome: String = "Game ended"): GameSnapshot = snapshot.copy(
        phase = Phase.none,
        activeSide = getRuleConfiguration(snapshot.ruleConfigurationId).startingSide,
        pendingMove = null,
        turns = snapshot.turns + TurnRecord(type = TurnType.gameOver, outcome = outcome)
    )

    fun commitTurn(snapshot: GameSnapshot, capturedSquares: List<String> = emptyList()): GameSnapshot =
        getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet.commitPendingTurn(
            snapshot.copy(
                pendingMove = snapshot.pendingMove?.copy(capturedSquares = capturedSquares)
            )
        )

    fun getCapturableSquares(snapshot: GameSnapshot): List<String> =
        getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet.getCapturableSquares(snapshot)

    fun movePiece(snapshot: GameSnapshot, origin: String, destination: String): GameSnapshot {
        require(origin != destination) { "Origin and destination must be different." }

        val piece = snapshot.board[origin] ?: throw IllegalArgumentException("No piece exists at $origin.")
        require(!snapshot.board.containsKey(destination)) { "Destination $destination is occupied." }
        require(sideOwnsPiece(snapshot.activeSide, piece)) { "The active side cannot move the piece at $origin." }

        val configuration = getRuleConfiguration(snapshot.ruleConfigurationId)
        configuration.ruleSet.validateMove(snapshot, origin, destination, piece)
        return configuration.ruleSet.applyMove(snapshot, origin, destination, piece)
    }

    fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot =
        getRuleConfiguration(snapshot.ruleConfigurationId).ruleSet.capturePiece(snapshot, square)

    fun isManualCapture(snapshot: GameSnapshot): Boolean =
        getRuleConfiguration(snapshot.ruleConfigurationId).summary.hasManualCapture

    fun hasManualEndGame(snapshot: GameSnapshot): Boolean =
        getRuleConfiguration(snapshot.ruleConfigurationId).summary.hasManualEndGame

    fun getRuleConfigurationSummary(ruleConfigurationId: String): RuleConfigurationSummary =
        getRuleConfiguration(ruleConfigurationId).summary

    fun sideOwnsPiece(side: Side, piece: Piece): Boolean =
        when (piece) {
            Piece.gold -> side == Side.dragons
            Piece.dragon -> side == Side.dragons
            Piece.raven -> side == Side.ravens
        }

    private fun getRuleConfiguration(ruleConfigurationId: String): RuleConfiguration =
        ruleConfigurationsById[ruleConfigurationId]
            ?: throw InvalidCommandException("Unknown rule configuration: $ruleConfigurationId")

    private fun initializePositionHistory(snapshot: GameSnapshot): GameSnapshot {
        val configuration = getRuleConfiguration(snapshot.ruleConfigurationId)
        val positionKey = configuration.ruleSet.positionKey(snapshot)
        return if (positionKey == null) {
            snapshot.copy(positionKeys = emptyList())
        } else {
            snapshot.copy(positionKeys = listOf(positionKey))
        }
    }

    private fun createBaseSnapshot(
        ruleConfigurationId: String,
        phase: Phase,
        selectedStartingSide: Side
    ): GameSnapshot {
        val configuration = getRuleConfiguration(ruleConfigurationId)
        return GameSnapshot(
            board = LinkedHashMap(configuration.presetBoard),
            phase = phase,
            activeSide = resolveStartingSide(ruleConfigurationId, selectedStartingSide),
            pendingMove = null,
            turns = emptyList(),
            ruleConfigurationId = configuration.summary.id
        )
    }

    private fun resolveStartingSide(ruleConfigurationId: String, selectedStartingSide: Side): Side {
        val configuration = getRuleConfiguration(ruleConfigurationId)
        return if (ruleConfigurationId == freePlayRuleConfigurationId) {
            selectedStartingSide
        } else {
            configuration.startingSide
        }
    }

    private fun createMovedSnapshot(
        snapshot: GameSnapshot,
        origin: String,
        destination: String,
        piece: Piece
    ): GameSnapshot {
        val board = LinkedHashMap(snapshot.board)
        board.remove(origin)
        board[destination] = piece

        return snapshot.copy(
            board = board,
            pendingMove = TurnRecord(type = TurnType.move, from = origin, to = destination)
        )
    }

    private fun completeAutomaticTurn(
        snapshot: GameSnapshot,
        capturedSquares: List<String> = emptyList()
    ): GameSnapshot {
        val pendingMove = snapshot.pendingMove ?: return snapshot
        val completedMove = pendingMove.copy(capturedSquares = capturedSquares)
        val committed = snapshot.copy(
            phase = Phase.move,
            activeSide = oppositeSide(snapshot.activeSide),
            pendingMove = null,
            turns = snapshot.turns + completedMove
        )

        val configuration = getRuleConfiguration(committed.ruleConfigurationId)
        return configuration.ruleSet.finishCommittedTurn(committed)
    }

    private fun applyAutomaticMove(
        snapshot: GameSnapshot,
        origin: String,
        destination: String,
        piece: Piece,
        capturedSquares: (GameSnapshot) -> List<String>,
        resolveOutcome: (GameSnapshot, String) -> GameSnapshot = { resolvedSnapshot, _ -> resolvedSnapshot }
    ): GameSnapshot {
        val movedSnapshot = createMovedSnapshot(snapshot, origin, destination, piece)
        val autoCapturedSquares = capturedSquares(movedSnapshot)
        val boardAfterCapture = LinkedHashMap(movedSnapshot.board)
        autoCapturedSquares.forEach(boardAfterCapture::remove)
        val resolvedSnapshot = movedSnapshot.copy(board = boardAfterCapture)
        val completedSnapshot = completeAutomaticTurn(resolvedSnapshot, autoCapturedSquares)
        return resolveOutcome(completedSnapshot, destination)
    }

    private fun nextSetupPiece(piece: Piece?): Piece? {
        if (piece == null) {
            return setupCycle.first()
        }

        val currentIndex = setupCycle.indexOf(piece)
        return if (currentIndex == setupCycle.lastIndex) null else setupCycle[currentIndex + 1]
    }

    private fun oppositeSide(side: Side): Side =
        if (side == Side.dragons) Side.ravens else Side.dragons

    private fun createOriginalStyleSummary(
        id: String,
        name: String,
        moveParagraphs: List<String>
    ): RuleConfigurationSummary = RuleConfigurationSummary(
        id = id,
        name = name,
        descriptionSections = listOf(
            RuleDescriptionSection(
                heading = "Overview",
                paragraphs = listOf(
                    "Ravens are trying to steal the dragons' gold! The dragons need to hide it in a corner to protect it."
                )
            ),
            RuleDescriptionSection(
                heading = "Setup",
                paragraphs = listOf(
                    "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon.",
                )
            ),
            RuleDescriptionSection(
                heading = "Moves",
                paragraphs = moveParagraphs
            ),
            RuleDescriptionSection(
                heading = "Captures",
                paragraphs = listOf(
                    "Dragons and ravens are captured by being sandwiched orthogonally by enemies, by an enemy plus the empty center, or by an enemy plus a corner. The gold is captured by four ravens in the center, by three ravens when beside the center, and otherwise like another piece.",
                )
            ),
            RuleDescriptionSection(
                heading = "Winner",
                paragraphs = listOf(
                    "Dragons win if the gold reaches any corner square. Ravens win if they capture the gold. The game is drawn on repetition of the same position on the same player's turn, or when the side to move has no legal moves."
                )
            )
        ),
        hasSetupPhase = false,
        hasManualCapture = false,
        hasManualEndGame = false
    )

    private object FreePlayRuleSet : RuleSet {
        override fun startPhase(): Phase = Phase.setup

        override fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece) = Unit

        override fun getCapturableSquares(snapshot: GameSnapshot): List<String> =
            snapshot.board.entries
                .filter { (_, piece) -> canCapturePiece(snapshot.activeSide, piece) }
                .map { (square, _) -> square }

        override fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot {
            val movedSnapshot = createMovedSnapshot(snapshot, origin, destination, piece)
            return if (getCapturableSquares(movedSnapshot).isNotEmpty()) {
                movedSnapshot.copy(phase = Phase.capture)
            } else {
                commitPendingTurn(movedSnapshot)
            }
        }

        override fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot {
            val piece = snapshot.board[square] ?: throw IllegalArgumentException("No piece exists at $square.")
            require(canCapturePiece(snapshot.activeSide, piece)) { "The active side cannot capture the piece at $square." }

            val board = LinkedHashMap(snapshot.board)
            board.remove(square)
            return commitPendingTurn(snapshot.copy(board = board, pendingMove = snapshot.pendingMove), listOf(square))
        }

        override fun commitPendingTurn(snapshot: GameSnapshot): GameSnapshot {
            val pendingMove = snapshot.pendingMove ?: return snapshot
            val completedMove = pendingMove
            return snapshot.copy(
                phase = Phase.move,
                activeSide = oppositeSide(snapshot.activeSide),
                pendingMove = null,
                turns = snapshot.turns + completedMove
            )
        }

        private fun commitPendingTurn(snapshot: GameSnapshot, capturedSquares: List<String>): GameSnapshot {
            val pendingMove = snapshot.pendingMove ?: return snapshot
            val completedMove = pendingMove.copy(capturedSquares = capturedSquares)
            return snapshot.copy(
                phase = Phase.move,
                activeSide = oppositeSide(snapshot.activeSide),
                pendingMove = null,
                turns = snapshot.turns + completedMove
            )
        }
    }

    private object TrivialRuleSet : RuleSet {
        override fun startPhase(): Phase = Phase.move

        override fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece) = Unit

        override fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot =
            applyAutomaticMove(
                snapshot,
                origin,
                destination,
                piece,
                capturedSquares = { movedSnapshot ->
                    BoardCoordinates.neighbors(destination)
                        .filter { neighbor ->
                            val targetPiece = movedSnapshot.board[neighbor] ?: return@filter false
                            !sideOwnsPiece(snapshot.activeSide, targetPiece)
                        }
                        .sorted()
                },
                resolveOutcome = ::determineTrivialOutcome
            )

        private fun determineTrivialOutcome(snapshot: GameSnapshot, destination: String): GameSnapshot {
            val goldReachedCenter = snapshot.turns.lastOrNull()?.to == destination &&
                snapshot.board[destination] == Piece.gold &&
                BoardCoordinates.isCenter(destination)
            if (goldReachedCenter || snapshot.board.values.none { it == Piece.raven }) {
                return endGame(snapshot, "Dragons win")
            }

            return if (snapshot.board.values.none { it == Piece.gold }) {
                endGame(snapshot, "Ravens win")
            } else {
                snapshot
            }
        }
    }

    private class OriginalStyleRuleSet(
        private val goldMovesOneSquareAtATime: Boolean = false
    ) : RuleSet {
        override fun startPhase(): Phase = Phase.move

        override fun validateMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece) {
            val path = BoardCoordinates.pathBetween(origin, destination)
            require(path.isNotEmpty() || origin[0] == destination[0] || origin[1] == destination[1]) {
                "Pieces must move vertically or horizontally."
            }
            if (goldMovesOneSquareAtATime && piece == Piece.gold) {
                require(isSingleOrthogonalStep(origin, destination)) {
                    "The gold may move only one square at a time."
                }
            }
            require(path.none { snapshot.board.containsKey(it) }) {
                "Pieces may not jump over other pieces."
            }
            require(!BoardCoordinates.isCenter(destination)) {
                "No piece may land on the center square."
            }
            require(piece == Piece.gold || !BoardCoordinates.isCorner(destination)) {
                "Only the gold may land on a corner square."
            }
            require(!isIllegalEnemySandwich(snapshot, destination, piece)) {
                "It is illegal to move a piece between two enemy pieces."
            }
            require(!wouldExposeFriendlyPieceToCapture(snapshot, origin, destination, piece)) {
                "You may not move so that your piece is captured."
            }
        }

        override fun applyMove(snapshot: GameSnapshot, origin: String, destination: String, piece: Piece): GameSnapshot =
            applyAutomaticMove(
                snapshot,
                origin,
                destination,
                piece,
                capturedSquares = { movedSnapshot ->
                    getAutomaticallyCapturedSquares(movedSnapshot, snapshot.activeSide)
                },
                resolveOutcome = ::determineOriginalGameOutcome
            )

        override fun finishCommittedTurn(snapshot: GameSnapshot): GameSnapshot {
            val positionKey = positionKey(snapshot)
            val repeated = snapshot.positionKeys.contains(positionKey)
            val snapshotWithHistory = snapshot.copy(
                positionKeys = snapshot.positionKeys + positionKey
            )

            if (repeated) {
                return endGame(snapshotWithHistory, "Draw")
            }

            return if (!hasAnyLegalMove(snapshotWithHistory)) {
                endGame(snapshotWithHistory, "Draw")
            } else {
                snapshotWithHistory
            }
        }

        override fun positionKey(snapshot: GameSnapshot): String {
            val boardKey = snapshot.board.entries
                .sortedBy { it.key }
                .joinToString(",") { "${it.key}:${it.value.name}" }
            return "${snapshot.ruleConfigurationId}|${snapshot.activeSide.name}|$boardKey"
        }

        private fun hasAnyLegalMove(snapshot: GameSnapshot): Boolean =
            snapshot.board.entries
                .filter { (_, piece) -> sideOwnsPiece(snapshot.activeSide, piece) }
                .any { (origin, piece) ->
                    BoardCoordinates.allSquares()
                        .filter { it != origin && !snapshot.board.containsKey(it) }
                        .any { destination ->
                            try {
                                validateMove(snapshot, origin, destination, piece)
                                true
                            } catch (_: IllegalArgumentException) {
                                false
                            } catch (_: IllegalStateException) {
                                false
                            }
                        }
                }

        private fun isSingleOrthogonalStep(origin: String, destination: String): Boolean {
            return BoardCoordinates.isOrthogonallyAdjacent(origin, destination)
        }

        private fun wouldExposeFriendlyPieceToCapture(
            snapshot: GameSnapshot,
            origin: String,
            destination: String,
            piece: Piece
        ): Boolean {
            val movedSnapshot = createMovedSnapshot(snapshot, origin, destination, piece)
            val opposingSide = oppositeSide(snapshot.activeSide)
            if (piece == Piece.gold) {
                if (isGoldCaptured(movedSnapshot.board, destination)) {
                    return true
                }
            } else if (isRegularPieceCaptured(movedSnapshot.board, destination, opposingSide)) {
                return true
            }
            val capturedByMover = getAutomaticallyCapturedSquares(movedSnapshot, snapshot.activeSide)
            val boardAfterMoverCaptures = LinkedHashMap(movedSnapshot.board)
            capturedByMover.forEach(boardAfterMoverCaptures::remove)
            return boardAfterMoverCaptures.entries
                .filter { (_, remainingPiece) -> sideOwnsPiece(snapshot.activeSide, remainingPiece) }
                .filter { (square, _) -> square != destination }
                .any { (square, remainingPiece) ->
                    if (remainingPiece == Piece.gold) {
                        isGoldCaptured(boardAfterMoverCaptures, square)
                    } else {
                        isRegularPieceCaptured(boardAfterMoverCaptures, square, opposingSide)
                    }
                }
        }

        private fun determineOriginalGameOutcome(snapshot: GameSnapshot, destination: String): GameSnapshot {
            if (snapshot.board[destination] == Piece.gold && BoardCoordinates.isCorner(destination)) {
                return endGame(snapshot, "Dragons win")
            }

            return if (snapshot.board.values.none { it == Piece.gold }) {
                endGame(snapshot, "Ravens win")
            } else {
                snapshot
            }
        }

        private fun isIllegalEnemySandwich(snapshot: GameSnapshot, destination: String, movedPiece: Piece): Boolean =
            BoardCoordinates.oppositePairs(destination).any { (first, second) ->
                isEnemy(snapshot.board[first], movedPiece) && isEnemy(snapshot.board[second], movedPiece)
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

        private fun getAutomaticallyCapturedSquares(snapshot: GameSnapshot, capturingSide: Side): List<String> =
            snapshot.board.entries
                .filter { (_, piece) -> !sideOwnsPiece(capturingSide, piece) }
                .filter { (square, piece) ->
                    if (piece == Piece.gold) {
                        isGoldCaptured(snapshot.board, square)
                    } else {
                        isRegularPieceCaptured(snapshot.board, square, capturingSide)
                    }
                }
                .map { (square) -> square }
                .sorted()

        private fun isGoldCaptured(board: Map<String, Piece>, square: String): Boolean {
            if (BoardCoordinates.isCenter(square)) {
                return BoardCoordinates.neighbors(square).all { board[it] == Piece.raven }
            }

            if (BoardCoordinates.isOrthogonallyAdjacent(square, "d4")) {
                return BoardCoordinates.neighbors(square)
                    .filter { it != "d4" }
                    .all { board[it] == Piece.raven }
            }

            return isRegularPieceCaptured(board, square, Side.ravens)
        }

        private fun isRegularPieceCaptured(
            board: Map<String, Piece>,
            square: String,
            capturingSide: Side
        ): Boolean = BoardCoordinates.oppositePairs(square).any { (first, second) ->
            isHostileSquare(board, first, capturingSide) && isHostileSquare(board, second, capturingSide)
        }

        private fun isHostileSquare(board: Map<String, Piece>, square: String, capturingSide: Side): Boolean {
            val piece = board[square]
            if (piece != null) {
                return sideOwnsPiece(capturingSide, piece)
            }

            return BoardCoordinates.isCorner(square) || BoardCoordinates.isCenter(square)
        }
    }

    private fun canCapturePiece(side: Side, piece: Piece): Boolean =
        when (side) {
            Side.dragons -> piece == Piece.raven
            Side.ravens -> piece == Piece.dragon || piece == Piece.gold
        }
}
