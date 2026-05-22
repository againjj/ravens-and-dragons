package com.ravensanddragons.tictactoe

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

data class TicTacToeGameState(
    val id: String,
    val gameSlug: String,
    val version: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
    val lifecycle: String,
    val board: List<String?>,
    val currentMark: String,
    val winner: String? = null,
    val winningLine: List<Int> = emptyList(),
    val createdByUserId: String? = null
)

@Component
class TicTacToeGameHandler(
    private val objectMapper: ObjectMapper,
    private val clock: Clock
) : GameHandler {
    override val gameSlug: String = TicTacToeGameModuleDefinition.identity.slug

    override fun createGame(
        gameId: String,
        request: JsonNode,
        createdByUserId: String?
    ): GameRecord {
        val now = Instant.now(clock)
        val state = TicTacToeGameState(
            id = gameId,
            gameSlug = gameSlug,
            version = 1,
            createdAt = now,
            updatedAt = now,
            lifecycle = activeLifecycle,
            board = List(boardCellCount) { null },
            currentMark = firstMark,
            createdByUserId = createdByUserId
        )
        return state.toRecord(lastAccessedAt = now)
    }

    override fun applyCommand(current: GameRecord, command: JsonNode, actingUserId: String?): GameRecord {
        val state = current.toTicTacToeState()
        requireExpectedVersion(state, command)

        val commandType = command.get("type")?.asText()
        if (commandType != placeMarkCommandType) {
            throw InvalidCommandException("Unsupported Tic-Tac-Toe command: ${commandType ?: "missing type"}.")
        }
        if (state.lifecycle == finishedLifecycle) {
            throw InvalidCommandException("This Tic-Tac-Toe game is already over.")
        }

        val cellIndex = command.get("cellIndex")?.takeIf { it.canConvertToInt() }?.asInt()
            ?: throw InvalidCommandException("Place mark command requires cellIndex.")
        if (cellIndex !in 0 until boardCellCount) {
            throw InvalidCommandException("Cell index must be between 0 and 8.")
        }
        if (state.board[cellIndex] != null) {
            throw InvalidCommandException("That square is already occupied.")
        }

        val now = Instant.now(clock)
        val nextBoard = state.board.toMutableList()
        nextBoard[cellIndex] = state.currentMark
        val winningLine = findWinningLine(nextBoard)
        val winner = winningLine?.let { state.currentMark }
        val isDraw = winner == null && nextBoard.all { it != null }
        val isFinished = winner != null || isDraw

        return state.copy(
            version = state.version + 1,
            updatedAt = now,
            lifecycle = if (isFinished) finishedLifecycle else activeLifecycle,
            board = nextBoard,
            currentMark = if (isFinished) state.currentMark else state.currentMark.nextMark(),
            winner = winner,
            winningLine = winningLine ?: emptyList()
        ).toRecord(lastAccessedAt = current.lastAccessedAt, publiclyListed = current.publiclyListed)
    }

    override fun gameView(current: GameRecord, currentUserId: String?): JsonNode = current.publicState

    override fun publicGameDetails(current: GameRecord): PublicGameDetails = PublicGameDetails(
        gameName = TicTacToeGameModuleDefinition.identity.displayName,
        openSeats = 0
    )

    override fun playerUserIds(current: GameRecord): Set<String> = emptySet()

    private fun requireExpectedVersion(state: TicTacToeGameState, command: JsonNode) {
        val expectedVersion = command.get("expectedVersion")?.asLong()
            ?: throw InvalidCommandException("Place mark command requires expectedVersion.")
        if (expectedVersion != state.version) {
            throw VersionConflictException(objectMapper.valueToTree(state))
        }
    }

    private fun GameRecord.toTicTacToeState(): TicTacToeGameState =
        objectMapper.treeToValue(publicState, TicTacToeGameState::class.java)

    private fun TicTacToeGameState.toRecord(lastAccessedAt: Instant, publiclyListed: Boolean = true): GameRecord =
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

    private fun String.nextMark(): String =
        when (this) {
            firstMark -> secondMark
            secondMark -> firstMark
            else -> throw InvalidCommandException("Current mark must be X or O.")
        }

    private fun findWinningLine(board: List<String?>): List<Int>? =
        winningLines.firstOrNull { line ->
            val firstCell = board[line[0]]
            firstCell != null && line.all { board[it] == firstCell }
        }

    private companion object {
        const val activeLifecycle = "active"
        const val finishedLifecycle = "finished"
        const val placeMarkCommandType = "placeMark"
        const val boardCellCount = 9
        const val firstMark = "X"
        const val secondMark = "O"

        val winningLines = listOf(
            listOf(0, 1, 2),
            listOf(3, 4, 5),
            listOf(6, 7, 8),
            listOf(0, 3, 6),
            listOf(1, 4, 7),
            listOf(2, 5, 8),
            listOf(0, 4, 8),
            listOf(2, 4, 6)
        )
    }
}
