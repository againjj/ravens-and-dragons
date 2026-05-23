package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path

class MachineTrainedArtifactWriter(
    private val objectMapper: ObjectMapper
) {
    fun write(path: Path, model: MachineTrainedModel) {
        path.parent?.let(Files::createDirectories)
        Files.newBufferedWriter(path).use { writer ->
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, MachineTrainedArtifactSupport.toPayload(model))
        }
    }
}
