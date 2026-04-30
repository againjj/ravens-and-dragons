package com.ravensanddragons.training

import com.fasterxml.jackson.databind.ObjectMapper
import com.ravensanddragons.game.MachineLearnedArtifactSupport
import com.ravensanddragons.game.MachineLearnedModel
import java.nio.file.Files
import java.nio.file.Path

class MachineLearnedArtifactWriter(
    private val objectMapper: ObjectMapper
) {
    fun write(path: Path, model: MachineLearnedModel) {
        path.parent?.let(Files::createDirectories)
        Files.newBufferedWriter(path).use { writer ->
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, MachineLearnedArtifactSupport.toPayload(model))
        }
    }
}
