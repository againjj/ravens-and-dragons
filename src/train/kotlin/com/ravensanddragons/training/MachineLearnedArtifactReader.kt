package com.ravensanddragons.training

import com.fasterxml.jackson.databind.ObjectMapper
import com.ravensanddragons.game.MachineLearnedArtifactPayload
import com.ravensanddragons.game.MachineLearnedArtifactSupport
import com.ravensanddragons.game.MachineLearnedModel
import java.nio.file.Files
import java.nio.file.Path

class MachineLearnedArtifactReader(
    private val objectMapper: ObjectMapper
) {
    fun read(path: Path): MachineLearnedModel =
        Files.newBufferedReader(path).use { reader ->
            val payload = objectMapper.readValue(reader, MachineLearnedArtifactPayload::class.java)
            MachineLearnedArtifactSupport.toModel(payload)
        }
}
