package com.ravensanddragons.lunarbase

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.ravensanddragons.platform.game.runtime.GameRecord
import com.ravensanddragons.platform.game.runtime.InvalidCommandException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class LunarBaseGameHandlerTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val handler = LunarBaseGameHandler(
        objectMapper = objectMapper,
        clock = Clock.fixed(Instant.parse("2026-06-01T00:00:00Z"), ZoneOffset.UTC)
    )

    @Test
    fun createsInitialDealWithPrivateHands() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2, useInfluences = true), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()

        assertEquals("LUNAR01", publicState.id)
        assertEquals("lunar-base", publicState.gameSlug)
        assertEquals(2, publicState.config.playerCount)
        assertEquals(true, publicState.config.useInfluences)
        assertEquals(5, publicState.supply.size)
        assertEquals(3, publicState.players[0].handCount)
        assertEquals(3, publicState.players[1].handCount)
        assertEquals(69, publicState.stockCount)
        assertEquals(1, publicState.players[0].board.size)
        assertEquals("station", publicState.players[0].board[0].card.type)
        assertEquals(0, publicState.players[0].board[0].rotation)
        assertEquals(0, publicState.players[1].board[0].rotation)
        assertEquals(4, privateState.unseenStations.size)
        assertEquals(3, privateState.hands[0].size)
    }

    @Test
    fun viewerOnlyReceivesTheirOwnHand() {
        val claimed = handler.applyCommand(
            handler.createGame("LUNAR01", createRequest(), "creator"),
            command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"),
            "user-1"
        )

        val view = handler.gameView(claimed, "user-1")
        val viewer = view.get("viewer")
        assertEquals(0, viewer.get("seatIndex").asInt())
        assertEquals(3, viewer.get("hand").size())

        val strangerView = handler.gameView(claimed, "stranger")
        assertEquals(true, strangerView.get("viewer").get("seatIndex").isNull)
        assertEquals(0, strangerView.get("viewer").get("hand").size())
    }

    @Test
    fun passTurnMovesToNextPlayer() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        val passed = handler.applyCommand(game, command("passTurn", 3), "user-1")

        assertEquals(1, passed.readPublicState().currentPlayerIndex)
    }

    @Test
    fun rejectsActionFromNonCurrentPlayer() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(game, command("drawStock", 3), "user-2")
        }

        assertEquals("It is not your turn.", exception.message)
    }

    @Test
    fun drawingStockAddsCardToCurrentPlayersPrivateHand() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")

        val drawn = handler.applyCommand(game, command("drawStock", 2), "user-1")
        val publicState = drawn.readPublicState()
        val privateState = drawn.readPrivateState()

        assertEquals(4, publicState.players[0].handCount)
        assertEquals(60, publicState.stockCount)
        assertEquals(4, privateState.hands[0].size)
        assertNotNull(handler.gameView(drawn, "user-1").get("viewer").get("hand").firstOrNull())
    }

    @Test
    fun playingModulePreservesExactRotation() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = ensureCurrentPlayerHasModule(game)
        val module = game.readPrivateState().hands[0].first { it.type == "module" }

        val played = handler.applyCommand(
            game,
            command("playModule", game.readPublicState().version)
                .put("cardId", module.id)
                .put("x", 1)
                .put("y", 0)
                .put("rotation", 270),
            "user-1"
        )

        val boardCard = played.readPublicState().players[0].board.last()
        assertEquals(270, boardCard.rotation)
    }

    @Test
    fun refillingSupplyDealsFullSupplySizeWithoutCountingKeptInfluences() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2, useInfluences = true), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val keptInfluences = listOf(
            LunarBaseCard(id = "influence-kept-1", number = 79, type = "influence"),
            LunarBaseCard(id = "influence-kept-2", number = 80, type = "influence")
        )
        val stock = List(8) { index -> LunarBaseCard(id = "module-refill-${index + 1}", number = index + 10, type = "module") }
        val refillReadyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    supply = keptInfluences,
                    stockCount = stock.size
                )
            ),
            privateState = objectMapper.valueToTree(privateState.copy(stock = stock))
        )

        val passed = handler.applyCommand(refillReadyGame, command("passTurn", publicState.version), "user-1")
        val nextPublic = passed.readPublicState()
        val nextPrivate = passed.readPrivateState()

        assertEquals(7, nextPublic.supply.size)
        assertEquals(keptInfluences, nextPublic.supply.take(2))
        assertEquals(stock.take(5), nextPublic.supply.drop(2))
        assertEquals(stock.drop(5), nextPrivate.stock)
    }

    private fun createRequest(playerCount: Int = 2, useInfluences: Boolean = false): JsonNode =
        objectMapper.createObjectNode()
            .put("playerCount", playerCount)
            .put("useInfluences", useInfluences)
            .put("publiclyListed", true)

    private fun command(type: String, expectedVersion: Long) =
        objectMapper.createObjectNode()
            .put("type", type)
            .put("expectedVersion", expectedVersion)

    private fun ensureCurrentPlayerHasModule(game: GameRecord): GameRecord {
        val privateState = game.readPrivateState()
        if (privateState.hands[0].any { it.type == "module" }) {
            return game
        }
        val module = privateState.stock.first { it.type == "module" }
        val nextPrivate = privateState.copy(
            hands = privateState.hands.mapIndexed { index, hand -> if (index == 0) hand + module else hand },
            stock = privateState.stock.filterNot { it.id == module.id }
        )
        val publicState = game.readPublicState()
        val nextPublic = publicState.copy(
            players = publicState.players.mapIndexed { index, player ->
                if (index == 0) {
                    player.copy(handCount = nextPrivate.hands[0].size, influenceHandCount = nextPrivate.hands[0].count { it.type == "influence" })
                } else {
                    player
                }
            },
            stockCount = nextPrivate.stock.size
        )
        return game.copy(
            publicState = objectMapper.valueToTree(nextPublic),
            privateState = objectMapper.valueToTree(nextPrivate)
        )
    }

    private fun GameRecord.readPublicState(): LunarBasePublicState =
        objectMapper.treeToValue(publicState, LunarBasePublicState::class.java)

    private fun GameRecord.readPrivateState(): LunarBasePrivateState =
        objectMapper.treeToValue(privateState, LunarBasePrivateState::class.java)
}
