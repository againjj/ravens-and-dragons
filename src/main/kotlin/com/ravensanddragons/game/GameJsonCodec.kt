package com.ravensanddragons.game

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class GameJsonCodec(
    private val objectMapper: ObjectMapper
) {
    fun writeSnapshot(snapshot: GameSnapshot): String =
        objectMapper.writeValueAsString(snapshot)

    fun readSnapshot(json: String): GameSnapshot =
        objectMapper.readValue(json, GameSnapshot::class.java)

    fun writeUndoEntries(undoEntries: List<UndoEntry>): String =
        objectMapper.writeValueAsString(undoEntries)

    fun readUndoEntries(json: String): List<UndoEntry> {
        val root = objectMapper.readTree(json)
        if (!root.isArray) {
            return emptyList()
        }
        if (root.isEmpty) {
            return emptyList()
        }

        val firstEntry = root.first()
        return if (firstEntry.has("state")) {
            objectMapper.readValue(json, object : TypeReference<List<UndoEntry>>() {})
        } else if (firstEntry.has("snapshot")) {
            objectMapper.convertValue(root, object : TypeReference<List<LegacyUndoEntry>>() {})
                .map { entry ->
                    UndoEntry(
                        state = entry.snapshot.toUndoSnapshotState(),
                        ownerSide = entry.ownerSide,
                        kind = entry.kind
                    )
                }
        } else {
            objectMapper.convertValue(root, object : TypeReference<List<GameSnapshot>>() {})
                .map { snapshot -> UndoEntry(state = snapshot.toUndoSnapshotState(), ownerSide = snapshot.activeSide) }
        }
    }

    private data class LegacyUndoEntry(
        val snapshot: GameSnapshot,
        val ownerSide: Side? = null,
        val kind: UndoEntryKind = UndoEntryKind.humanOnly
    )

    private fun GameSnapshot.toUndoSnapshotState(): UndoSnapshotState =
        UndoSnapshotState(
            board = board,
            phase = phase,
            activeSide = activeSide,
            pendingMove = pendingMove,
            turns = turns,
            positionKeys = positionKeys
        )
}
