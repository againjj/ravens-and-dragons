package com.ravensanddragons.training

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.bot.machine.*
import com.ravensanddragons.game.bot.strategy.*
import com.ravensanddragons.game.model.*
import com.ravensanddragons.game.rules.*


import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path

class TrainingExampleCodec(
    private val objectMapper: ObjectMapper
) {
    fun write(path: Path, dataset: MachineTrainedDataset) {
        path.parent?.let(Files::createDirectories)
        Files.newBufferedWriter(path).use { writer ->
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, dataset)
        }
    }

    fun read(path: Path): MachineTrainedDataset =
        Files.newBufferedReader(path).use { reader ->
            objectMapper.readValue(reader, MachineTrainedDataset::class.java)
        }
}
