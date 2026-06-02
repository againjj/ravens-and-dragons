package com.ravensanddragons

import com.ravensanddragons.game.RavensAndDragonsGameModuleDefinition
import com.ravensanddragons.ginrummy.GinRummyGameModuleDefinition
import com.ravensanddragons.lunarbase.LunarBaseGameModuleDefinition
import com.ravensanddragons.platform.game.GameModuleRegistry
import com.ravensanddragons.tictactoe.TicTacToeGameModuleDefinition
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

    @Bean
    fun gameModuleRegistry(): GameModuleRegistry =
        GameModuleRegistry(
            listOf(
                TicTacToeGameModuleDefinition,
                GinRummyGameModuleDefinition,
                LunarBaseGameModuleDefinition,
                RavensAndDragonsGameModuleDefinition
            )
        )

    @Bean("staleGameCleanupDelay")
    fun staleGameCleanupDelay(
        @Value("\${platform.games.stale-threshold:\${ravens-and-dragons.games.stale-threshold:1008h}}")
        staleGameThreshold: Duration
    ): Duration =
        staleGameThreshold.dividedBy(10).takeIf { !it.isZero } ?: Duration.ofMillis(1)
}

fun main(args: Array<String>) {
    runApplication<RavensAndDragonsApplication>(*args)
}
