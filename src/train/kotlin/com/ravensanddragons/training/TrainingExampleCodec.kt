package com.ravensanddragons.training

import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path

class TrainingExampleCodec(
    private val objectMapper: ObjectMapper
) {
    fun write(path: Path, dataset: MachineLearnedDataset) {
        path.parent?.let(Files::createDirectories)
        Files.newBufferedWriter(path).use { writer ->
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(writer, dataset)
        }
    }

    fun read(path: Path): MachineLearnedDataset =
        Files.newBufferedReader(path).use { reader ->
            objectMapper.readValue(reader, MachineLearnedDataset::class.java)
        }
}
