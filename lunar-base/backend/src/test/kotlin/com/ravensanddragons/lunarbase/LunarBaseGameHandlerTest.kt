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
        val publicState = game.readClientPublicState()
        val privateState = game.readPrivateState()
        val rawStationCard = game.publicState.at("/players/0/board/0/card")

        assertEquals("LUNAR01", publicState.id)
        assertEquals("lunar-base", publicState.gameSlug)
        assertEquals(2, publicState.config.playerCount)
        assertEquals(true, publicState.config.useInfluences)
        assertEquals(5, publicState.supply.size)
        assertEquals(3, publicState.players[0].handCount)
        assertEquals(3, publicState.players[1].handCount)
        assertEquals(73, publicState.stockCount)
        assertEquals(1, publicState.players[0].board.size)
        assertEquals("station", publicState.players[0].board[0].card.type)
        assertEquals(false, publicState.players[0].board[0].card.flipped)
        assertEquals("Terran Outpost", publicState.players[0].board[0].card.name)
        assertEquals(emptyList(), publicState.players[0].board[0].card.orbs)
        assertEquals("Terran Outpost", publicState.players[0].board[0].card.stationFrontName)
        assertEquals("The Oasis", publicState.players[0].board[0].card.stationBackName)
        assertEquals(listOf("blue", "red"), publicState.players[0].board[0].card.stationBackOrbs)
        assertEquals(1, publicState.players[0].board[0].card.stationBackColonists)
        assertEquals(listOf(12), publicState.players[0].board[0].card.stationBackAchievements)
        assertEquals("The Oasis", rawStationCard.get("name").asText())
        assertEquals(false, rawStationCard.has("number"))
        assertEquals(false, rawStationCard.has("orbs"))
        assertEquals(false, rawStationCard.has("connectors"))
        assertEquals(false, rawStationCard.has("stationBackName"))
        assertEquals("gray", publicState.players[0].board[0].card.connectors?.topRight)
        assertEquals("yellow", publicState.players[0].board[0].card.connectors?.bottomRight)
        assertEquals(0, publicState.players[0].board[0].rotation)
        assertEquals(0, publicState.players[1].board[0].rotation)
        assertEquals(4, privateState.unseenStations.size)
        assertEquals(3, privateState.hands[0].size)
        assertEquals("Asteroid Grinder", (publicState.supply.filterNotNull() + privateState.stock + privateState.hands.flatten()).first { it.name == "Asteroid Grinder" }.name)
        assertEquals(listOf("blue", "red"), (publicState.players.map { it.board.single().card } + privateState.unseenStations).first { it.stationBackName == "The Oasis" }.stationBackOrbs)
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

        val anonymousView = handler.gameView(claimed, null)
        assertEquals(true, anonymousView.get("viewer").get("seatIndex").isNull)
        assertEquals(0, anonymousView.get("viewer").get("hand").size())
    }

    @Test
    fun commandResponseIncludesOnlyActingUsersViewerDataAfterClaimingSeat() {
        val created = handler.createGame("LUNAR01", createRequest(), "creator")
        val claimed = handler.applyCommand(
            created,
            command("claimSeat", 1).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"),
            "user-2"
        )

        val response = handler.commandResponseState(claimed, claimed, "user-2")
        val viewer = response.get("viewer")

        assertEquals(1, viewer.get("seatIndex").asInt())
        assertEquals(3, viewer.get("hand").size())
        assertEquals(3, response.get("players").get(0).get("handCount").asInt())
        assertEquals(3, response.get("players").get(1).get("handCount").asInt())
        assertEquals(false, response.get("players").get(0).has("hand"))
        assertEquals(false, response.get("players").get(1).has("hand"))
    }

    @Test
    fun rejectsClaimingMoreThanOneSeatForTheSameUser() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(
                game,
                command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-1").put("displayName", "Ada"),
                "user-1"
            )
        }

        assertEquals("That player is already seated.", exception.message)
    }

    @Test
    fun gameViewAddsCatalogOrbsFromCardName() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val artificialIntellect = LunarBaseCard(
            id = "artificial-intellect",
            type = "module",
            name = "Artificial Intellect"
        )
        val privateState = game.readPrivateState().copy(hands = game.readPrivateState().hands.replaceAt(0, listOf(artificialIntellect)))
        val publicState = game.readPublicState().copy(players = game.readPublicState().players.replaceAt(0, game.readPublicState().players[0].copy(handCount = 1)))
        game = game.copy(
            publicState = objectMapper.valueToTree(publicState),
            privateState = objectMapper.valueToTree(privateState)
        )

        val handCard = handler.gameView(game, "user-1").get("viewer").get("hand").single()

        assertEquals("Artificial Intellect", handCard.get("name").asText())
        assertEquals("red", handCard.get("orbs").single().asText())
    }

    @Test
    fun gameViewAddsCatalogColonistsAndAchievementOrdinalsFromCardName() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val baconPrinter = LunarBaseCard(
            id = "bacon-printer",
            type = "module",
            name = "Bacon Printer"
        )
        val privateState = game.readPrivateState().copy(hands = game.readPrivateState().hands.replaceAt(0, listOf(baconPrinter)))
        val publicState = game.readPublicState().copy(players = game.readPublicState().players.replaceAt(0, game.readPublicState().players[0].copy(handCount = 1)))
        game = game.copy(
            publicState = objectMapper.valueToTree(publicState),
            privateState = objectMapper.valueToTree(privateState)
        )

        val handCard = handler.gameView(game, "user-1").get("viewer").get("hand").single()

        assertEquals(1, handCard.get("colonists").asInt())
        assertEquals(listOf(6), handCard.get("achievements").map { it.asInt() })
    }

    @Test
    fun gameViewBuildsReadableCatalogActionText() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val actionCards = listOf(
            LunarBaseCard(id = "space-unicorn", type = "agent", name = "Space Unicorn"),
            LunarBaseCard(id = "fusion-reactor", type = "module", name = "Fusion Reactor"),
            LunarBaseCard(id = "satellite", type = "module", name = "Satellite"),
            LunarBaseCard(id = "crazy-president", type = "agent", name = "Crazy President"),
            LunarBaseCard(id = "lunar-capital", type = "module", name = "Lunar Capital"),
            LunarBaseCard(id = "double-agent", type = "agent", name = "Double Agent"),
            LunarBaseCard(id = "spybot", type = "agent", name = "Spybot.py"),
            LunarBaseCard(id = "artificial-intellect", type = "module", name = "Artificial Intellect"),
            LunarBaseCard(id = "lunar-alliance", type = "influence", name = "Lunar Alliance"),
            LunarBaseCard(id = "entropic-cascade", type = "influence", name = "Entropic Cascade")
        )
        val privateState = game.readPrivateState().copy(hands = game.readPrivateState().hands.replaceAt(0, actionCards))
        val publicState = game.readPublicState().copy(players = game.readPublicState().players.replaceAt(0, game.readPublicState().players[0].copy(handCount = actionCards.size)))
        game = game.copy(
            publicState = objectMapper.valueToTree(publicState),
            privateState = objectMapper.valueToTree(privateState)
        )

        val cardsByName = handler.gameView(game, "user-1")
            .get("viewer")
            .get("hand")
            .associateBy { it.get("name").asText() }
        val station = handler.publicState(game).at("/players/0/board/0/card")

        assertEquals(
            "Choose one:\nDraft 1 card\nBuild 2 modules; Draw 1 card",
            station.get("mainActionText").asText()
        )
        assertEquals(
            "Build 1 module\nDraw 1 card\nDiscard 1 card",
            cardsByName.getValue("Fusion Reactor").get("mainActionText").asText()
        )
        assertEquals(
            "Draw 1 card\nGain credits equal to your hand size",
            cardsByName.getValue("Space Unicorn").get("onPlayingText").asText()
        )
        assertEquals(
            "Resell cards equal to the number of influences in the supply",
            cardsByName.getValue("Satellite").get("onPlayingText").asText()
        )
        assertEquals(
            "Each player: Flip your station",
            cardsByName.getValue("Crazy President").get("onPlayingText").asText()
        )
        assertEquals(
            "Flip any number of stations",
            cardsByName.getValue("Lunar Capital").get("onPlayingText").asText()
        )
        assertEquals(
            "Neighbors of target: Flip your station",
            cardsByName.getValue("Double Agent").get("onPlayingText").asText()
        )
        assertEquals(
            "Choose an opponent\nView chosen player's hand\nChoose one: Draw 1 card or Chosen player: Discard 1 card",
            cardsByName.getValue("Spybot.py").get("onPlayingText").asText()
        )
        assertEquals(
            "Red orbs gain credits as well as yellow orbs",
            cardsByName.getValue("Artificial Intellect").get("effectText").asText()
        )
        assertEquals(
            "Stealing credits is forbidden",
            cardsByName.getValue("Lunar Alliance").get("effectText").asText()
        )
        assertEquals(
            "When this influence is discarded:\nDraw 4 cards; Discard 3 cards",
            cardsByName.getValue("Entropic Cascade").get("effectText").asText()
        )
    }

    @Test
    fun choosingMainActionResolvesThroughActorInputAndAdvancesTurn() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        val stationId = game.readPublicState().players[0].board[0].card.id
        val choosing = handler.applyCommand(game, command("chooseMainAction", 3).put("cardId", stationId), "user-1")
        val chooseState = choosing.readPublicState().actionState

        assertEquals("chooseOne", chooseState.interaction?.kind)
        assertEquals(0, chooseState.interaction?.actorIndex)
        assertEquals(listOf("Draft 1 card", "Build 2 modules; Draw 1 card"), chooseState.interaction?.buttons?.map { it.label })

        val drawing = handler.applyCommand(
            choosing,
            command("chooseActionOption", choosing.readPublicState().version).put("optionIndex", 1),
            "user-1"
        )

        assertEquals("build", drawing.readPublicState().actionState.interaction?.kind)

        val skippedBuild = handler.applyCommand(
            drawing,
            command("finishInteraction", drawing.readPublicState().version),
            "user-1"
        )

        assertEquals("draw", skippedBuild.readPublicState().actionState.interaction?.kind)

        val drawn = handler.applyCommand(
            skippedBuild,
            command("drawStock", skippedBuild.readPublicState().version),
            "user-1"
        )

        assertEquals(1, drawn.readPublicState().currentPlayerIndex)
        assertEquals(choosingMainActionPhase, drawn.readPublicState().actionState.phase)
        assertEquals(4, drawn.readClientPublicState().players[0].handCount)
    }

    @Test
    fun choosingMainActionUsesTheRevealedStationSide() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val publicState = game.readPublicState()
        val station = publicState.players[0].board[0].card.copy(
            name = "The Oasis",
            flipped = true
        )
        game = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    players = publicState.players.replaceAt(
                        0,
                        publicState.players[0].copy(board = listOf(publicState.players[0].board[0].copy(card = station)))
                    )
                )
            )
        )

        val choosing = handler.applyCommand(
            game,
            command("chooseMainAction", game.readPublicState().version).put("cardId", station.id),
            "user-1"
        )

        assertEquals(
            listOf("Draft 1 card", "Build 1 module; Draw 2 cards"),
            choosing.readPublicState().actionState.interaction?.buttons?.map { it.label }
        )
    }

    @Test
    fun choosingInvalidActionOptionLeavesTheChoiceOpen() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val stationId = game.readPublicState().players[0].board[0].card.id
        val choosing = handler.applyCommand(game, command("chooseMainAction", game.readPublicState().version).put("cardId", stationId), "user-1")

        val unchanged = handler.applyCommand(
            choosing,
            command("chooseActionOption", choosing.readPublicState().version).put("optionIndex", 99),
            "user-1"
        )

        assertEquals("chooseOne", unchanged.readPublicState().actionState.interaction?.kind)
        assertEquals(2, unchanged.readPublicState().actionState.interaction?.buttons?.size)
    }

    @Test
    fun rejectsPlayingAgentsAfterMainActionStarts() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "agent-after-main", type = "agent", name = "Guest Scientist"))

        val stationId = game.readPublicState().players[0].board[0].card.id
        val choosing = handler.applyCommand(game, command("chooseMainAction", game.readPublicState().version).put("cardId", stationId), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(
                choosing,
                command("playAgent", choosing.readPublicState().version).put("cardId", "agent-after-main"),
                "user-1"
            )
        }

        assertEquals("Agents cannot be played after choosing a main action.", exception.message)
    }

    @Test
    fun takingLastSupplyCardDoesNotRefillSupplyUntilTurnEnds() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val stock = listOf(
            LunarBaseCard(id = "stock-1", type = "module", name = "Struve Dome"),
            LunarBaseCard(id = "stock-2", type = "module", name = "Helium Factory")
        )
        val supplyCard = LunarBaseCard(id = "supply-last", type = "module", name = "Asteroid Grinder")
        var oneSupplyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    supply = listOf(supplyCard),
                    stockCount = stock.size
                )
            ),
            privateState = objectMapper.valueToTree(privateState.copy(stock = stock))
        )

        oneSupplyGame = actionGame(oneSupplyGame, "draft", mainActionChosen = true)
        val drafted = handler.applyCommand(oneSupplyGame, command("draftSupply", publicState.version).put("slotIndex", 0), "user-1")

        assertEquals(listOf("stock-1", "stock-2"), drafted.readClientPublicState().supply.filterNotNull().map { it.id })
        assertEquals(emptyList(), drafted.readPrivateState().stock)
    }

    @Test
    fun flippingStationTogglesCurrentPlayersPublicStationSide() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        game = actionGame(game, "flipStation", mainActionChosen = true)
        val flipped = handler.applyCommand(game, command("flipStation", 3), "user-1")
        val publicState = flipped.readClientPublicState()

        assertEquals(true, publicState.players[0].board[0].card.flipped)
        assertEquals("The Oasis", publicState.players[0].board[0].card.name)
        assertEquals(listOf("blue", "red"), publicState.players[0].board[0].card.orbs)
        assertEquals(1, publicState.players[0].board[0].card.colonists)
        assertEquals(listOf(12), publicState.players[0].board[0].card.achievements)
        assertEquals(false, publicState.players[1].board[0].card.flipped)
        assertEquals("Turn complete.", publicState.message)
    }

    @Test
    fun literalFlipStationActionCanTargetAnOpponentStation() {
        val game = seatedGameWithPlayers { _, player -> player }
        val opponentStationId = game.readPublicState().players[1].board[0].card.id

        val flipped = handler.applyCommand(
            actionGame(game, "flipStation", mainActionChosen = true),
            command("flipStation", game.readPublicState().version)
                .put("playerIndex", 1)
                .put("cardId", opponentStationId),
            "user-1"
        )

        assertEquals(false, flipped.readPublicState().players[0].board[0].card.flipped)
        assertEquals(true, flipped.readPublicState().players[1].board[0].card.flipped)
    }

    @Test
    fun selfFlipStationActionIgnoresOpponentTargeting() {
        val action = LunarBaseActionNode(kind = "flipStation", flipAmountKind = "self")
        val game = seatedGameWithPlayers { _, player -> player }

        val flipped = handler.applyCommand(
            actionGame(game, "flipStation", mainActionChosen = true, action = action),
            command("flipStation", game.readPublicState().version).put("playerIndex", 1),
            "user-1"
        )

        assertEquals(true, flipped.readPublicState().players[0].board[0].card.flipped)
        assertEquals(false, flipped.readPublicState().players[1].board[0].card.flipped)
    }

    @Test
    fun flippingStationDoesNotFlipTheSameStationTwiceInOneAction() {
        val game = seatedGameWithPlayers { _, player -> player }
        val stationId = game.readPublicState().players[0].board[0].card.id

        val firstFlip = handler.applyCommand(
            actionGame(game, "flipStation", remaining = 2, mainActionChosen = true),
            command("flipStation", game.readPublicState().version).put("cardId", stationId),
            "user-1"
        )
        val secondFlip = handler.applyCommand(
            firstFlip,
            command("flipStation", firstFlip.readPublicState().version).put("cardId", stationId),
            "user-1"
        )

        assertEquals(true, secondFlip.readPublicState().players[0].board[0].card.flipped)
        assertEquals(1, secondFlip.readPublicState().actionState.interaction?.remaining)
        assertEquals(listOf(stationId), secondFlip.readPublicState().actionState.interaction?.flippedStationIds)
    }

    @Test
    fun flippingStationRejectsNonCurrentPlayer() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(actionGame(game, "flipStation", mainActionChosen = true), command("flipStation", 3), "user-2")
        }

        assertEquals("That action is waiting for another player.", exception.message)
    }

    @Test
    fun flippingStationRejectsUnseatedUser() {
        val game = handler.createGame("LUNAR01", createRequest(), "creator")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(actionGame(game, "flipStation", mainActionChosen = true), command("flipStation", 1), "stranger")
        }

        assertEquals("You are not seated in this game.", exception.message)
    }

    @Test
    fun rejectsActionFromNonCurrentPlayer() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(actionGame(game, "draw", mainActionChosen = true), command("drawStock", 3), "user-2")
        }

        assertEquals("That action is waiting for another player.", exception.message)
    }

    @Test
    fun drawingStockAddsCardToCurrentPlayersPrivateHand() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")

        game = actionGame(game, "draw", mainActionChosen = true)
        val drawn = handler.applyCommand(game, command("drawStock", 2), "user-1")
        val publicState = drawn.readClientPublicState()
        val privateState = drawn.readPrivateState()

        assertEquals(4, publicState.players[0].handCount)
        assertEquals(64, publicState.stockCount)
        assertEquals(4, privateState.hands[0].size)
        assertNotNull(handler.gameView(drawn, "user-1").get("viewer").get("hand").firstOrNull())
    }

    @Test
    fun draftingSupplyRepeatsUntilTheRequestedCardsAreTaken() {
        val game = handler.createGame("LUNAR01", createRequest(), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val readyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    supply = listOf(
                        LunarBaseCard(id = "draft-1", type = "module", name = "Asteroid Grinder"),
                        LunarBaseCard(id = "draft-2", type = "module", name = "Rover")
                    ),
                    stockCount = 0
                )
            ),
            privateState = objectMapper.valueToTree(privateState.copy(stock = emptyList()))
        )

        val firstDraft = handler.applyCommand(
            actionGame(readyGame, "draft", remaining = 2, mainActionChosen = true),
            command("draftSupply", publicState.version).put("slotIndex", 0),
            "user-1"
        )
        val secondDraft = handler.applyCommand(
            firstDraft,
            command("draftSupply", firstDraft.readPublicState().version).put("slotIndex", 1),
            "user-1"
        )

        assertEquals(1, firstDraft.readPublicState().actionState.interaction?.remaining)
        assertEquals(4, firstDraft.readClientPublicState().players[0].handCount)
        assertEquals(1, secondDraft.readPublicState().currentPlayerIndex)
        assertEquals(null, secondDraft.readPublicState().actionState.interaction)
        assertEquals(listOf("draft-1", "draft-2"), secondDraft.readPrivateState().hands[0].takeLast(2).map { it.id })
    }

    @Test
    fun discardingHandCardsRepeatsUntilTheRequestedCardsAreDiscarded() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "discard-1", type = "agent", name = "Guest Scientist"))
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "discard-2", type = "agent", name = "Guest Scientist"))

        val firstDiscard = handler.applyCommand(
            actionGame(game, "discard", remaining = 2, mainActionChosen = true),
            command("discardHandCard", game.readPublicState().version).put("cardId", "discard-1"),
            "user-1"
        )
        val secondDiscard = handler.applyCommand(
            firstDiscard,
            command("discardHandCard", firstDiscard.readPublicState().version).put("cardId", "discard-2"),
            "user-1"
        )

        assertEquals(1, firstDiscard.readPublicState().actionState.interaction?.remaining)
        assertEquals(4, firstDiscard.readClientPublicState().players[0].handCount)
        assertEquals(1, secondDiscard.readPublicState().currentPlayerIndex)
        assertEquals(listOf("discard-2", "discard-1"), secondDiscard.readPrivateState().discard.take(2).map { it.id })
    }

    @Test
    fun playingModulePreservesExactRotation() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-rotation"))
        game = actionGame(game, "build")
        val module = game.readPrivateState().hands[0].single { it.id == "module-rotation" }

        val played = handler.applyCommand(
            game,
            command("buildModule", game.readPublicState().version)
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
    fun playingModuleAllowsMatchingConnectors() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-match"))
        game = actionGame(game, "build")

        val played = handler.applyCommand(
            game,
            command("buildModule", game.readPublicState().version)
                .put("cardId", "module-match")
                .put("x", 1)
                .put("y", 0)
                .put("rotation", 0),
            "user-1"
        )

        assertEquals("module-match", played.readPublicState().players[0].board.last().card.id)
    }

    @Test
    fun playingModuleUpdatesCompletedOrbCounts() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            LunarBaseCard(id = "module-orbs", type = "module", name = "Asteroid Grinder")
        )
        game = actionGame(game, "build")

        val played = handler.applyCommand(
            game,
            command("buildModule", game.readPublicState().version)
                .put("cardId", "module-orbs")
                .put("x", 1)
                .put("y", 0)
                .put("rotation", 0),
            "user-1"
        )

        assertEquals(LunarBaseResources(yellow = 2), played.readClientPublicState().players[0].orbs)
    }

    @Test
    fun playingModulePaysCreditCostAfterOrbDiscounts() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            matchingModule("module-cost").copy(cardCost = listOf("red", "blue", "yellow"))
        )
        game = replaceCurrentPlayer(game) { player ->
            player.copy(credits = 1, board = flippedCurrentStationBoard(game.readPublicState()))
        }
        game = actionGame(game, "build")

        val played = handler.applyCommand(
            game,
                command("buildModule", game.readPublicState().version)
                    .put("cardId", "module-cost")
                    .put("x", 1)
                    .put("y", 0)
                .put("rotation", 0),
            "user-1"
        )

        assertEquals(0, played.readPublicState().players[0].credits)
    }

    @Test
    fun playingModuleRejectsInsufficientCreditsAfterOrbDiscounts() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            matchingModule("module-too-expensive").copy(cardCost = listOf("red", "red", "blue", "yellow", "yellow"))
        )
        game = replaceCurrentPlayer(game) { player ->
            player.copy(credits = 2, board = flippedCurrentStationBoard(game.readPublicState()))
        }
        game = actionGame(game, "build")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(
                game,
                command("buildModule", game.readPublicState().version)
                    .put("cardId", "module-too-expensive")
                    .put("x", 1)
                    .put("y", 0)
                    .put("rotation", 0),
                "user-1"
            )
        }

        assertEquals("You do not have enough credits to play that card.", exception.message)
    }

    @Test
    fun playingAgentPaysCostAndMovesToDiscard() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            LunarBaseCard(id = "agent-cost", type = "agent", name = "Guest Scientist", cardCost = listOf("blue", "yellow"))
        )
        game = replaceCurrentPlayer(game) { player ->
            player.copy(credits = 0, board = boardWithCompletedYellowAndGrayOrbs(game.readPublicState()))
        }

        val played = handler.applyCommand(
            game,
            command("playAgent", game.readPublicState().version).put("cardId", "agent-cost"),
            "user-1"
        )
        val publicState = played.readPublicState()
        val privateState = played.readPrivateState()

        assertEquals(0, publicState.players[0].credits)
        assertEquals("Played an agent.", publicState.message)
        assertEquals("agent-cost", privateState.discard.first().id)
        assertEquals(false, privateState.hands[0].any { it.id == "agent-cost" })
    }

    @Test
    fun playerCanPlayMultipleAgentsBeforeChoosingMainAction() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "agent-1", type = "agent", name = "Guest Scientist"))
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "agent-2", type = "agent", name = "Guest Scientist"))

        val firstPlayed = handler.applyCommand(
            game,
            command("playAgent", game.readPublicState().version).put("cardId", "agent-1"),
            "user-1"
        )
        val secondPlayed = handler.applyCommand(
            firstPlayed,
            command("playAgent", firstPlayed.readPublicState().version).put("cardId", "agent-2"),
            "user-1"
        )

        assertEquals(choosingMainActionPhase, secondPlayed.readPublicState().actionState.phase)
        assertEquals(false, secondPlayed.readPublicState().actionState.mainActionChosen)
        assertEquals(listOf("agent-2", "agent-1"), secondPlayed.readPrivateState().discard.take(2).map { it.id })
    }

    @Test
    fun playingAgentRejectsNonAgentCards() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("not-agent"))

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(
                game,
                command("playAgent", game.readPublicState().version).put("cardId", "not-agent"),
                "user-1"
            )
        }

        assertEquals("Only agent cards can be played from hand.", exception.message)
    }

    @Test
    fun scopedAgentActionsDoNothingAtRuntime() {
        var game = seatedGameWithPlayers { _, player -> player }
        game = putCardInCurrentPlayersHand(
            game,
            LunarBaseCard(id = "crazy-president-test", type = "agent", name = "Crazy President")
        )

        val played = handler.applyCommand(
            game,
            command("playAgent", game.readPublicState().version).put("cardId", "crazy-president-test"),
            "user-1"
        )
        val publicState = played.readPublicState()

        assertEquals(choosingMainActionPhase, publicState.actionState.phase)
        assertEquals(null, publicState.actionState.interaction)
        assertEquals(false, publicState.players[0].board[0].card.flipped)
        assertEquals(false, publicState.players[1].board[0].card.flipped)
    }

    @Test
    fun chooseOpponentAndViewHandActionsDoNothingAtRuntime() {
        var game = seatedGameWithPlayers { _, player -> player }
        game = putCardInCurrentPlayersHand(
            game,
            LunarBaseCard(id = "spybot-test", type = "agent", name = "Spybot.py")
        )

        val played = handler.applyCommand(
            game,
            command("playAgent", game.readPublicState().version).put("cardId", "spybot-test"),
            "user-1"
        )
        val interaction = played.readPublicState().actionState.interaction

        assertEquals("chooseOne", interaction?.kind)
        assertEquals(listOf("Draw 1 card", "Chosen player: Discard 1 card"), interaction?.buttons?.map { it.label })
    }

    @Test
    fun scopedChoiceOptionsDoNothingAtRuntime() {
        var game = seatedGameWithPlayers { _, player -> player }
        game = putCardInCurrentPlayersHand(
            game,
            LunarBaseCard(id = "spybot-test", type = "agent", name = "Spybot.py")
        )
        game = handler.applyCommand(
            game,
            command("playAgent", game.readPublicState().version).put("cardId", "spybot-test"),
            "user-1"
        )
        val handSizesBeforeChoice = game.readPrivateState().hands.map { it.size }
        val discardSizeBeforeChoice = game.readPrivateState().discard.size

        val resolved = handler.applyCommand(
            game,
            command("chooseActionOption", game.readPublicState().version).put("optionIndex", 1),
            "user-1"
        )
        val publicState = resolved.readPublicState()

        assertEquals(choosingMainActionPhase, publicState.actionState.phase)
        assertEquals(null, publicState.actionState.interaction)
        assertEquals(handSizesBeforeChoice, resolved.readPrivateState().hands.map { it.size })
        assertEquals(discardSizeBeforeChoice, resolved.readPrivateState().discard.size)
    }

    @Test
    fun publicStateRecomputesBoardSummariesFromBoard() {
        val game = handler.createGame("LUNAR01", createRequest(), "creator")
        val publicState = game.readClientPublicState()
        val station = publicState.players[0].board[0].card.copy(
            flipped = true,
            stationBackName = "The Oasis",
            colonists = 2,
            achievements = listOf(1)
        )
        val matchingDome = matchingModule("module-gray-pair").copy(
            connectors = LunarBaseCardConnectors(topLeft = "gray", topRight = "gray", bottomLeft = "gray", bottomRight = "yellow"),
            colonists = 1,
            achievements = listOf(12, 5)
        )
        val nextPublicState = publicState.copy(
            players = publicState.players.replaceAt(
                0,
                publicState.players[0].copy(
                    orbs = LunarBaseResources(red = 99, blue = 99, yellow = 99, gray = 99),
                    colonists = 99,
                    achievements = 99,
                    board = listOf(
                        LunarBaseBoardCard(station, 0, 0, 0),
                        LunarBaseBoardCard(matchingDome, 1, 0, 0)
                    )
                )
            )
        )
        val staleCountGame = game.copy(publicState = objectMapper.valueToTree(nextPublicState))

        val player = staleCountGame.readClientPublicState().players[0]
        assertEquals(LunarBaseResources(red = 1, blue = 1, yellow = 1, gray = 1), player.orbs)
        assertEquals(2, player.colonists)
        assertEquals(2, player.achievements)
    }

    @Test
    fun playingModuleRejectsMismatchedConnectors() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            matchingModule("module-mismatch").copy(connectors = LunarBaseCardConnectors(topLeft = "red", bottomLeft = "red", top = "red"))
        )
        game = actionGame(game, "build")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(
                game,
                command("buildModule", game.readPublicState().version)
                    .put("cardId", "module-mismatch")
                    .put("x", 1)
                    .put("y", 0)
                    .put("rotation", 0),
                "user-1"
            )
        }

        assertEquals("A played card's connectors must match adjacent cards.", exception.message)
    }

    @Test
    fun playingModuleRejectsPlacementWithoutAnyMatchingConnectorPair() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            matchingModule("module-no-pair").copy(connectors = LunarBaseCardConnectors(top = "red"))
        )
        game = actionGame(game, "build")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(
                game,
                command("buildModule", game.readPublicState().version)
                    .put("cardId", "module-no-pair")
                    .put("x", 1)
                    .put("y", 0)
                    .put("rotation", 0),
                "user-1"
            )
        }

        assertEquals("A played card's connectors must match adjacent cards.", exception.message)
    }

    @Test
    fun refillingSupplyDealsFullSupplySizeWithoutCountingKeptInfluences() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2, useInfluences = true), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val keptInfluences = listOf(
            LunarBaseCard(id = "influence-kept-1", type = "influence", name = "Lunar Alliance"),
            LunarBaseCard(id = "influence-kept-2", type = "influence", name = "Runaway Bureaucracy")
        )
        val stock = listOf(
            "Struve Dome",
            "Helium Factory",
            "Fusion Reactor",
            "Inflatable Habitat",
            "Indigo Egregore",
            "Artificial Intellect",
            "Laika Memorial",
            "Lunar Capital"
        ).mapIndexed { index, name -> LunarBaseCard(id = "module-refill-${index + 1}", type = "module", name = name) }
        val refillReadyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    players = publicState.players.replaceAt(
                        0,
                        publicState.players[0].copy(
                            credits = 3,
                            board = boardWithCompletedYellowAndGrayOrbs(publicState)
                        )
                    ),
                    supply = keptInfluences,
                    stockCount = stock.size
                )
            ),
            privateState = objectMapper.valueToTree(privateState.copy(stock = stock))
        )

        val passed = handler.applyCommand(
            actionGame(refillReadyGame, "build", mainActionChosen = true),
            command("finishInteraction", publicState.version),
            "user-1"
        )
        val nextPublic = passed.readPublicState()
        val nextPrivate = passed.readPrivateState()

        assertEquals(7, nextPublic.supply.size)
        assertEquals(5, nextPublic.players[0].credits)
        assertEquals(keptInfluences.map { it.id }, nextPublic.supply.take(2).map { it?.id })
        assertEquals(stock.take(5).map { it.id }, nextPublic.supply.drop(2).map { it?.id })
        assertEquals(stock.drop(5).map { it.id }, nextPrivate.stock.map { it.id })
    }

    @Test
    fun resellingSupplyMovesTheCardToDiscardAndRefillsSupplyWhenTurnCompletes() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val supplyCard = LunarBaseCard(id = "supply-discard", type = "module", name = "Asteroid Grinder")
        val discardReadyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    players = publicState.players.replaceAt(0, publicState.players[0].copy(credits = 3)),
                    supply = listOf(supplyCard)
                )
            ),
            privateState = objectMapper.valueToTree(privateState)
        )

        val discarded = handler.applyCommand(
            actionGame(discardReadyGame, "resell", mainActionChosen = true),
            command("resellSupply", publicState.version).put("slotIndex", 0),
            "user-1"
        )
        val nextPublic = discarded.readClientPublicState()
        val nextPrivate = discarded.readPrivateState()

        assertEquals(5, nextPublic.supply.size)
        assertEquals(false, nextPublic.supply.filterNotNull().any { it.id == "supply-discard" })
        assertEquals(4, nextPublic.players[0].credits)
        assertEquals("supply-discard", nextPrivate.discard.first().id)
        assertEquals("Turn complete.", nextPublic.message)
    }

    @Test
    fun resellingSupplyRepeatsAndInvalidSlotsDoNotGainCredits() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val stock = listOf(
            "Fusion Reactor",
            "Inflatable Habitat",
            "Indigo Egregore",
            "Artificial Intellect",
            "Laika Memorial"
        ).mapIndexed { index, name -> LunarBaseCard(id = "resell-stock-${index + 1}", type = "module", name = name) }
        val readyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    supply = listOf(
                        LunarBaseCard(id = "resell-1", type = "module", name = "Asteroid Grinder"),
                        LunarBaseCard(id = "resell-2", type = "module", name = "Rover")
                    ),
                    stockCount = stock.size
                )
            ),
            privateState = objectMapper.valueToTree(privateState.copy(stock = stock))
        )

        val firstResell = handler.applyCommand(
            actionGame(readyGame, "resell", remaining = 2, mainActionChosen = true),
            command("resellSupply", publicState.version).put("slotIndex", 0),
            "user-1"
        )
        val invalidResell = handler.applyCommand(
            firstResell,
            command("resellSupply", firstResell.readPublicState().version).put("slotIndex", 0),
            "user-1"
        )
        val secondResell = handler.applyCommand(
            invalidResell,
            command("resellSupply", invalidResell.readPublicState().version).put("slotIndex", 1),
            "user-1"
        )

        assertEquals(4, firstResell.readPublicState().players[0].credits)
        assertEquals(1, firstResell.readPublicState().actionState.interaction?.remaining)
        assertEquals(4, invalidResell.readPublicState().players[0].credits)
        assertEquals(1, invalidResell.readPublicState().actionState.interaction?.remaining)
        assertEquals(5, secondResell.readPublicState().players[0].credits)
        assertEquals(2, secondResell.readClientPublicState().discardCount)
        assertEquals("Rover", secondResell.readClientPublicState().discardTop?.name)
    }

    @Test
    fun choosingPlayerStealsCreditsAndCapsAtOpponentCredits() {
        val game = seatedGameWithPlayers { index, player ->
            when (index) {
                0 -> player.copy(credits = 2)
                1 -> player.copy(credits = 1)
                else -> player
            }
        }

        val stolen = handler.applyCommand(
            actionGame(game, "stealCredits", remaining = 3, mainActionChosen = true),
            command("choosePlayer", game.readPublicState().version).put("playerIndex", 1),
            "user-1"
        )

        assertEquals(3, stolen.readPublicState().players[0].credits)
        assertEquals(0, stolen.readPublicState().players[1].credits)
        assertEquals(1, stolen.readPublicState().currentPlayerIndex)
    }

    @Test
    fun choosingPlayerIgnoresSelfSelectionForStealCredits() {
        val game = seatedGameWithPlayers { index, player ->
            when (index) {
                0 -> player.copy(credits = 2)
                1 -> player.copy(credits = 5)
                else -> player
            }
        }

        val unchanged = handler.applyCommand(
            actionGame(game, "stealCredits", remaining = 3, mainActionChosen = true),
            command("choosePlayer", game.readPublicState().version).put("playerIndex", 0),
            "user-1"
        )

        assertEquals(2, unchanged.readPublicState().players[0].credits)
        assertEquals(5, unchanged.readPublicState().players[1].credits)
        assertEquals("stealCredits", unchanged.readPublicState().actionState.interaction?.kind)
    }

    @Test
    fun finishingBuildInteractionSkipsRemainingBuildsAndAdvancesTurn() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("skip-build"))

        val skipped = handler.applyCommand(
            actionGame(game, "build", remaining = 2, mainActionChosen = true),
            command("finishInteraction", game.readPublicState().version),
            "user-1"
        )

        assertEquals(1, skipped.readPublicState().currentPlayerIndex)
        assertEquals(false, skipped.readPublicState().players[0].board.any { it.card.id == "skip-build" })
        assertEquals(true, skipped.readPrivateState().hands[0].any { it.id == "skip-build" })
    }

    @Test
    fun buildActionWithNoPlayableModulesWaitsForSkip() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(
            game,
            matchingModule("module-too-expensive").copy(cardCost = listOf("red", "red", "blue", "yellow", "yellow"))
        )
        game = replaceCurrentPlayer(game) { player -> player.copy(credits = 0) }
        val action = LunarBaseActionNode(kind = "build", amount = 1, amountKind = "literal")
        val publicState = game.readPublicState().copy(
            actionState = LunarBaseActionState(
                phase = resolvingActionPhase,
                mainActionChosen = true,
                stack = listOf(LunarBaseActionFrame(0, action))
            )
        )

        val (nextPublicState, _) = LunarBaseActionEngine("LUNAR01", publicState.version)
            .resolve(LunarBaseMutableGame(publicState, game.readPrivateState()))

        assertEquals(0, nextPublicState.currentPlayerIndex)
        assertEquals("build", nextPublicState.actionState.interaction?.kind)
        assertEquals(1, nextPublicState.actionState.interaction?.remaining)
        assertEquals(listOf(LunarBaseActionButton("Skip Build", "skip")), nextPublicState.actionState.interaction?.buttons)
    }

    @Test
    fun finishingAnyNumberFlipInteractionEndsWithoutFlippingMoreStations() {
        val action = LunarBaseActionNode(kind = "flipStation", flipAmountKind = "anyNumber")
        val game = seatedGameWithPlayers { _, player -> player }

        val done = handler.applyCommand(
            actionGame(
                game,
                "flipStation",
                remaining = 2,
                mainActionChosen = true,
                action = action,
                buttons = listOf(LunarBaseActionButton("Done flipping stations", "done"))
            ),
            command("finishInteraction", game.readPublicState().version),
            "user-1"
        )

        assertEquals(1, done.readPublicState().currentPlayerIndex)
        assertEquals(false, done.readPublicState().players[0].board[0].card.flipped)
        assertEquals(false, done.readPublicState().players[1].board[0].card.flipped)
    }

    @Test
    fun finishingAlreadyFlippedStationToInteractionEndsWithoutChangingTheBoard() {
        val action = LunarBaseActionNode(kind = "flipStationTo", side = "TERRAN_OUTPOST")
        val game = seatedGameWithPlayers { _, player -> player }

        val done = handler.applyCommand(
            actionGame(
                game,
                "flipStationTo",
                mainActionChosen = true,
                action = action,
                buttons = listOf(LunarBaseActionButton("Station is already flipped", "done"))
            ),
            command("finishInteraction", game.readPublicState().version),
            "user-1"
        )

        assertEquals(1, done.readPublicState().currentPlayerIndex)
        assertEquals(false, done.readPublicState().players[0].board[0].card.flipped)
    }

    @Test
    fun endsWithVictoryWhenAPlayerReachesTwentyCredits() {
        val game = seatedGameWithPlayers { index, player ->
            if (index == 0) player.copy(credits = 20) else player
        }

        val ended = handler.applyCommand(actionGame(game, "draw", mainActionChosen = true), command("drawStock", game.readPublicState().version), "user-1")
        val clientState = ended.readClientPublicState()

        assertEquals("finished", clientState.lifecycle)
        assertEquals("Victory", clientState.endGameResult?.label)
        assertEquals(listOf(0), clientState.endGameResult?.winningPlayerIndexes)
        assertEquals(listOf("20/20 lunar credits"), clientState.endGameResult?.playerConditions?.single()?.conditions)
        assertEquals(false, ended.publicState.has("endGameResult"))
    }

    @Test
    fun endsWithEpicVictoryWhenOnePlayerMeetsMultipleConditions() {
        val game = seatedGameWithPlayers { index, player ->
            if (index == 0) {
                player.copy(
                    credits = 20,
                    board = boardWithColonistsAndAchievements(gameId = "epic")
                )
            } else {
                player
            }
        }

        val ended = handler.applyCommand(actionGame(game, "draw", mainActionChosen = true), command("drawStock", game.readPublicState().version), "user-1")
        val result = ended.readClientPublicState().endGameResult

        assertEquals("finished", ended.readClientPublicState().lifecycle)
        assertEquals("Epic Victory", result?.label)
        assertEquals(listOf(0), result?.winningPlayerIndexes)
        assertEquals(
            listOf("20/20 lunar credits", "10/10 colonists housed", "5/5 scientific achievements"),
            result?.playerConditions?.single()?.conditions
        )
    }

    @Test
    fun endsWithDrawWhenMultiplePlayersMeetWinConditions() {
        val game = seatedGameWithPlayers { index, player ->
            when (index) {
                0 -> player.copy(credits = 20)
                1 -> player.copy(credits = 20)
                else -> player
            }
        }

        val ended = handler.applyCommand(actionGame(game, "draw", mainActionChosen = true), command("drawStock", game.readPublicState().version), "user-1")
        val result = ended.readClientPublicState().endGameResult

        assertEquals("Draw", result?.label)
        assertEquals(listOf(0, 1), result?.winningPlayerIndexes)
    }

    @Test
    fun endsWhenAPlayerHasFourInfluencesInHandAndRevealsAllHandsInGameView() {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2, useInfluences = true), "creator")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val influences = List(4) { index ->
            LunarBaseCard(id = "influence-${index + 1}", type = "influence", name = "Lunar Alliance")
        }
        val readyGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    players = publicState.players.replaceAt(0, publicState.players[0].copy(influenceHandCount = 3))
                )
            ),
            privateState = objectMapper.valueToTree(
                privateState.copy(hands = privateState.hands.replaceAt(0, influences))
            )
        )

        val ended = handler.applyCommand(actionGame(readyGame, "build", mainActionChosen = true), command("finishInteraction", publicState.version), "user-1")
        val result = ended.readClientPublicState().endGameResult
        val strangerView = handler.gameView(ended, "user-2")

        assertEquals("Victory", result?.label)
        assertEquals(listOf("4/4 influences in hand"), result?.playerConditions?.single()?.conditions)
        assertEquals(4, strangerView.get("viewer").get("revealedHands").get(0).size())
    }

    @Test
    fun rejectsCardActionsAfterWinConditionsEndTheGame() {
        val game = seatedGameWithPlayers { index, player ->
            if (index == 0) player.copy(credits = 20) else player
        }
        val ended = handler.applyCommand(actionGame(game, "draw", mainActionChosen = true), command("drawStock", game.readPublicState().version), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(ended, command("drawStock", ended.readPublicState().version), "user-2")
        }

        assertEquals("This Lunar Base game is already over.", exception.message)
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

    private fun actionGame(
        game: GameRecord,
        kind: String,
        actorIndex: Int = 0,
        remaining: Int = 1,
        mainActionChosen: Boolean = false,
        action: LunarBaseActionNode = actionNode(kind, remaining),
        buttons: List<LunarBaseActionButton> = actionButtons(kind)
    ): GameRecord {
        val publicState = game.readPublicState()
        val interaction = LunarBaseActionInteraction(
            kind = kind,
            actorIndex = actorIndex,
            text = action.toFullActionText(remaining),
            buttons = buttons,
            remaining = remaining,
            action = action
        )
        return game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    actionState = LunarBaseActionState(
                        phase = resolvingActionPhase,
                        mainActionChosen = mainActionChosen,
                        interaction = interaction,
                        statusText = interaction.text
                    )
                )
            )
        )
    }

    private fun actionNode(kind: String, remaining: Int): LunarBaseActionNode =
        when (kind) {
            "flipStation" -> LunarBaseActionNode(kind = kind, flipAmount = remaining, flipAmountKind = "literal")
            else -> LunarBaseActionNode(kind = kind, amount = remaining, amountKind = "literal")
        }

    private fun actionButtons(kind: String): List<LunarBaseActionButton> =
        when (kind) {
            "build" -> listOf(LunarBaseActionButton("Skip Build", "skip"))
            else -> emptyList()
        }

    private fun putCardInCurrentPlayersHand(game: GameRecord, module: LunarBaseCard): GameRecord {
        val privateState = game.readPrivateState()
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

    private fun replaceCurrentPlayer(game: GameRecord, transform: (LunarBasePlayerPublic) -> LunarBasePlayerPublic): GameRecord {
        val publicState = game.readPublicState()
        val nextPublic = publicState.copy(players = publicState.players.replaceAt(0, transform(publicState.players[0])))
        return game.copy(publicState = objectMapper.valueToTree(nextPublic))
    }

    private fun seatedGameWithPlayers(transform: (Int, LunarBasePlayerPublic) -> LunarBasePlayerPublic): GameRecord {
        val game = handler.createGame("LUNAR01", createRequest(playerCount = 2, useInfluences = true), "creator")
        val publicState = game.readPublicState()
        return game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    seats = listOf(
                        LunarBaseSeat(userId = "user-1", displayName = "Ada"),
                        LunarBaseSeat(userId = "user-2", displayName = "Ben")
                    ),
                    players = publicState.players.mapIndexed(transform)
                )
            )
        )
    }

    private fun boardWithColonistsAndAchievements(gameId: String): List<LunarBaseBoardCard> =
        listOf(
            LunarBaseBoardCard(
                LunarBaseCard(
                    id = "$gameId-station",
                    type = "station",
                    name = "Terran Outpost",
                    stationBackName = "The Oasis"
                ),
                0,
                0,
                0
            )
        ) + listOf(
            "Indigo Egregore",
            "Lunar Capital",
            "Space Elevator",
            "Bacon Printer",
            "Fusion Reactor",
            "Rover",
            "Satellite"
        ).mapIndexed { index, name ->
            LunarBaseBoardCard(
                LunarBaseCard(id = "$gameId-module-${index + 1}", type = "module", name = name),
                index + 1,
                0,
                0
            )
        }

    private fun boardWithCompletedYellowAndGrayOrbs(publicState: LunarBasePublicState): List<LunarBaseBoardCard> {
        val station = publicState.players[0].board[0].card.copy(
            flipped = true,
            stationBackName = "The Oasis",
            colonists = 2,
            achievements = listOf(1)
        )
        val matchingDome = matchingModule("module-gray-pair").copy(
            connectors = LunarBaseCardConnectors(topLeft = "gray", bottomLeft = "gray"),
            colonists = 1,
            achievements = listOf(12, 5)
        )
        return listOf(
            LunarBaseBoardCard(station, 0, 0, 0),
            LunarBaseBoardCard(matchingDome, 1, 0, 0)
        )
    }

    private fun flippedCurrentStationBoard(publicState: LunarBasePublicState): List<LunarBaseBoardCard> {
        val station = publicState.players[0].board[0].card.copy(
            flipped = true,
            stationBackName = "The Oasis"
        )
        return listOf(LunarBaseBoardCard(station, 0, 0, 0))
    }

    private fun matchingModule(id: String): LunarBaseCard =
        LunarBaseCard(
            id = id,
            type = "module",
            name = "Matching Module",
            color = "red",
            connectors = LunarBaseCardConnectors(top = "red", topLeft = "red", bottomLeft = "yellow")
        )

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

    private fun GameRecord.readClientPublicState(): LunarBasePublicState =
        objectMapper.treeToValue(handler.publicState(this), LunarBasePublicState::class.java)

    private fun GameRecord.readPrivateState(): LunarBasePrivateState =
        objectMapper.treeToValue(privateState, LunarBasePrivateState::class.java)

    private fun <T> List<T>.replaceAt(index: Int, value: T): List<T> =
        mapIndexed { currentIndex, current -> if (currentIndex == index) value else current }
}
