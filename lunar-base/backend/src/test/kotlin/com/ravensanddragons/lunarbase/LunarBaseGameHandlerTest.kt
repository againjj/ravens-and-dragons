package com.ravensanddragons.lunarbase

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.ravensanddragons.lunarbase.cards.LunarBaseActionScope
import com.ravensanddragons.lunarbase.cards.LunarBaseBuildAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDoAllAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDraftAction
import com.ravensanddragons.lunarbase.cards.LunarBaseDrawAction
import com.ravensanddragons.lunarbase.cards.LunarBaseGainCreditsAction
import com.ravensanddragons.lunarbase.cards.LunarBaseLiteralAmount
import com.ravensanddragons.lunarbase.cards.LunarBaseLoseCreditsAction
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
            "Choose an opponent\nView chosen player's hand\nChoose one:\nDraw 1 card\nChosen player: Discard 1 card",
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
    fun completingMainActionMovesToNextPlayer() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        game = handler.applyCommand(game, chooseStationMainAction(game), "user-1")
        game = handler.applyCommand(game, command("chooseActionOption", game.readPublicState().version).put("optionIndex", 0), "user-1")
        val passed = handler.applyCommand(game, command("draftSupply", game.readPublicState().version).put("slotIndex", 0), "user-1")

        assertEquals(1, passed.readPublicState().currentPlayerIndex)
    }

    @Test
    fun actionStatusKeepsTheFullStartedActionTextWhenChooseOneWaitsForInput() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")

        val waiting = handler.applyCommand(game, chooseStationMainAction(game), "user-1")
        val publicView = handler.publicState(waiting)

        assertEquals("Choose one:\nDraft 1 card\nBuild 2 modules; Draw 1 card", publicView.at("/actionState/statusText").asText())
        assertEquals("", publicView.at("/actionState/interaction/text").asText())
        assertEquals(true, waiting.publicState.at("/actionState/statusText").isMissingNode)
        assertEquals(true, waiting.publicState.at("/actionState/interaction/text").isMissingNode)
        assertEquals(true, waiting.publicState.at("/actionState/interaction/buttons").isMissingNode)
        assertEquals(1, waiting.readPublicState().actionState.activeActions.size)
    }

    @Test
    fun buildInteractionHasNoPromptTextWhenOnlySkipButtonWasSpecified() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-build-prompt"))
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()

        val building = LunarBaseActionEngine("LUNAR01", publicState.version).startActions(
            publicState = publicState,
            privateState = privateState,
            actorIndex = 0,
            actions = listOf(LunarBaseBuildAction(LunarBaseLiteralAmount(1))),
            mainActionChosen = true
        ).first

        val persisted = objectMapper.valueToTree<ObjectNode>(building)
        val client = handler.publicState(game.copy(publicState = objectMapper.valueToTree(building)))

        assertEquals("Build 1 module (1 left)", building.actionStatusText())
        assertEquals(true, persisted.at("/actionState/interaction/text").isMissingNode)
        assertEquals(true, persisted.at("/actionState/interaction/buttons").isMissingNode)
        assertEquals("", client.at("/actionState/interaction/text").asText())
        assertEquals("Skip Build", client.at("/actionState/interaction/buttons/0/label").asText())
    }

    @Test
    fun topLevelActionListShowsOnlyTheActionCurrentlyInFlight() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-sequenced-list"))
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val engine = LunarBaseActionEngine("LUNAR01", publicState.version)

        val building = engine.startActions(
            publicState = publicState,
            privateState = privateState,
            actorIndex = 0,
            actions = listOf(
                LunarBaseBuildAction(LunarBaseLiteralAmount(1)),
                LunarBaseDraftAction(LunarBaseLiteralAmount(1))
            ),
            mainActionChosen = true
        )

        assertEquals("Build 1 module (1 left)", building.first.actionStatusText())
        assertEquals(1, building.first.actionState.activeActions.size)

        val drafting = engine.finishInteraction(LunarBaseMutableGame(building.first, building.second))

        assertEquals("Draft 1 card (1 left)", drafting.first.actionStatusText())
        assertEquals("draft", drafting.first.actionState.interaction?.kind)
    }

    @Test
    fun explicitDoAllShowsEachNestedActionOnlyWhenItIsInFlight() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-sequenced-do-all"))
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        val engine = LunarBaseActionEngine("LUNAR01", publicState.version)

        val building = engine.startActions(
            publicState = publicState,
            privateState = privateState,
            actorIndex = 0,
            actions = listOf(
                LunarBaseDoAllAction(
                    listOf(
                        LunarBaseBuildAction(LunarBaseLiteralAmount(1)),
                        LunarBaseDraftAction(LunarBaseLiteralAmount(1))
                    )
                )
            ),
            mainActionChosen = true
        )

        assertEquals("Build 1 module (1 left)", building.first.actionStatusText())
        assertEquals(1, building.first.actionState.activeActions.size)

        val drafting = engine.finishInteraction(LunarBaseMutableGame(building.first, building.second))

        assertEquals("Draft 1 card (1 left)", drafting.first.actionStatusText())
        assertEquals("draft", drafting.first.actionState.interaction?.kind)
    }

    @Test
    fun clientPublicStateSuppressesStaleBuildInteractionText() {
        val game = handler.createGame("LUNAR01", createRequest(), "creator")
        val publicState = game.readPublicState()
        val staleGame = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    actionState = LunarBaseActionState(
                        phase = resolvingActionPhase,
                        mainActionChosen = true,
                        activeActions = listOf(LunarBaseActionNode("build", amount = 1, amountKind = "literal")),
                        interaction = LunarBaseActionInteraction(
                            kind = "build",
                            actorIndex = 0,
                            remaining = 1,
                            action = LunarBaseActionNode("build", amount = 1, amountKind = "literal")
                        )
                    )
                )
            )
        )

        val publicView = handler.publicState(staleGame)

        assertEquals("Build 1 module (1 left)", publicView.at("/actionState/statusText").asText())
        assertEquals("", publicView.at("/actionState/interaction/text").asText())
        assertEquals("Skip Build", publicView.at("/actionState/interaction/buttons/0/label").asText())
    }

    @Test
    fun scopedActionStatusUsesActionTextForEveryScope() {
        val nestedAction = listOf(LunarBaseActionNode("resell", amount = 2, amountKind = "literal"))
        val expectedByScope = mapOf(
            LunarBaseActionScope.CHOSEN_PLAYER.name to "Chosen player: Resell 2 cards",
            LunarBaseActionScope.EACH_OPPONENT.name to "Each opponent: Resell 2 cards",
            LunarBaseActionScope.EACH_PLAYER.name to "Each player: Resell 2 cards",
            LunarBaseActionScope.NEIGHBORS_OF_TARGET.name to "Neighbors of target: Resell 2 cards",
            LunarBaseActionScope.OPPONENT.name to "Opponent: Resell 2 cards",
            LunarBaseActionScope.TARGET.name to "Target: Resell 2 cards"
        )

        expectedByScope.forEach { (scope, expected) ->
            val action = LunarBaseActionNode(kind = "scoped", scope = scope, actions = nestedAction)
            assertEquals(expected, action.toFullActionText())
        }
    }

    @Test
    fun triggeredOpponentActionDoesNotResetRepeatedBuildCount() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")
        val privateState = game.readPrivateState()
        val publicState = game.readPublicState()
        val rover = matchingModule("rover").copy(name = "Rover")
        val reactor = matchingModule("fusion-reactor").copy(
            name = "Fusion Reactor",
            connectors = LunarBaseCardConnectors(
                top = "gray",
                topLeft = "gray",
                topRight = "gray",
                bottomLeft = "gray",
                bottomRight = "gray",
                bottom = "gray"
            )
        )
        val extra = matchingModule("extra-module")
        game = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    supply = listOf(LunarBaseCard(id = "supply-resell", type = "module", name = "Resold Supply"))
                )
            ),
            privateState = objectMapper.valueToTree(
                privateState.copy(
                    hands = privateState.hands.replaceAt(0, listOf(rover, reactor, extra)),
                    stock = emptyList()
                )
            )
        )
        val started = LunarBaseActionEngine("LUNAR01", game.readPublicState().version).startActions(
            publicState = game.readPublicState(),
            privateState = game.readPrivateState(),
            actorIndex = 0,
            actions = listOf(
                LunarBaseBuildAction(LunarBaseLiteralAmount(2)),
                LunarBaseDrawAction(LunarBaseLiteralAmount(1))
            ),
            mainActionChosen = true
        )
        game = game.copy(publicState = objectMapper.valueToTree(started.first), privateState = objectMapper.valueToTree(started.second))

        game = handler.applyCommand(game, command("buildModule", game.readPublicState().version).put("cardId", "rover").put("x", 1).put("y", 0).put("rotation", 0), "user-1")
        val chooseOpponentView = handler.publicState(game)
        assertEquals("Opponent: Resell 1 card", chooseOpponentView.at("/actionState/statusText").asText())
        assertEquals("Choose an opponent", chooseOpponentView.at("/actionState/interaction/text").asText())

        game = handler.applyCommand(game, command("choosePlayer", game.readPublicState().version).put("playerIndex", 1), "user-1")
        assertEquals("Resell 1 card (1 left)", handler.publicState(game).at("/actionState/statusText").asText())

        game = handler.applyCommand(game, command("resellSupply", game.readPublicState().version).put("slotIndex", 0), "user-2")
        assertEquals("Build 2 modules (1 left)", handler.publicState(game).at("/actionState/statusText").asText())
        assertEquals(1, game.readPublicState().actionState.interaction?.remaining)
        assertEquals(listOf("fusion-reactor", "extra-module"), game.readPrivateState().hands[0].map { it.id })
    }

    @Test
    fun resumedRepeatedActionFramesUseRemainingCountInsteadOfOriginalAmount() {
        val game = handler.createGame("LUNAR01", createRequest(), "creator")
        val publicState = game.readPublicState().copy(
            lifecycle = activeLifecycle,
            actionState = LunarBaseActionState(phase = resolvingActionPhase, mainActionChosen = true),
            supply = listOf(
                LunarBaseCard(id = "supply-1", type = "module", name = "Supply 1"),
                LunarBaseCard(id = "supply-2", type = "module", name = "Supply 2")
            )
        )
        val privateState = game.readPrivateState().copy(
            hands = game.readPrivateState().hands.replaceAt(
                0,
                listOf(
                    LunarBaseCard(id = "hand-1", type = "module", name = "Hand 1"),
                    LunarBaseCard(id = "hand-2", type = "module", name = "Hand 2"),
                    LunarBaseCard(id = "hand-3", type = "module", name = "Hand 3")
                )
            )
        )
        val repeatedKinds = listOf(
            LunarBaseActionNode("draft", amount = 3, amountKind = "literal") to "Draft 3 cards (1 left)",
            LunarBaseActionNode("resell", amount = 3, amountKind = "literal") to "Resell 3 cards (1 left)",
            LunarBaseActionNode("discard", amount = 3, amountKind = "literal") to "Discard 3 cards (1 left)"
        )

        repeatedKinds.forEach { (action, expectedStatus) ->
            val resolved = LunarBaseActionEngine("LUNAR01", publicState.version).resolve(
                LunarBaseMutableGame(publicState, privateState),
                publicState.actionState.copy(stack = listOf(LunarBaseActionFrame(actorIndex = 0, action = action, remaining = 1)))
            ).first

            assertEquals(1, resolved.actionState.interaction?.remaining)
            assertEquals(expectedStatus, resolved.actionStatusText())
        }
    }

    @Test
    fun flipStationActionTogglesPublicStationSide() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "crazy-president", type = "agent", name = "Crazy President"))

        game = handler.applyCommand(game, command("playAgent", game.readPublicState().version).put("cardId", "crazy-president"), "user-1")
        assertEquals("Flip your station", handler.publicState(game).at("/actionState/statusText").asText())
        game = handler.applyCommand(game, command("completeAutomaticAction", game.readPublicState().version), "user-1")
        assertEquals("Flip your station", handler.publicState(game).at("/actionState/statusText").asText())
        val flipped = handler.applyCommand(game, command("completeAutomaticAction", game.readPublicState().version), "user-2")
        val publicState = flipped.readClientPublicState()

        assertEquals(true, publicState.players[0].board[0].card.flipped)
        assertEquals("The Oasis", publicState.players[0].board[0].card.name)
        assertEquals(listOf("blue", "red"), publicState.players[0].board[0].card.orbs)
        assertEquals(1, publicState.players[0].board[0].card.colonists)
        assertEquals(listOf(12), publicState.players[0].board[0].card.achievements)
        assertEquals(true, publicState.players[1].board[0].card.flipped)
    }

    @Test
    fun actionInteractionRejectsNonActor() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")
        game = handler.applyCommand(game, chooseStationMainAction(game), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(game, command("chooseActionOption", game.readPublicState().version).put("optionIndex", 0), "user-2")
        }

        assertEquals("It is not your action.", exception.message)
    }

    @Test
    fun actionInteractionRejectsUnseatedUser() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, chooseStationMainAction(game), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(game, command("chooseActionOption", game.readPublicState().version).put("optionIndex", 0), "stranger")
        }

        assertEquals("You are not seated in this game.", exception.message)
    }

    @Test
    fun rejectsActionFromNonCurrentPlayer() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")

        val exception = assertThrows<InvalidCommandException> {
            handler.applyCommand(game, chooseStationMainAction(game), "user-2")
        }

        assertEquals("It is not your turn.", exception.message)
    }

    @Test
    fun drawActionAddsCardToActorsPrivateHand() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "space-unicorn", type = "agent", name = "Space Unicorn"))
        game = replaceCurrentPlayer(game) { it.copy(credits = 10) }

        game = handler.applyCommand(game, command("playAgent", game.readPublicState().version).put("cardId", "space-unicorn"), "user-1")
        assertEquals("Draw 1 card (1 left)", handler.publicState(game).at("/actionState/statusText").asText())
        val drawn = handler.applyCommand(game, command("completeAutomaticAction", game.readPublicState().version), "user-1")
        val publicState = drawn.readPublicState()
        val privateState = drawn.readPrivateState()

        assertEquals(4, publicState.players[0].handCount)
        assertEquals(64, publicState.stockCount)
        assertEquals(4, privateState.hands[0].size)
        assertNotNull(handler.gameView(drawn, "user-1").get("viewer").get("hand").firstOrNull())
    }

    @Test
    fun playingModulePreservesExactRotation() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-rotation"))
        val module = game.readPrivateState().hands[0].single { it.id == "module-rotation" }
        game = startTerranBuildAction(game)

        val played = handler.applyCommand(
            game,
            command("buildModule", game.readPublicState().version)
                .put("cardId", module.id)
                .put("x", 1)
                .put("y", 0)
                .put("rotation", 0),
            "user-1"
        )

        val boardCard = played.readPublicState().players[0].board.last()
        assertEquals(0, boardCard.rotation)
    }

    @Test
    fun playingModuleAllowsMatchingConnectors() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = putCardInCurrentPlayersHand(game, matchingModule("module-match"))
        game = startTerranBuildAction(game)

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
        game = startTerranBuildAction(game)

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
        game = startTerranBuildAction(game)

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
        game = startTerranBuildAction(game)

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
    fun resellActionMovesSupplyCardsToDiscardAndCreditsOnlyActualResells() {
        var game = handler.createGame("LUNAR01", createRequest(playerCount = 2, useInfluences = true), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()
        game = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    actionState = LunarBaseActionState(
                        phase = resolvingActionPhase,
                        mainActionChosen = true,
                        interaction = LunarBaseActionInteraction(
                            kind = "resell",
                            actorIndex = 0,
                            remaining = 2
                        )
                    ),
                    supply = listOf(
                        LunarBaseCard(id = "influence-1", type = "influence", name = "Lunar Alliance"),
                        LunarBaseCard(id = "influence-2", type = "influence", name = "Runaway Bureaucracy")
                    )
                )
            ),
            privateState = objectMapper.valueToTree(privateState)
        )

        val resold = handler.applyCommand(game, command("resellSupply", game.readPublicState().version).put("slotIndex", 0), "user-1")

        assertEquals(4, resold.readPublicState().players[0].credits)
        assertEquals("influence-1", resold.readPrivateState().discard.first().id)
    }

    @Test
    fun stealCreditsActionChoosesAnOpponentAndTransfersOnlyAvailableCredits() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")
        val publicState = game.readPublicState()
        val station = publicState.players[0].board[0].card.copy(flipped = true, stationBackName = "Imbrium")
        game = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    players = publicState.players
                        .replaceAt(0, publicState.players[0].copy(credits = 0, board = listOf(LunarBaseBoardCard(station, 0, 0, 0))))
                        .replaceAt(1, publicState.players[1].copy(credits = 2))
                )
            )
        )
        game = handler.applyCommand(game, chooseStationMainAction(game), "user-1")
        game = handler.applyCommand(game, command("chooseActionOption", game.readPublicState().version).put("optionIndex", 1), "user-1")
        assertEquals("Steal 3 credits", handler.publicState(game).at("/actionState/statusText").asText())

        val stolen = handler.applyCommand(game, command("choosePlayer", game.readPublicState().version).put("playerIndex", 1), "user-1")

        assertEquals(2, stolen.readPublicState().players[0].credits)
        assertEquals(0, stolen.readPublicState().players[1].credits)
    }

    @Test
    fun chooseOpponentViewHandThenDiscardChosenPlayerCard() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        game = handler.applyCommand(game, command("claimSeat", 2).put("seatIndex", 1).put("playerUserId", "user-2").put("displayName", "Ben"), "user-1")
        game = putCardInCurrentPlayersHand(game, LunarBaseCard(id = "spybot", type = "agent", name = "Spybot.py"))
        val privateState = game.readPrivateState()
        game = game.copy(
            privateState = objectMapper.valueToTree(
                privateState.copy(hands = privateState.hands.replaceAt(1, listOf(LunarBaseCard(id = "target-card", type = "module", name = "Rover"))))
            )
        )
        game = handler.applyCommand(game, command("playAgent", game.readPublicState().version).put("cardId", "spybot"), "user-1")
        game = handler.applyCommand(game, command("choosePlayer", game.readPublicState().version).put("playerIndex", 1), "user-1")
        assertEquals(1, handler.gameView(game, "user-1").get("viewer").get("viewedHand").size())
        game = handler.applyCommand(game, command("finishInteraction", game.readPublicState().version), "user-1")
        game = handler.applyCommand(game, command("chooseActionOption", game.readPublicState().version).put("optionIndex", 1), "user-1")

        val discarded = handler.applyCommand(game, command("discardHandCard", game.readPublicState().version).put("cardId", "target-card"), "user-2")

        assertEquals(0, discarded.readPrivateState().hands[1].size)
        assertEquals("target-card", discarded.readPrivateState().discard.first().id)
    }

    @Test
    fun winCheckMarksEpicVictoryAndRevealsHands() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val publicState = game.readPublicState()
        game = game.copy(
            publicState = objectMapper.valueToTree(
                publicState.copy(
                    players = publicState.players.replaceAt(0, publicState.players[0].copy(credits = 20, colonists = 10))
                )
            ),
            privateState = objectMapper.valueToTree(
                game.readPrivateState().copy(
                    hands = game.readPrivateState().hands.replaceAt(
                        0,
                        listOf(
                            LunarBaseCard(id = "influence-win-1", type = "influence", name = "Lunar Alliance"),
                            LunarBaseCard(id = "influence-win-2", type = "influence", name = "Runaway Bureaucracy"),
                            LunarBaseCard(id = "influence-win-3", type = "influence", name = "Terran Crackdown"),
                            LunarBaseCard(id = "influence-win-4", type = "influence", name = "Terran Embargo")
                        )
                    )
                )
            )
        )
        val finished = handler.applyCommand(game, chooseStationMainAction(game), "user-1")

        assertEquals(finishedLifecycle, finished.readPublicState().lifecycle)
        assertEquals("Epic Victory", finished.readPublicState().endGameResult?.label)
        assertEquals(
            listOf("20/20 lunar credits", "4/4 influences in hand"),
            finished.readPublicState().endGameResult?.conditions?.single()?.conditions
        )
        assertEquals(2, handler.gameView(finished, "user-1").get("viewer").get("hands").size())
    }

    @Test
    fun winCheckStopsDoAllActionBeforeLaterSubActions() {
        var game = handler.createGame("LUNAR01", createRequest(), "creator")
        game = handler.applyCommand(game, command("claimSeat", 1).put("seatIndex", 0).put("playerUserId", "user-1").put("displayName", "Ada"), "user-1")
        val publicState = game.readPublicState()
        val privateState = game.readPrivateState()

        var resolved = LunarBaseActionEngine("LUNAR01", publicState.version).startActions(
            publicState = publicState,
            privateState = privateState,
            actorIndex = 0,
            actions = listOf(
                LunarBaseGainCreditsAction(LunarBaseLiteralAmount(17)),
                LunarBaseLoseCreditsAction(LunarBaseLiteralAmount(5))
            ),
            mainActionChosen = true
        )
        assertEquals("Gain 17 credits", resolved.first.actionStatusText())
        repeat(17) {
            resolved = LunarBaseActionEngine("LUNAR01", publicState.version)
                .completeAutomaticAction(LunarBaseMutableGame(resolved.first, resolved.second))
        }

        assertEquals(finishedLifecycle, resolved.first.lifecycle)
        assertEquals(20, resolved.first.players[0].credits)
        assertEquals(emptyList(), resolved.first.actionState.stack)
        assertEquals(null, resolved.first.actionState.interaction)
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
        game = startTerranBuildAction(game)

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
        game = startTerranBuildAction(game)

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
            privateState = objectMapper.valueToTree(privateState.copy(hands = privateState.hands.replaceAt(0, emptyList()), stock = stock))
        )

        var passed = handler.applyCommand(refillReadyGame, chooseStationMainAction(refillReadyGame), "user-1")
        passed = handler.applyCommand(passed, command("chooseActionOption", passed.readPublicState().version).put("optionIndex", 1), "user-1")
        assertEquals("Draw 2 cards (2 left)", handler.publicState(passed).at("/actionState/statusText").asText())
        passed = handler.applyCommand(passed, command("completeAutomaticAction", passed.readPublicState().version), "user-1")
        assertEquals("Draw 2 cards (1 left)", handler.publicState(passed).at("/actionState/statusText").asText())
        passed = handler.applyCommand(passed, command("completeAutomaticAction", passed.readPublicState().version), "user-1")
        val nextPublic = passed.readPublicState()
        val nextPrivate = passed.readPrivateState()

        assertEquals(7, nextPublic.supply.size)
        assertEquals(5, nextPublic.players[0].credits)
        assertEquals(keptInfluences.map { it.id }, nextPublic.supply.take(2).map { it?.id })
        assertEquals(stock.drop(2).take(5).map { it.id }, nextPublic.supply.drop(2).map { it?.id })
        assertEquals(stock.drop(7).map { it.id }, nextPrivate.stock.map { it.id })
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

    private fun chooseStationMainAction(game: GameRecord) =
        command("chooseMainAction", game.readPublicState().version)
            .put("cardId", game.readPublicState().players[0].board[0].card.id)

    private fun startTerranBuildAction(game: GameRecord): GameRecord {
        var next = handler.applyCommand(game, chooseStationMainAction(game), "user-1")
        next = handler.applyCommand(next, command("chooseActionOption", next.readPublicState().version).put("optionIndex", 1), "user-1")
        return next
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

    private fun GameRecord.readClientPublicState(): LunarBasePublicState {
        val node = handler.publicState(this).deepCopy<ObjectNode>()
        val actionState = node.get("actionState") as? ObjectNode
        actionState?.remove("statusText")
        (actionState?.get("interaction") as? ObjectNode)?.remove(listOf("text", "buttons"))
        return objectMapper.treeToValue(node, LunarBasePublicState::class.java)
    }

    private fun GameRecord.readPrivateState(): LunarBasePrivateState =
        objectMapper.treeToValue(privateState, LunarBasePrivateState::class.java)

    private fun <T> List<T>.replaceAt(index: Int, value: T): List<T> =
        mapIndexed { currentIndex, current -> if (currentIndex == index) value else current }
}
