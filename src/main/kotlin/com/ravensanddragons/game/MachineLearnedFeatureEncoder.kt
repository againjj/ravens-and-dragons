package com.ravensanddragons.game

object MachineLearnedFeatureEncoder {
    const val schemaVersion = 1
    const val featureCount = 9

    fun encode(
        beforeSnapshot: GameSnapshot,
        move: LegalMove,
        afterSnapshot: GameSnapshot
    ): FloatArray {
        val movedPiece = beforeSnapshot.board.getValue(move.origin)
        val mover = beforeSnapshot.activeSide

        return floatArrayOf(
            if (mover == Side.dragons) 1f else -1f,
            if (movedPiece == Piece.gold) 1f else 0f,
            if (movedPiece == Piece.dragon) 1f else 0f,
            if (movedPiece == Piece.raven) 1f else 0f,
            BotStrategySupport.capturedOpponentCount(beforeSnapshot, afterSnapshot, mover).toFloat(),
            if (BotStrategySupport.isWinningSnapshotFor(afterSnapshot, mover)) 1f else 0f,
            BotStrategySupport.goldCornerDistance(afterSnapshot).toFloat(),
            BotStrategySupport.ravenPressure(afterSnapshot).toFloat(),
            BotStrategySupport.evaluateForSide(afterSnapshot, mover).toFloat()
        )
    }
}
