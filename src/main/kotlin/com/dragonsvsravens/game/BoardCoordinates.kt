package com.dragonsvsravens.game

object BoardCoordinates {
    private val filePattern = 'a'..'g'
    private val rankPattern = '1'..'7'
    private val files = filePattern.toList()
    private val ranks = rankPattern.toList()
    private const val centerSquare = "d4"
    private val cornerSquares = setOf("a1", "a7", "g1", "g7")

    fun isValidSquare(square: String): Boolean =
        square.length == 2 && square[0] in filePattern && square[1] in rankPattern

    fun allSquares(): List<String> =
        ranks.flatMap { rank ->
            files.map { file -> "$file$rank" }
        }

    fun isCenter(square: String): Boolean = square == centerSquare

    fun isCorner(square: String): Boolean = square in cornerSquares

    fun neighbors(square: String): List<String> {
        val (fileIndex, rankIndex) = indexes(square) ?: return emptyList()
        return listOfNotNull(
            squareAt(fileIndex, rankIndex + 1),
            squareAt(fileIndex + 1, rankIndex),
            squareAt(fileIndex, rankIndex - 1),
            squareAt(fileIndex - 1, rankIndex)
        )
    }

    fun oppositePairs(square: String): List<Pair<String, String>> {
        val (fileIndex, rankIndex) = indexes(square) ?: return emptyList()
        return listOfNotNull(
            pairAt(fileIndex, rankIndex + 1, fileIndex, rankIndex - 1),
            pairAt(fileIndex - 1, rankIndex, fileIndex + 1, rankIndex)
        )
    }

    fun isOrthogonallyAdjacent(first: String, second: String): Boolean {
        val firstIndexes = indexes(first) ?: return false
        val secondIndexes = indexes(second) ?: return false
        val fileDistance = kotlin.math.abs(firstIndexes.first - secondIndexes.first)
        val rankDistance = kotlin.math.abs(firstIndexes.second - secondIndexes.second)
        return fileDistance + rankDistance == 1
    }

    fun pathBetween(origin: String, destination: String): List<String> {
        val (originFile, originRank) = indexes(origin) ?: return emptyList()
        val (destinationFile, destinationRank) = indexes(destination) ?: return emptyList()
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

    private fun indexes(square: String): Pair<Int, Int>? {
        if (!isValidSquare(square)) {
            return null
        }

        return files.indexOf(square[0]) to ranks.indexOf(square[1])
    }

    private fun squareAt(fileIndex: Int, rankIndex: Int): String? {
        if (fileIndex !in files.indices || rankIndex !in ranks.indices) {
            return null
        }

        return "${files[fileIndex]}${ranks[rankIndex]}"
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
