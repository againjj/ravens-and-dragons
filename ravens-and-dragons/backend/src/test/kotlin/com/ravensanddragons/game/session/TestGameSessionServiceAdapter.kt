package com.ravensanddragons.game.session

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.ravensanddragons.auth.UserAccountService
import com.ravensanddragons.game.RavensAndDragonsGameHandler
import com.ravensanddragons.game.RavensAndDragonsGameModuleDefinition
import com.ravensanddragons.game.bot.BotRegistry
import com.ravensanddragons.game.bot.BotTurnRunner
import com.ravensanddragons.game.model.CreateGameRequest
import com.ravensanddragons.game.model.GameCommandRequest
import com.ravensanddragons.game.model.InvalidCommandException
import com.ravensanddragons.game.model.GameSession
import com.ravensanddragons.game.model.VersionConflictException
import com.ravensanddragons.game.model.Side
import com.ravensanddragons.platform.game.runtime.PlayerGameListing
import com.ravensanddragons.platform.game.runtime.PlayerAccountValidator
import com.ravensanddragons.game.persistence.InMemoryGameStore
import com.ravensanddragons.game.persistence.TestGameStoreAdapter
import com.ravensanddragons.game.persistence.defaultGameJsonCodec
import org.springframework.beans.factory.ObjectProvider
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executor

typealias GameIdGenerator = com.ravensanddragons.platform.game.runtime.GameIdGenerator

class GameSessionService(
    private val store: TestGameStoreAdapter,
    clock: Clock,
    staleGameThreshold: Duration,
    gameCommandService: GameCommandService,
    botRegistry: BotRegistry,
    botTurnRunner: BotTurnRunner,
    commandFollowUpExecutor: Executor = Executor { it.run() }
) {
    companion object {
        val defaultStaleGameThreshold: Duration =
            com.ravensanddragons.platform.game.runtime.GameSessionService.defaultStaleGameThreshold
    }

    private val gameJsonCodec = defaultGameJsonCodec()
    private val delegate = com.ravensanddragons.platform.game.runtime.GameSessionService(
        gameStore = store.platformStore(),
        clock = clock,
        staleGameThreshold = staleGameThreshold,
        gameHandlers = listOf(
            RavensAndDragonsGameHandler(
                gameCommandService = gameCommandService,
                botRegistry = botRegistry,
                botTurnRunner = botTurnRunner,
                gameJsonCodec = gameJsonCodec,
                userAccountServiceProvider = EmptyUserAccountServiceProvider,
                clock = clock
            )
        ),
        playerAccountValidator = NoopPlayerAccountValidator,
        commandFollowUpExecutor = commandFollowUpExecutor
    )

    fun createGame(request: CreateGameRequest = CreateGameRequest(), createdByUserId: String? = null): GameSession =
        createGame(RavensAndDragonsGameModuleDefinition.identity.slug, request, createdByUserId)

    fun createGame(gameSlug: String, request: CreateGameRequest = CreateGameRequest(), createdByUserId: String? = null): GameSession =
        translatePlatformExceptions {
            gameJsonCodec.convert(
                delegate.createGame(gameSlug, gameJsonCodec.valueToTree(request), createdByUserId),
                GameSession::class.java
            )
        }

    fun getGame(gameId: String): GameSession =
        gameJsonCodec.convert(delegate.getGame(gameId), GameSession::class.java)

    fun claimSide(gameId: String, side: Side, userId: String): GameSession {
        val current = getGame(gameId)
        return applyCommand(
            gameId,
            GameCommandRequest(expectedVersion = current.version, type = "claim-side", side = side),
            userId
        )
    }

    fun assignBotOpponent(gameId: String, botId: String, userId: String): GameSession {
        val current = getGame(gameId)
        val command = gameJsonCodec.valueToTree(
            mapOf(
                "expectedVersion" to current.version,
                "type" to "assign-bot-opponent",
                "botId" to botId
            )
        )
        return translatePlatformExceptions {
            gameJsonCodec.convert(delegate.applyCommand(gameId, command, userId), GameSession::class.java)
        }
    }

    fun applyCommand(gameId: String, command: GameCommandRequest): GameSession =
        applyCommand(gameId, command, null)

    fun applyCommand(gameId: String, command: GameCommandRequest, actingUserId: String?): GameSession =
        translatePlatformExceptions {
            gameJsonCodec.convert(
                delegate.applyCommand(gameId, gameJsonCodec.valueToTree(command), actingUserId),
                GameSession::class.java
            )
        }

    fun createEmitter(gameId: String): SseEmitter =
        delegate.createEmitter(gameId)

    fun createEmitter(gameId: String, emitter: SseEmitter): SseEmitter {
        return delegate.createEmitter(gameId, emitter)
    }

    fun listPlayerGames(currentUserId: String): List<PlayerGameListing> =
        delegate.listPlayerGames(currentUserId)

    fun createPlayerGamesEmitter(currentUserId: String, emitter: SseEmitter): SseEmitter =
        delegate.createPlayerGamesEmitter(currentUserId, emitter)

    fun removeStaleGames(now: Instant) {
        delegate.removeStaleGames(now)
    }
}

fun defaultObjectMapper(): ObjectMapper =
    jacksonObjectMapper()
        .registerKotlinModule()
        .registerModule(JavaTimeModule())
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

private fun <T> translatePlatformExceptions(action: () -> T): T =
    try {
        action()
    } catch (exception: com.ravensanddragons.platform.game.runtime.InvalidCommandException) {
        throw InvalidCommandException(exception.message ?: "Invalid command.")
    } catch (exception: com.ravensanddragons.platform.game.runtime.VersionConflictException) {
        throw VersionConflictException(defaultGameJsonCodec().convert(exception.latestState, GameSession::class.java))
    }

private object EmptyUserAccountServiceProvider : ObjectProvider<UserAccountService> {
    override fun getObject(vararg args: Any?): UserAccountService =
        throw UnsupportedOperationException("UserAccountService is not available in this test adapter.")

    override fun getIfAvailable(): UserAccountService? = null

    override fun getIfUnique(): UserAccountService? = null

    override fun getObject(): UserAccountService =
        throw UnsupportedOperationException("UserAccountService is not available in this test adapter.")
}

private object NoopPlayerAccountValidator : PlayerAccountValidator {
    override fun requirePlayerAccountsExist(userIds: Set<String>) = Unit
}
