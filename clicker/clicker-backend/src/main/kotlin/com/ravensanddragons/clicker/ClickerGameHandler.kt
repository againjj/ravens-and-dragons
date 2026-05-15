package com.ravensanddragons.clicker

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.ravensanddragons.platform.game.runtime.GameHandler
import com.ravensanddragons.platform.game.runtime.GameRecord
import com.ravensanddragons.platform.game.runtime.InvalidCommandException
import com.ravensanddragons.platform.game.runtime.PublicGameDetails
import com.ravensanddragons.platform.game.runtime.VersionConflictException
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

data class ClickerGameState(
    val id: String,
    val gameSlug: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val lifecycle: String,
    val counter: Int,
    val createdByUserId: String? = null
)

@Component
class ClickerGameHandler(
    private val objectMapper: ObjectMapper,
    private val clock: Clock
) : GameHandler {
    override val gameSlug: String = ClickerGameModuleDefinition.identity.slug

    override fun createGame(
        gameId: String,
        request: JsonNode,
        createdByUserId: String?
    ): GameRecord {
        val now = Instant.now(clock)
        val state = ClickerGameState(
            id = gameId,
            gameSlug = gameSlug,
            version = 1,
            createdAt = now,
            updatedAt = now,
            lifecycle = activeLifecycle,
            counter = 0,
            createdByUserId = createdByUserId
        )
        return state.toRecord(lastAccessedAt = now)
    }

    override fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord {
        val state = current.toClickerState()
        requireExpectedVersion(state, command)

        val commandType = command.get("type")?.asText()
        if (commandType != clickCommandType) {
            throw InvalidCommandException("Unsupported Clicker command: ${commandType ?: "missing type"}.")
        }
        if (state.lifecycle == finishedLifecycle) {
            throw InvalidCommandException("This Clicker game is already over.")
        }

        val now = Instant.now(clock)
        val nextCounter = (state.counter + 1).coerceAtMost(finishCounter)
        return state.copy(
            version = state.version + 1,
            updatedAt = now,
            lifecycle = if (nextCounter >= finishCounter) finishedLifecycle else activeLifecycle,
            counter = nextCounter
        ).toRecord(lastAccessedAt = current.lastAccessedAt, publiclyListed = current.publiclyListed)
    }

    override fun gameView(current: GameRecord, currentUserId: String?): JsonNode = current.publicState

    override fun publicGameDetails(current: GameRecord): PublicGameDetails = PublicGameDetails(
        gameName = ClickerGameModuleDefinition.identity.displayName,
        openSeats = 0
    )

    override fun playerUserIds(current: GameRecord): Set<String> = emptySet()

    private fun requireExpectedVersion(state: ClickerGameState, command: JsonNode) {
        val expectedVersion = command.get("expectedVersion")?.asLong()
            ?: throw InvalidCommandException("Click command requires expectedVersion.")
        if (expectedVersion != state.version) {
            throw VersionConflictException(objectMapper.valueToTree(state))
        }
    }

    private fun GameRecord.toClickerState(): ClickerGameState =
        objectMapper.treeToValue(publicState, ClickerGameState::class.java)

    private fun ClickerGameState.toRecord(lastAccessedAt: Instant, publiclyListed: Boolean = true): GameRecord =
        GameRecord(
            id = id,
            gameSlug = gameSlug,
            version = version,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lifecycle = lifecycle,
            publicState = objectMapper.valueToTree(this),
            privateState = objectMapper.createObjectNode(),
            createdByUserId = createdByUserId,
            lastAccessedAt = lastAccessedAt,
            publiclyListed = publiclyListed
        )

    private companion object {
        const val activeLifecycle = "active"
        const val finishedLifecycle = "finished"
        const val clickCommandType = "click"
        const val finishCounter = 10
    }
}
