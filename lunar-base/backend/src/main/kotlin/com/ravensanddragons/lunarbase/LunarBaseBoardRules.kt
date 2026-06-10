package com.ravensanddragons.lunarbase

internal fun LunarBasePublicState.withBoardSummaries(): LunarBasePublicState =
    copy(
        players = players.map { player ->
            player.copy(
                orbs = player.board.completedOrbCounts(),
                colonists = player.board.sumOf { it.card.colonists },
                achievements = player.board.flatMap { it.card.achievements }.toSet().size
            )
        }
    )

internal fun validateModulePlacement(board: List<LunarBaseBoardCard>, candidate: LunarBaseBoardCard): PlacementValidationResult {
    if (candidate.rotation !in validCardRotations) {
        return PlacementValidationResult.INVALID_ROTATION
    }

    val occupied = board.flatMap { it.coveredCells() }.toSet()
    val nextCells = candidate.coveredCells()
    if (nextCells.any { it in occupied }) {
        return PlacementValidationResult.OVERLAPS_CARD
    }
    if (board.isNotEmpty() && nextCells.none { cell -> cell.neighbors().any { it in occupied } }) {
        return PlacementValidationResult.DOES_NOT_TOUCH_BOARD
    }
    if (!connectorsMatch(candidate, board)) {
        return PlacementValidationResult.CONNECTORS_DO_NOT_MATCH
    }
    return PlacementValidationResult.VALID
}

internal enum class PlacementValidationResult {
    VALID,
    INVALID_ROTATION,
    OVERLAPS_CARD,
    DOES_NOT_TOUCH_BOARD,
    CONNECTORS_DO_NOT_MATCH
}

private val validCardRotations = setOf(0, 90, 180, 270)

private fun List<LunarBaseBoardCard>.completedOrbCounts(): LunarBaseResources {
    val wholeOrbs = flatMap { it.card.orbs }
    val joinedOrbs = flatMap { it.connectorSlots().entries }
        .groupBy({ it.key }, { it.value })
        .values
        .mapNotNull { colors -> colors.takeIf { it.size == 2 }?.let { completedOrbColor(it[0], it[1]) } }
    return (wholeOrbs + joinedOrbs).fold(LunarBaseResources()) { resources, color ->
        when (color) {
            "red" -> resources.copy(red = resources.red + 1)
            "blue" -> resources.copy(blue = resources.blue + 1)
            "yellow" -> resources.copy(yellow = resources.yellow + 1)
            "gray" -> resources.copy(gray = resources.gray + 1)
            else -> resources
        }
    }
}

private fun completedOrbColor(first: String, second: String): String? =
    when {
        first == grayColor && second == grayColor -> grayColor
        first == grayColor -> second
        second == grayColor -> first
        first == second -> first
        else -> null
    }

internal fun LunarBaseBoardCard.coveredCells(): List<Pair<Int, Int>> =
    if (rotation.isHorizontal()) listOf(x to y, x + 1 to y) else listOf(x to y, x to y + 1)

private fun Pair<Int, Int>.neighbors(): List<Pair<Int, Int>> =
    listOf(first - 1 to second, first + 1 to second, first to second - 1, first to second + 1)

private fun connectorsMatch(candidate: LunarBaseBoardCard, board: List<LunarBaseBoardCard>): Boolean {
    val candidateCells = candidate.coveredCells().toSet()
    val candidateOrbs = candidate.connectorSlots()
    val existingOrbs = board.associateWith { it.coveredCells().toSet() }
    var hasMatchingConnectorPair = false
    val allTouchedEdgesMatch = existingOrbs.all { (existing, existingCells) ->
        val existingSlots = existing.connectorSlots()
        candidateCells.all { cell ->
            cell.neighbors().filter { it in existingCells }.all { neighbor ->
                val slot = sharedOrbSlot(cell, neighbor)
                val candidateColor = candidateOrbs[slot]
                val existingColor = existingSlots[slot]
                if (candidateColor != null && existingColor != null && orbColorsMatch(candidateColor, existingColor)) {
                    hasMatchingConnectorPair = true
                }
                orbColorsMatch(candidateColor, existingColor)
            }
        }
    }
    return allTouchedEdgesMatch && hasMatchingConnectorPair
}

private fun sharedOrbSlot(first: Pair<Int, Int>, second: Pair<Int, Int>): OrbSlot {
    val x = first.first
    val y = first.second
    val nx = second.first
    val ny = second.second
    return when {
        nx == x + 1 -> OrbSlot((x + 1) * 2, y * 2 + 1)
        nx == x - 1 -> OrbSlot(x * 2, y * 2 + 1)
        ny == y + 1 -> OrbSlot(x * 2 + 1, (y + 1) * 2)
        ny == y - 1 -> OrbSlot(x * 2 + 1, y * 2)
        else -> error("Cells do not share an edge: $first and $second.")
    }
}

private fun orbColorsMatch(first: String?, second: String?): Boolean =
    when {
        first == null || second == null -> first == second
        first == grayColor || second == grayColor -> true
        else -> first == second
    }

private fun LunarBaseBoardCard.connectorSlots(): Map<OrbSlot, String> {
    val horizontal = rotation.isHorizontal()
    val centerX = if (horizontal) x + 1.0 else x + 0.5
    val centerY = if (horizontal) y + 0.5 else y + 1.0
    return (card.connectors?.entries() ?: emptyList()).mapNotNull { (position, color) ->
        color ?: return@mapNotNull null
        val local = position.localPoint()
        val rotated = local.rotate(rotation)
        OrbSlot(
            x2 = ((centerX + rotated.first) * 2).toInt(),
            y2 = ((centerY + rotated.second) * 2).toInt()
        ) to color
    }.toMap()
}

private fun Int.isHorizontal(): Boolean =
    this == 90 || this == 270

private data class OrbSlot(val x2: Int, val y2: Int)

private enum class LunarBaseConnectorPosition {
    TOP,
    TOP_LEFT,
    TOP_RIGHT,
    BOTTOM_LEFT,
    BOTTOM_RIGHT,
    BOTTOM
}

private fun LunarBaseCardConnectors.entries(): List<Pair<LunarBaseConnectorPosition, String?>> =
    listOf(
        LunarBaseConnectorPosition.TOP to top,
        LunarBaseConnectorPosition.TOP_LEFT to topLeft,
        LunarBaseConnectorPosition.TOP_RIGHT to topRight,
        LunarBaseConnectorPosition.BOTTOM_LEFT to bottomLeft,
        LunarBaseConnectorPosition.BOTTOM_RIGHT to bottomRight,
        LunarBaseConnectorPosition.BOTTOM to bottom
    )

private fun LunarBaseConnectorPosition.localPoint(): Pair<Double, Double> =
    when (this) {
        LunarBaseConnectorPosition.TOP -> 0.0 to -1.0
        LunarBaseConnectorPosition.TOP_LEFT -> -0.5 to -0.5
        LunarBaseConnectorPosition.TOP_RIGHT -> 0.5 to -0.5
        LunarBaseConnectorPosition.BOTTOM_LEFT -> -0.5 to 0.5
        LunarBaseConnectorPosition.BOTTOM_RIGHT -> 0.5 to 0.5
        LunarBaseConnectorPosition.BOTTOM -> 0.0 to 1.0
    }

private fun Pair<Double, Double>.rotate(rotation: Int): Pair<Double, Double> =
    when (rotation) {
        90 -> -second to first
        180 -> -first to -second
        270 -> second to -first
        else -> this
    }
