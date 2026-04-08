package com.dragonsvsravens

import org.springframework.context.annotation.Bean
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling
import java.time.Clock

@SpringBootApplication
@EnableScheduling
class DragonsVsRavensApplication {
    @Bean
    fun systemClock(): Clock = Clock.systemUTC()
}

fun main(args: Array<String>) {
    runApplication<DragonsVsRavensApplication>(*args)
}
