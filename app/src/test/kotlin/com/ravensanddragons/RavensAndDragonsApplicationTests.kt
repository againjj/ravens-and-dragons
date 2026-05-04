package com.ravensanddragons

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertAll
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.web.ServerProperties
import java.time.Duration
import kotlin.test.assertEquals

@SpringBootTest
class RavensAndDragonsApplicationTests(
    @Autowired private val serverProperties: ServerProperties,
    @Autowired private val staleGameCleanupDelay: Duration
) {

    @Test
    fun contextLoads() {
    }

    @Test
    fun cleanupDelayAndSessionTimeoutFollowConfiguredDefaults() {
        assertAll(
            { assertEquals(Duration.ofHours(2), serverProperties.servlet.session.timeout) },
            { assertEquals(Duration.ofHours(1008).dividedBy(10), staleGameCleanupDelay) }
        )
    }
}
