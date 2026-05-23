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
    fun createsConfigurableSetupGameWithDealerMarkedBeforeSeatsAreClaimed() {
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

        assertEquals("setup", state.phase)
        assertEquals(0, state.dealerSeat)
        assertEquals(250, state.config.targetScore)
        assertEquals("bestOfFiveMatch", state.config.playMode)
        assertTrue(state.config.bigGinAllowed)
        assertTrue(state.config.aceHighAllowed)
    }

    @Test
    fun optionalDealStartsWithElevenCardsForNonDealerAndEmptyDiscard() {
        var game = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "u1").put("displayName", "One"), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 1).put("playerUserId", "u2").put("displayName", "Two"), "u2")

        val state = objectMapper.treeToValue(game.publicState, GinRummyPublicState::class.java)

        assertEquals("discardOnly", state.phase)
        assertEquals(1, state.currentSeat)
        assertEquals(listOf(10, 11), state.handCounts)
        assertEquals(0, state.discardCount)
        assertEquals(31, state.stockCount)
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
    fun viewIncludesPrivateHandOnlyForSeatedViewer() {
        var game = handler.createGame("GIN1234", objectMapper.createObjectNode(), "creator")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 0).put("playerUserId", "u1").put("displayName", "One"), "u1")
        game = handler.applyCommand(game, command(game.version, "claimSeat").put("seat", 1).put("playerUserId", "u2").put("displayName", "Two"), "u2")
        game = handler.applyCommand(game, command(game.version, "startHand"), "u1")

        val view = handler.gameView(game, "u2")

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

    private fun command(version: Long, type: String) =
        objectMapper.createObjectNode().put("expectedVersion", version).put("type", type)

    private fun card(rank: String, suit: String): GinRummyCard =
        GinRummyCard("${rank}_$suit", rank, suit)
}
