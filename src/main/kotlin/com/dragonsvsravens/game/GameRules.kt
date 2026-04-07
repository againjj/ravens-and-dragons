package com.dragonsvsravens.game

object GameRules {
    private val setupCycle = listOf(Piece.dragon, Piece.raven, Piece.gold)

    fun createInitialSnapshot(): GameSnapshot = GameSnapshot(
        board = linkedMapOf(),
        phase = Phase.none,
        activeSide = Side.dragons,
        pendingMove = null,
        turns = emptyList()
    )

    fun startGame(): GameSnapshot = createInitialSnapshot().copy(phase = Phase.setup)

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

    fun endSetup(snapshot: GameSnapshot): GameSnapshot = snapshot.copy(
        phase = Phase.move,
        activeSide = Side.dragons,
        pendingMove = null
    )

    fun endGame(snapshot: GameSnapshot): GameSnapshot = snapshot.copy(
        phase = Phase.none,
        activeSide = Side.dragons,
        pendingMove = null,
        turns = snapshot.turns + TurnRecord(type = TurnType.gameOver)
    )

    fun commitTurn(snapshot: GameSnapshot, capturedSquare: String? = null): GameSnapshot {
        val pendingMove = snapshot.pendingMove ?: return snapshot
        val completedMove = pendingMove.copy(captured = capturedSquare)

        return snapshot.copy(
            phase = Phase.move,
            activeSide = oppositeSide(snapshot.activeSide),
            pendingMove = null,
            turns = snapshot.turns + completedMove
        )
    }

    fun getCapturableSquares(snapshot: GameSnapshot): List<String> =
        snapshot.board.entries
            .filter { (_, piece) -> canCapturePiece(snapshot.activeSide, piece) }
            .map { (square, _) -> square }

    fun movePiece(snapshot: GameSnapshot, origin: String, destination: String): GameSnapshot {
        require(origin != destination) { "Origin and destination must be different." }

        val piece = snapshot.board[origin] ?: throw IllegalArgumentException("No piece exists at $origin.")
        require(!snapshot.board.containsKey(destination)) { "Destination $destination is occupied." }
        require(sideOwnsPiece(snapshot.activeSide, piece)) { "The active side cannot move the piece at $origin." }

        val board = LinkedHashMap(snapshot.board)
        board.remove(origin)
        board[destination] = piece

        val movedSnapshot = snapshot.copy(
            board = board,
            pendingMove = TurnRecord(type = TurnType.move, from = origin, to = destination)
        )

        return if (getCapturableSquares(movedSnapshot).isNotEmpty()) {
            movedSnapshot.copy(phase = Phase.capture)
        } else {
            commitTurn(movedSnapshot)
        }
    }

    fun capturePiece(snapshot: GameSnapshot, square: String): GameSnapshot {
        val piece = snapshot.board[square] ?: throw IllegalArgumentException("No piece exists at $square.")
        require(canCapturePiece(snapshot.activeSide, piece)) { "The active side cannot capture the piece at $square." }

        val board = LinkedHashMap(snapshot.board)
        board.remove(square)
        return commitTurn(snapshot.copy(board = board), square)
    }

    private fun sideOwnsPiece(side: Side, piece: Piece): Boolean =
        when (piece) {
            Piece.gold -> side == Side.dragons
            Piece.dragon -> side == Side.dragons
            Piece.raven -> side == Side.ravens
        }

    private fun canCapturePiece(side: Side, piece: Piece): Boolean =
        when (side) {
            Side.dragons -> piece == Piece.raven
            Side.ravens -> piece == Piece.dragon || piece == Piece.gold
        }

    private fun oppositeSide(side: Side): Side =
        if (side == Side.dragons) Side.ravens else Side.dragons

    private fun nextSetupPiece(piece: Piece?): Piece? {
        if (piece == null) {
            return setupCycle.first()
        }

        val currentIndex = setupCycle.indexOf(piece)
        return if (currentIndex == setupCycle.lastIndex) {
            null
        } else {
            setupCycle[currentIndex + 1]
        }
    }
}
