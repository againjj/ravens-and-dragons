package com.dragonsvsravens.game

import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
class GameAuthorizationControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `anonymous users cannot submit commands`() {
        val game = createGame()

        anonymousPostGameCommand(game.id, command(game.version, "start-game")).andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `authenticated user can claim an open side`() {
        val game = createGame()
        assignSides(game.id, null, null)

        claimSide(game.id, Side.dragons, defaultTestUserId).andExpect {
            status { isOk() }
            jsonPath("$.dragonsPlayerUserId", equalTo(defaultTestUserId))
        }
    }

    @Test
    fun `spectator cannot submit commands`() {
        val game = createGame()
        assignSides(game.id, defaultTestUserId, alternateTestUserId)
        seedUser("spectator-user", "Spectator")

        authenticatedPostGameCommand(
            game.id,
            command(game.version, "start-game"),
            userId = "spectator-user"
        ).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("You must claim a side before submitting commands."))
        }
    }

    @Test
    fun `wrong side cannot move when it is not their turn`() {
        seedUser("third-user", "Third Player")
        val game = createGame()
        assignSides(game.id, defaultTestUserId, alternateTestUserId)

        authenticatedPostGameCommand(
            game.id,
            command(game.version, "start-game"),
            userId = defaultTestUserId
        ).andExpect {
            status { isOk() }
        }

        authenticatedPostGameCommand(
            game.id,
            command(1, "cycle-setup", square = "a1"),
            userId = alternateTestUserId
        ).andExpect {
            status { isForbidden() }
            jsonPath("$.message", equalTo("It is not your turn."))
        }
    }

    @Test
    fun `game view response includes viewer role and seat info`() {
        val game = createGame()
        assignSides(game.id, defaultTestUserId, alternateTestUserId)

        mockMvc.get("/api/games/${game.id}/view") {
            with(authenticated(game.id, defaultTestUserId))
            accept = MediaType.APPLICATION_JSON
        }.andExpect {
            status { isOk() }
            jsonPath("$.viewerRole", equalTo("dragons"))
            jsonPath("$.currentUser.id", equalTo(defaultTestUserId))
            jsonPath("$.dragonsPlayer.id", equalTo(defaultTestUserId))
            jsonPath("$.ravensPlayer.id", equalTo(alternateTestUserId))
        }
    }
}
