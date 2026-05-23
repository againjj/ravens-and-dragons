package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode

interface GameHandler {
    val gameSlug: String

    fun createGame(
        gameId: String,
        request: JsonNode,
        createdByUserId: String?
    ): GameRecord

    fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord

    fun afterCommandPersisted(
        persisted: GameRecord,
        persist: (GameRecord) -> GameRecord
    ): GameRecord = persisted

    fun gameView(current: GameRecord, currentUserId: String?): JsonNode

    fun publicState(current: GameRecord): JsonNode = current.publicState

    fun publicGameDetails(current: GameRecord): PublicGameDetails = PublicGameDetails(
        gameName = current.gameSlug,
        openSeats = 0
    )

    fun playerGameDetails(current: GameRecord, currentUserId: String): PlayerGameDetails? = null

    fun playerUserIds(current: GameRecord): Set<String> = emptySet()

    fun clearUserReferences(current: GameRecord, userId: String): GameRecord? = null
}
