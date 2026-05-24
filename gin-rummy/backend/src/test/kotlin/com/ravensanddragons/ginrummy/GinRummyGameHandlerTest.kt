package com.ravensanddragons.ginrummy

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class GinRummyGameHandlerTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val handler = GinRummyGameHandler(
        objectMapper,
        Clock.fixed(Instant.parse("2026-05-23T00:00:00Z"), ZoneOffset.UTC)
    )

    @Test
    fun createsConfigurableGameWithHandDealtBeforeSeatsAreClaimed() {
        val request = objectMapper.createObjectNode()
            .put("targetScore", 250)
            .put("playMode", "bestOfFiveMatch")
            .put("bigGinAllowed", true)
            .put("optionalDealRule", true)
            .put("lineBonusEnabled", true)
            .put("shutoutBonusEnabled", false)
            .put("aceHighAllowed", true)

        val game = handler.createGame("GIN1234", request, "creator")
        val state = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java)

        assertEquals("active", state.lifecycle)
        assertEquals("discardOnly", state.phase)
        assertEquals(0, state.dealerSeat)
        assertEquals(1, state.currentSeat)
        assertEquals(listOf(10, 11), state.handCounts)
        assertEquals(0, state.discardCount)
        assertEquals(31, state.stockCount)
        assertEquals(250, state.config.targetScore)
        assertEquals("bestOfFiveMatch", state.config.playMode)
        assertTrue(state.config.bigGinAllowed)
        assertTrue(state.config.aceHighAllowed)
    }

    @Test
    fun claimingSeatsPreservesAlreadyDealtOptionalHand() {
        val created = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")
        var game = handler.applyCommand(created, command(created.version, "claimSeat").put("seat", 0).put("playerUserId", "u1").put("displayName", "One"), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 1).put("playerUserId", "u2").put("displayName", "Two"), "u2")

        val state = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java)

        assertEquals("discardOnly", state.phase)
        assertEquals(1, state.currentSeat)
        assertEquals(listOf(10, 11), state.handCounts)
        assertEquals(0, state.discardCount)
        assertEquals(31, state.stockCount)
        assertEquals(objectMapper.treeToValue(created.publicState, GinRummyPublicState::class.java).handCounts, state.handCounts)
        assertTrue(state.config.aceHighAllowed)
    }

    @Test
    fun nextHandDealsWithoutSeatedPlayers() {
        val created = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")
        val game = handler.applyCommand(created, command(created.version, "nextHand"), "u1")

        val state = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java)

        assertEquals("discardOnly", state.phase)
        assertEquals(1, state.dealerSeat)
        assertEquals(0, state.currentSeat)
        assertEquals(2, state.roundNumber)
        assertEquals(listOf(11, 10), state.handCounts)
        assertEquals(31, state.stockCount)
    }

    @Test
    fun startHandCommandIsNotSupportedAfterCreationDealsImmediately() {
        val created = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")

        val thrown = org.junit.jupiter.api.assertThrows<RuntimeException> {
            handler.applyCommand(created, command(created.version, "startHand"), "u1")
        }

        assertEquals("Unsupported Gin Rummy command: startHand.", thrown.message)
    }

    @Test
    fun meldSolverSupportsAceHighRunsWhenConfigured() {
        val cards = listOf(
            card("Q", "spades"),
            card("K", "spades"),
            card("A", "spades"),
            card("7", "clubs")
        )

        val lowOnly = GinRummyMeldSolver.arrangements(cards, aceHighAllowed = false).first()
        val aceHigh = GinRummyMeldSolver.arrangements(cards, aceHighAllowed = true).first()

        assertEquals(28, lowOnly.deadwoodScore)
        assertEquals(7, aceHigh.deadwoodScore)
    }

    @Test
    fun meldSolverAllowsThreeCardSetSubsetWhenFourOfAKindCanShareRankWithRun() {
        val cards = listOf(
            card("8", "spades"),
            card("9", "spades"),
            card("10", "spades"),
            card("3", "clubs"),
            card("2", "clubs"),
            card("A", "clubs"),
            card("A", "hearts"),
            card("2", "spades"),
            card("2", "diamonds"),
            card("2", "hearts")
        )

        val best = GinRummyMeldSolver.arrangements(cards, aceHighAllowed = false).first()

        assertEquals(1, best.deadwoodScore)
        assertEquals(listOf("A_hearts"), best.deadwood)
        assertTrue(best.melds.any { it.toSet() == setOf("A_clubs", "2_clubs", "3_clubs") })
        assertTrue(best.melds.any { it.toSet() == setOf("2_spades", "2_diamonds", "2_hearts") })
        assertTrue(best.melds.any { it.toSet() == setOf("8_spades", "9_spades", "10_spades") })
    }

    @Test
    fun viewIncludesPrivateHandOnlyForSeatedViewerAfterSeatsAutoStartHand() {
        var game = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "u1").put("displayName", "One"), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 1).put("playerUserId", "u2").put("displayName", "Two"), "u2")

        val view = handler.gameView(game, "u2")
        val state = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java)

        assertEquals("discardOnly", state.phase)
        assertNotNull(view.get("viewer").get("hands").get("1"))
        assertEquals(null, view.get("viewer").get("hands").get("0"))
    }

    @Test
    fun clearUserReferencesBumpsVersionForStartupGuestCleanupPersistence() {
        var game = handler.createGame("GIN1234", objectMapper.createObjectNode(), "guest-user")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "guest-user").put("displayName", "Guest"), "guest-user")

        val updated = handler.clearUserReferences(game, "guest-user")

        assertNotNull(updated)
        val state = objectMapper.treeToValue(updated.publicState, GinRummyPublicState::class.java)
        assertEquals(game.version + 1, updated.version)
        assertEquals(game.version + 1, state.version)
        assertEquals(null, state.seats[0].userId)
        assertEquals(null, state.createdByUserId)
    }

    @Test
    fun clearingAndReclaimingCurrentSeatPreservesDrawTurn() {
        var game = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "u1").put("displayName", "One"), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 1).put("playerUserId", "u2").put("displayName", "Two"), "u2")
        val firstDiscard = objectMapper.treeToValue(game.privateState, GinRummyPrivateState::class.java).hands[1].first().id
        game = handler.applyCommand(game, command(game.version, "discard").put("cardId", firstDiscard), "u2")
        game = handler.applyCommand(game, command(game.version, "clearSeat").put("seat", 0), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "u3").put("displayName", "Three"), "u3")

        val reclaimed = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java)

        assertEquals("draw", reclaimed.phase)
        assertEquals(0, reclaimed.currentSeat)
        assertEquals(listOf(10, 10), reclaimed.handCounts)

        val drawn = handler.applyCommand(game, command(game.version, "drawStock"), "u3")
        val afterDraw = objectMapper.treeToValue(drawn.publicState, GinRummyPublicState::class.java)

        assertEquals("discard", afterDraw.phase)
        assertEquals(listOf(11, 10), afterDraw.handCounts)
    }

    @Test
    fun viewIdentifiesDiscardDrawnCardForCurrentTurn() {
        val request = objectMapper.createObjectNode().put("optionalDealRule", false)
        var game = handler.createGame("GIN1234", request, "creator")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "u1").put("displayName", "One"), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 1).put("playerUserId", "u2").put("displayName", "Two"), "u2")
        val upcardId = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java).discardTop!!.id

        game = handler.applyCommand(game, command(game.version, "drawDiscard"), "u2")
        val view = handler.gameView(game, "u2")

        assertEquals(upcardId, view.get("viewer").get("drewDiscardCardId").asText())
    }

    private fun command(version: Long, type: String) =
        objectMapper.createObjectNode().put("expectedVersion", version).put("type", type)

    private fun card(rank: String, suit: String): GinRummyCard =
        GinRummyCard("${rank}_$suit", rank, suit)
}
