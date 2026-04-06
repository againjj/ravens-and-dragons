package com.dragonsvsravens.game

object GameRules {
    fun createInitialSnapshot(): GameSnapshot = GameSnapshot(
        board = linkedMapOf("e5" to Piece.gold),
        phase = Phase.setup,
        activeSide = Side.dragons,
        pendingMove = null,
        turns = emptyList()
    )

    fun resetGame(): GameSnapshot = createInitialSnapshot()

    fun cycleSetupPiece(snapshot: GameSnapshot, square: String): GameSnapshot {
        require(square != "e5") { "The gold square cannot be changed during setup." }

        val board = LinkedHashMap(snapshot.board)
        when (board[square]) {
            null -> board[square] = Piece.dragon
            Piece.dragon -> board[square] = Piece.raven
            Piece.raven -> board.remove(square)
            Piece.gold -> throw IllegalArgumentException("The gold square cannot be changed during setup.")
        }

        return snapshot.copy(board = board)
    }

    fun beginGame(snapshot: GameSnapshot): GameSnapshot = snapshot.copy(
        phase = Phase.move,
        activeSide = Side.dragons,
        pendingMove = null
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
            pendingMove = MoveRecord(from = origin, to = destination)
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
}
