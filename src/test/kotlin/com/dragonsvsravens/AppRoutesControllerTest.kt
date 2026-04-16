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
    fun `signed out root route redirects to login`() {
        mockMvc.get("/") {
            secure = false
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?next=%2F")
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
    fun `health route is publicly available`() {
        mockMvc.get("/health") {
            secure = false
        }.andExpect {
            status { isOk() }
            content { string("ok") }
        }
    }

    @Test
    fun `signed out lobby route redirects to login`() {
        mockMvc.get("/lobby") {
            secure = false
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?next=%2Flobby")
        }
    }

    @Test
    fun `signed out game route redirects to login with next parameter`() {
        mockMvc.get("/g/CFGHJMP") {
            secure = false
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?next=%2Fg%2FCFGHJMP")
        }
    }

    @Test
    fun `signed out profile route redirects to login with next parameter`() {
        mockMvc.get("/profile") {
            secure = false
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?next=%2Fprofile")
        }
    }

    @Test
    fun `authenticated game route loads the frontend app shell directly`() {
        mockMvc.get("/g/CFGHJMP") {
            with(authenticated("CFGHJMP"))
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }

    @Test
    fun `authenticated profile route loads the frontend app shell directly`() {
        mockMvc.get("/profile") {
            with(authenticated("profile"))
        }.andExpect {
            status { isOk() }
            forwardedUrl("/index.html")
        }
    }
}
