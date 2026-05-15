package com.ravensanddragons.game

import com.fasterxml.jackson.databind.JsonNode
import com.ravensanddragons.auth.ForbiddenActionException
import com.ravensanddragons.auth.UserAccountService
import com.ravensanddragons.game.bot.BotRegistry
import com.ravensanddragons.game.bot.BotTurnRunner
import com.ravensanddragons.game.model.AssignBotOpponentRequest
import com.ravensanddragons.game.model.AssignPlayerSeatRequest
import com.ravensanddragons.game.model.ClaimSideRequest
import com.ravensanddragons.game.model.CreateGameRequest
import com.ravensanddragons.game.model.GameCommandRequest
import com.ravensanddragons.game.model.GameLifecycle
import com.ravensanddragons.game.model.GamePlayerSummary
import com.ravensanddragons.game.model.GameSession
import com.ravensanddragons.game.model.GameSnapshot
import com.ravensanddragons.game.model.GameViewResponse
import com.ravensanddragons.game.model.Piece
import com.ravensanddragons.game.model.Side
import com.ravensanddragons.game.model.ViewerRole
import com.ravensanddragons.game.persistence.GameJsonCodec
import com.ravensanddragons.game.persistence.StoredGame
import com.ravensanddragons.game.rules.BoardCoordinates
import com.ravensanddragons.game.rules.GameRules
import com.ravensanddragons.game.session.GameCommandService
import com.ravensanddragons.game.session.GameSessionFactory
import com.ravensanddragons.platform.game.runtime.GameHandler
import com.ravensanddragons.platform.game.runtime.PlayerGameDetails
import com.ravensanddragons.platform.game.runtime.PublicGameDetails
import com.ravensanddragons.platform.game.runtime.GameRecord as PlatformGameRecord
import com.ravensanddragons.platform.game.runtime.InvalidCommandException as PlatformInvalidCommandException
import com.ravensanddragons.platform.game.runtime.VersionConflictException as PlatformVersionConflictException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import com.ravensanddragons.game.model.InvalidCommandException as RavensInvalidCommandException
import com.ravensanddragons.game.model.VersionConflictException as RavensVersionConflictException

