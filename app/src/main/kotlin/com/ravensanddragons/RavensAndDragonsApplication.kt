package com.ravensanddragons

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling
import java.time.Clock
import java.time.Duration

@SpringBootApplication
@EnableScheduling
class RavensAndDragonsApplication {
    @Bean
    fun systemClock(): Clock = Clock.systemUTC()

    @Bean("staleGameCleanupDelay")
    fun staleGameCleanupDelay(
        @Value("\${ravens-and-dragons.games.stale-threshold:1008h}")
        staleGameThreshold: Duration
    ): Duration =
        staleGameThreshold.dividedBy(10).takeIf { !it.isZero } ?: Duration.ofMillis(1)
}

fun main(args: Array<String>) {
    runApplication<RavensAndDragonsApplication>(*args)
}
