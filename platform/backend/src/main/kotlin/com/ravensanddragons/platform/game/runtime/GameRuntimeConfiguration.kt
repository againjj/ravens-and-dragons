package com.ravensanddragons.platform.game.runtime

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import java.util.concurrent.Executor

@Configuration
class GameRuntimeConfiguration {
    @Bean
    fun commandFollowUpExecutor(): Executor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = 1
            maxPoolSize = 4
            setQueueCapacity(100)
            setThreadNamePrefix("game-command-follow-up-")
            initialize()
        }
}
