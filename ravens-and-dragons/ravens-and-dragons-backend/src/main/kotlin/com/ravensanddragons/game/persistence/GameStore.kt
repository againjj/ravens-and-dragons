package com.ravensanddragons.game.persistence

import com.ravensanddragons.game.model.*
import java.time.Instant

data class StoredGame(
    val session: GameSession,
    val undoEntries: List<UndoEntry>,
    val lastAccessedAt: Instant
)
