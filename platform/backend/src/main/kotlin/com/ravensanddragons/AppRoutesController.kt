package com.ravensanddragons

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ResponseBody

@Controller
class AppRoutesController {
    @GetMapping("/health")
    @ResponseBody
    fun health(): String = "ok"

    @GetMapping("/login", "/lobby", "/profile")
    fun appRoute(): String = "forward:/index.html"

    @GetMapping("/{gameSlug:[a-z0-9]+(?:-[a-z0-9]+)*}/create")
    fun createRoute(): String = "forward:/index.html"

    @GetMapping("/g/{gameId:[A-Za-z0-9]+}")
    fun gameRoute(): String = "forward:/index.html"
}
