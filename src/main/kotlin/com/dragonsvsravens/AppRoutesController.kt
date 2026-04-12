package com.dragonsvsravens

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping

@Controller
class AppRoutesController {
    @GetMapping("/login", "/lobby")
    fun appRoute(): String = "forward:/index.html"

    @GetMapping("/g/{gameId:[A-Za-z0-9]+}")
    fun gameRoute(): String = "forward:/index.html"
}
