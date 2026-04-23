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
        return if (firstEntry.has("snapshot")) {
            objectMapper.readValue(json, object : TypeReference<List<UndoEntry>>() {})
        } else {
            objectMapper.convertValue(root, object : TypeReference<List<GameSnapshot>>() {})
                .map { snapshot -> UndoEntry(snapshot = snapshot, ownerSide = snapshot.activeSide) }
        }
    }
}
