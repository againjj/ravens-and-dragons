package com.ravensanddragons.platform.game.runtime

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class PlatformGameJsonCodec(
    private val objectMapper: ObjectMapper
) {
    fun writeJson(value: JsonNode): String =
        objectMapper.writeValueAsString(value)

    fun readJson(json: String): JsonNode =
        objectMapper.readTree(json)

    fun emptyObject(): JsonNode =
        objectMapper.createObjectNode()
}
