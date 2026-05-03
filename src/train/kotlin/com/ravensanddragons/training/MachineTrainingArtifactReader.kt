package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path

class MachineTrainedArtifactReader(
    private val objectMapper: ObjectMapper
) {
    fun read(path: Path): MachineTrainedModel =
        Files.newBufferedReader(path).use { reader ->
            val payload = objectMapper.readValue(reader, MachineTrainedArtifactPayload::class.java)
            MachineTrainedArtifactSupport.toModel(payload)
        }
}
