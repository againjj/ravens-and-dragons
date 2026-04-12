package com.dragonsvsravens

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ResponseBody

@Controller
class AppRoutesController {
    @GetMapping("/health")
    @ResponseBody
    fun health(): String = "ok"

    @GetMapping("/login", "/lobby")
    fun appRoute(): String = "forward:/index.html"

    @GetMapping("/g/{gameId:[A-Za-z0-9]+}")
    fun gameRoute(): String = "forward:/index.html"
}
