package com.ravensanddragons.game

import java.util.concurrent.ConcurrentHashMap

object BoardCoordinates {
    private val geometries = ConcurrentHashMap<Int, BoardGeometry>()

    fun isValidBoardSize(boardSize: Int): Boolean =
        boardSize in 3..26

    fun isValidSquare(square: String, boardSize: Int): Boolean {
        if (!isValidBoardSize(boardSize)) {
            return false
        }

        val geometry = geometry(boardSize)
        val file = square.firstOrNull() ?: return false
        val rank = square.drop(1).toIntOrNull() ?: return false
        return file in geometry.files &&
            rank in 1..boardSize
    }

    fun allSquares(boardSize: Int): List<String> =
        geometry(boardSize).allSquares

    fun centerSquare(boardSize: Int): String =
        geometry(boardSize).centerSquare

    fun cornerSquares(boardSize: Int): Set<String> =
        geometry(boardSize).cornerSquares

    fun isCenter(square: String, specialSquare: String): Boolean =
        square == specialSquare

    fun isCorner(square: String, boardSize: Int): Boolean =
        square in cornerSquares(boardSize)

    fun neighbors(square: String, boardSize: Int): List<String> =
        geometry(boardSize).neighbors[square] ?: emptyList()

    fun oppositePairs(square: String, boardSize: Int): List<Pair<String, String>> =
        geometry(boardSize).oppositePairs[square] ?: emptyList()

    fun isOrthogonallyAdjacent(first: String, second: String, boardSize: Int): Boolean {
        val firstIndexes = indexes(first, boardSize) ?: return false
        val secondIndexes = indexes(second, boardSize) ?: return false
        val fileDistance = kotlin.math.abs(firstIndexes.first - secondIndexes.first)
        val rankDistance = kotlin.math.abs(firstIndexes.second - secondIndexes.second)
        return fileDistance + rankDistance == 1
    }

    fun pathBetween(origin: String, destination: String, boardSize: Int): List<String> =
        geometry(boardSize).pathBetween(origin, destination)

    fun orthogonalRays(square: String, boardSize: Int): List<List<String>> =
        geometry(boardSize).orthogonalRays[square] ?: emptyList()

    private fun geometry(boardSize: Int): BoardGeometry {
        require(isValidBoardSize(boardSize)) { "Board size must be between 3 and 26." }
        return geometries.computeIfAbsent(boardSize, ::BoardGeometry)
    }

    private fun indexes(square: String, boardSize: Int): Pair<Int, Int>? {
        if (!isValidSquare(square, boardSize)) {
            return null
        }

        return geometry(boardSize).fileIndexes.getValue(square[0]) to (square.drop(1).toInt() - 1)
    }

    private data class BoardGeometry(
        val boardSize: Int
    ) {
        val files: List<Char> = ('a'..'z').take(boardSize)
        val fileIndexes: Map<Char, Int> = files.withIndex().associate { (index, file) -> file to index }
        val centerSquare: String = "${files[boardSize / 2]}${(boardSize / 2) + 1}"
        val allSquares: List<String> = (1..boardSize).flatMap { rank ->
            files.map { file -> "$file$rank" }
        }
        val cornerSquares: Set<String> = setOf(
            "${files.first()}1",
            "${files.first()}$boardSize",
            "${files.last()}1",
            "${files.last()}$boardSize"
        )
        val neighbors: Map<String, List<String>> = allSquares.associateWith { square ->
            val (fileIndex, rankIndex) = indexes(square)
            listOfNotNull(
                squareAt(fileIndex, rankIndex + 1),
                squareAt(fileIndex + 1, rankIndex),
                squareAt(fileIndex, rankIndex - 1),
                squareAt(fileIndex - 1, rankIndex)
            )
        }
        val oppositePairs: Map<String, List<Pair<String, String>>> = allSquares.associateWith { square ->
            val (fileIndex, rankIndex) = indexes(square)
            listOfNotNull(
                pairAt(fileIndex, rankIndex + 1, fileIndex, rankIndex - 1),
                pairAt(fileIndex - 1, rankIndex, fileIndex + 1, rankIndex)
            )
        }
        val orthogonalRays: Map<String, List<List<String>>> = allSquares.associateWith { square ->
            val (fileIndex, rankIndex) = indexes(square)
            listOf(
                buildRay(fileIndex, rankIndex, 0, 1),
                buildRay(fileIndex, rankIndex, 1, 0),
                buildRay(fileIndex, rankIndex, 0, -1),
                buildRay(fileIndex, rankIndex, -1, 0)
            ).filter { it.isNotEmpty() }
        }

        fun pathBetween(origin: String, destination: String): List<String> {
            val (originFile, originRank) = indexes(origin)
            val (destinationFile, destinationRank) = indexes(destination)
            if (originFile != destinationFile && originRank != destinationRank) {
                return emptyList()
            }

            val fileStep = destinationFile.compareTo(originFile)
            val rankStep = destinationRank.compareTo(originRank)
            val path = mutableListOf<String>()
            var nextFile = originFile + fileStep
            var nextRank = originRank + rankStep

            while (nextFile != destinationFile || nextRank != destinationRank) {
                path += squareAt(nextFile, nextRank) ?: return emptyList()
                nextFile += fileStep
                nextRank += rankStep
            }

            return path
        }

        private fun indexes(square: String): Pair<Int, Int> =
            fileIndexes.getValue(square[0]) to (square.drop(1).toInt() - 1)

        private fun buildRay(fileIndex: Int, rankIndex: Int, fileStep: Int, rankStep: Int): List<String> {
            val squares = mutableListOf<String>()
            var nextFile = fileIndex + fileStep
            var nextRank = rankIndex + rankStep
            while (true) {
                val nextSquare = squareAt(nextFile, nextRank) ?: break
                squares += nextSquare
                nextFile += fileStep
                nextRank += rankStep
            }
            return squares
        }

        private fun squareAt(fileIndex: Int, rankIndex: Int): String? {
            if (fileIndex !in files.indices || rankIndex !in 0 until boardSize) {
                return null
            }

            return "${files[fileIndex]}${rankIndex + 1}"
        }

        private fun pairAt(
            firstFileIndex: Int,
            firstRankIndex: Int,
            secondFileIndex: Int,
            secondRankIndex: Int
        ): Pair<String, String>? {
            val first = squareAt(firstFileIndex, firstRankIndex) ?: return null
            val second = squareAt(secondFileIndex, secondRankIndex) ?: return null
            return first to second
        }
    }
}