@Component
class RavensAndDragonsGameHandler(
    private val gameCommandService: GameCommandService,
    private val botRegistry: BotRegistry,
    private val botTurnRunner: BotTurnRunner,
    private val gameJsonCodec: GameJsonCodec,
    private val userAccountServiceProvider: ObjectProvider<UserAccountService>,
    private val clock: Clock
) : GameHandler {
    override val gameSlug: String = RavensAndDragonsGameModuleDefinition.identity.slug

    override fun createGame(
        gameId: String,
        request: JsonNode,
        createdByUserId: String?
    ): PlatformGameRecord = translateExceptions {
        val createRequest = gameJsonCodec.convert(request, CreateGameRequest::class.java)
        val selectedRuleConfigurationId = createRequest.ruleConfigurationId ?: GameRules.freePlayRuleConfigurationId
        GameRules.getRuleConfigurationSummary(selectedRuleConfigurationId)
        val requestedBoardSize = createRequest.boardSize ?: GameRules.defaultBoardSize
        GameRules.validateBoardSize(requestedBoardSize)
        if (selectedRuleConfigurationId == GameRules.freePlayRuleConfigurationId) {
            validateDraftBoard(createRequest.board, requestedBoardSize)
        }

        val snapshot = GameRules.startGame(
            selectedRuleConfigurationId,
            createRequest.startingSide ?: Side.dragons,
            requestedBoardSize,
            createRequest.board
        )
        GameSessionFactory.createFreshStoredGame(
            gameId = gameId,
            gameSlug = gameSlug,
            snapshot = snapshot,
            selectedRuleConfigurationId = snapshot.ruleConfigurationId,
            selectedStartingSide = snapshot.activeSide,
            selectedBoardSize = snapshot.boardSize,
            createdByUserId = createdByUserId,
            now = Instant.now(clock)
        ).toGameRecord()
    }

    override fun applyCommand(current: PlatformGameRecord, command: JsonNode, actingUserId: String?): PlatformGameRecord =
        translateExceptions {
            val storedGame = current.toStoredGame()
            val commandType = command.get("type")?.asText()
            val updated = when (commandType) {
                "claim-side" -> {
                    val request = gameJsonCodec.convert(command, ClaimSideRequest::class.java)
                    requireExpectedVersion(storedGame.session, command)
                    gameCommandService.claimSide(
                        storedGame,
                        request.side,
                        actingUserId ?: throw ForbiddenActionException("You must sign in before claiming a side.")
                    )
                }
                "assign-bot-opponent" -> {
                    val request = gameJsonCodec.convert(command, AssignBotOpponentRequest::class.java)
                    requireExpectedVersion(storedGame.session, command)
                    val botDefinition = botRegistry.requireSupportedDefinition(request.botId, storedGame.session.selectedRuleConfigurationId)
                    gameCommandService.assignBotOpponent(
                        storedGame,
                        actingUserId ?: throw ForbiddenActionException("You must sign in before assigning a bot opponent."),
                        botDefinition
                    )
                }
                "assign-player-seat" -> {
                    val request = gameJsonCodec.convert(command, AssignPlayerSeatRequest::class.java)
                    requireExpectedVersion(storedGame.session, command)
                    actingUserId ?: throw ForbiddenActionException("You must sign in before adding a player.")
                    gameCommandService.assignPlayerSeat(
                        storedGame,
                        request.side,
                        request.playerUserId
                    )
                }
                else -> {
                    val request = gameJsonCodec.convert(command, GameCommandRequest::class.java)
                    gameCommandService.applyCommand(storedGame, request, actingUserId)
                }
            }
            updated.toGameRecord(publiclyListed = current.publiclyListed)
        }

    override fun afterCommandPersisted(
        persisted: PlatformGameRecord,
        persist: (PlatformGameRecord) -> PlatformGameRecord
    ): PlatformGameRecord {
        val storedGame = persisted.toStoredGame()
        return botTurnRunner.runBotTurns(storedGame) { game ->
            persist(game.toGameRecord(publiclyListed = persisted.publiclyListed)).toStoredGame()
        }.toGameRecord(publiclyListed = persisted.publiclyListed)
    }

    override fun gameView(current: PlatformGameRecord, currentUserId: String?): JsonNode {
        val game = current.toStoredGame().session
        val userAccountService = userAccountServiceProvider.getObject()
        val currentUser = userAccountService.currentUserSummary(currentUserId)
        return gameJsonCodec.valueToTree(
            GameViewResponse(
                game = game,
                currentUser = currentUser,
                dragonsPlayer = game.dragonsPlayerUserId?.let { userAccountService.findUser(it) }?.let { GamePlayerSummary(it.id, it.displayName) },
                ravensPlayer = game.ravensPlayerUserId?.let { userAccountService.findUser(it) }?.let { GamePlayerSummary(it.id, it.displayName) },
                dragonsBot = botRegistry.summaryFor(game.dragonsBotId),
                ravensBot = botRegistry.summaryFor(game.ravensBotId),
                availableBots = botRegistry.availableBotsFor(game.selectedRuleConfigurationId),
                viewerRole = when (currentUserId) {
                    null -> ViewerRole.anonymous
                    game.dragonsPlayerUserId -> ViewerRole.dragons
                    game.ravensPlayerUserId -> ViewerRole.ravens
                    else -> ViewerRole.spectator
                }
            )
        )
    }

    override fun publicState(current: PlatformGameRecord): JsonNode =
        gameJsonCodec.valueToTree(current.toStoredGame().session)

    override fun publicGameDetails(current: PlatformGameRecord): PublicGameDetails {
        val game = current.toStoredGame().session
        return PublicGameDetails(
            gameName = RavensAndDragonsGameModuleDefinition.identity.displayName,
            openSeats = listOf(
                game.dragonsPlayerUserId to game.dragonsBotId,
                game.ravensPlayerUserId to game.ravensBotId
            ).count { (playerUserId, botId) -> playerUserId == null && botId == null }
        )
    }

    override fun playerGameDetails(current: PlatformGameRecord, currentUserId: String): PlayerGameDetails? {
        val game = current.toStoredGame().session
        val playerSides = listOfNotNull(
            Side.dragons.takeIf { game.dragonsPlayerUserId == currentUserId },
            Side.ravens.takeIf { game.ravensPlayerUserId == currentUserId }
        )
        if (playerSides.isEmpty()) {
            return null
        }
        return PlayerGameDetails(
            gameName = RavensAndDragonsGameModuleDefinition.identity.displayName,
            isCurrentUserTurn = game.lifecycle != GameLifecycle.finished && game.snapshot.activeSide in playerSides
        )
    }

    override fun playerUserIds(current: PlatformGameRecord): Set<String> {
        val game = current.toStoredGame().session
        return setOfNotNull(game.dragonsPlayerUserId, game.ravensPlayerUserId)
    }

    override fun clearUserReferences(current: PlatformGameRecord, userId: String): PlatformGameRecord? {
        val storedGame = current.toStoredGame()
        val session = storedGame.session
        if (session.dragonsPlayerUserId != userId && session.ravensPlayerUserId != userId && session.createdByUserId != userId) {
            return null
        }
        return storedGame.copy(
            session = session.copy(
                version = session.version + 1,
                updatedAt = Instant.now(clock),
                dragonsPlayerUserId = session.dragonsPlayerUserId.takeUnless { it == userId },
                ravensPlayerUserId = session.ravensPlayerUserId.takeUnless { it == userId },
                createdByUserId = session.createdByUserId.takeUnless { it == userId }
            )
        ).toGameRecord(publiclyListed = current.publiclyListed)
    }

    private fun requireExpectedVersion(session: GameSession, command: JsonNode) {
        val expectedVersion = command.get("expectedVersion")?.asLong()
            ?: throw PlatformInvalidCommandException("Command ${command.get("type")?.asText()} requires expectedVersion.")
        if (expectedVersion != session.version) {
            throw PlatformVersionConflictException(gameJsonCodec.valueToTree(session))
        }
    }

    private fun PlatformGameRecord.toStoredGame(): StoredGame =
        StoredGame(
            session = readPublicState(),
            undoEntries = gameJsonCodec.readUndoEntries(gameJsonCodec.writeJson(privateState)),
            lastAccessedAt = lastAccessedAt
        )

    private fun PlatformGameRecord.readPublicState(): GameSession =
        if (publicState.has("id")) {
            gameJsonCodec.convert(publicState, GameSession::class.java)
        } else {
            val snapshot = gameJsonCodec.convert(publicState, GameSnapshot::class.java)
            GameSessionFactory.createStoredGame(
                gameId = id,
                gameSlug = gameSlug,
                snapshot = snapshot,
                undoEntries = emptyList(),
                version = version,
                createdAt = createdAt,
                updatedAt = updatedAt,
                lastAccessedAt = lastAccessedAt,
                lifecycle = GameLifecycle.valueOf(lifecycle),
                selectedRuleConfigurationId = snapshot.ruleConfigurationId,
                selectedStartingSide = snapshot.activeSide,
                selectedBoardSize = snapshot.boardSize,
                createdByUserId = createdByUserId
            ).session
        }

    private fun StoredGame.toGameRecord(publiclyListed: Boolean = true): PlatformGameRecord =
        PlatformGameRecord(
            id = session.id,
            gameSlug = session.gameSlug,
            version = session.version,
            createdAt = session.createdAt,
            updatedAt = session.updatedAt,
            lifecycle = session.lifecycle.name,
            publicState = gameJsonCodec.valueToTree(session),
            privateState = gameJsonCodec.valueToTree(undoEntries),
            createdByUserId = session.createdByUserId,
            lastAccessedAt = lastAccessedAt,
            publiclyListed = publiclyListed
        )

    private fun validateDraftBoard(board: Map<String, Piece>?, boardSize: Int) {
        board?.keys?.forEach { square ->
            require(BoardCoordinates.isValidSquare(square, boardSize)) {
                "Square $square is outside the ${boardSize}x${boardSize} board."
            }
        }
    }

    private fun <T> translateExceptions(action: () -> T): T =
        try {
            action()
        } catch (exception: RavensInvalidCommandException) {
            throw PlatformInvalidCommandException(exception.message ?: "Invalid command.")
        } catch (exception: RavensVersionConflictException) {
            throw PlatformVersionConflictException(gameJsonCodec.valueToTree(exception.latestGame))
        }
}
