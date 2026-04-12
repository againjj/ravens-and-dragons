package com.dragonsvsravens

import com.dragonsvsravens.game.AbstractGameControllerTestSupport
import org.junit.jupiter.api.Test
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
class AppRoutesControllerTest : AbstractGameControllerTestSupport() {

    @Test
    fun `root route loads the frontend app shell directly`() {
        mockMvc.get("/") {
            accept = MediaType.TEXT_HTML
        }.andExpect {
            status { isOk() }
            forwardedUrl("index.html")
        }
    }

    @Test
    fun `login route loads the frontend app shell directly`() {
        mockMvc.get("/login") {
            accept = MediaType.TEXT_HTML
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }

    @Test
    fun `lobby route loads the frontend app shell directly`() {
        mockMvc.get("/lobby") {
            accept = MediaType.TEXT_HTML
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }

    @Test
    fun `game route loads the frontend app shell directly`() {
        mockMvc.get("/g/CFGHJMP") {
            accept = MediaType.TEXT_HTML
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }
}
