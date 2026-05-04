package com.ravensanddragons.game.rules

import com.ravensanddragons.game.bot.*
import com.ravensanddragons.game.model.*


internal object RuleCatalog {
    private const val defaultSpecialSquare = "d4"
    private val originalStylePresetBoard = linkedMapOf(
        "d4" to Piece.gold,
        "d5" to Piece.dragon,
        "c4" to Piece.dragon,
        "e4" to Piece.dragon,
        "d3" to Piece.dragon,
        "d7" to Piece.raven,
        "d6" to Piece.raven,
        "a4" to Piece.raven,
        "b4" to Piece.raven,
        "f4" to Piece.raven,
        "g4" to Piece.raven,
        "d2" to Piece.raven,
        "d1" to Piece.raven
    )
    private val squareOnePresetBoard = linkedMapOf(
        "d4" to Piece.gold,
        "d5" to Piece.dragon,
        "c4" to Piece.dragon,
        "e4" to Piece.dragon,
        "d3" to Piece.dragon,
        "b6" to Piece.raven,
        "d6" to Piece.raven,
        "f6" to Piece.raven,
        "b4" to Piece.raven,
        "f4" to Piece.raven,
        "b2" to Piece.raven,
        "d2" to Piece.raven,
        "f2" to Piece.raven
    )
    private val sherwoodX9PresetBoard = shiftPresetBoard(originalStylePresetBoard, fileOffset = 1, rankOffset = 1)
    private val squareOneX9PresetBoard = shiftPresetBoard(squareOnePresetBoard, fileOffset = 1, rankOffset = 1)

    private val freePlay = RuleConfiguration(
        summary = RuleConfigurationSummary(
            id = GameRules.freePlayRuleConfigurationId,
            name = "Free Play",
            descriptionSections = listOf(
                RuleDescriptionSection(
                    heading = "Overview",
                    paragraphs = listOf(
                        "Ravens are trying to steal the dragons' gold! Build the opening position on the create page, then ravens and dragons alternate turns once the game starts."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Create Game",
                    paragraphs = listOf(
                        "On the create page, click any square to cycle through raven, dragon, gold, then empty. Starting the game locks in that drafted board as the live opening position."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Turns",
                    paragraphs = listOf(
                        "The selected starting side moves first. Dragons may move the gold on their turns. To move, click on a piece, and then click on the destination square. After moving, you may optionally capture an opposing piece. End the game to finish this game, then create a new game in the lobby to play again."
                    )
                )
            ),
            hasManualCapture = true,
            hasManualEndGame = true
        ),
        boardSize = GameRules.defaultBoardSize,
        specialSquare = defaultSpecialSquare,
        presetBoard = emptyMap(),
        startingSide = Side.dragons,
        ruleSet = FreePlayRuleEngine
    )

    private val trivial = RuleConfiguration(
        summary = RuleConfigurationSummary(
            id = "trivial",
            name = "Trivial Configuration",
            descriptionSections = listOf(
                RuleDescriptionSection(
                    heading = "Overview",
                    paragraphs = listOf(
                        "The dragons need to move the gold to the center."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Setup",
                    paragraphs = listOf(
                        "The game starts from a preset board with dragons at a1 and g7, gold at a2 and g6, and ravens at a7 and g1."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Turns",
                    paragraphs = listOf(
                        "Dragons move first. Pieces can move from any square to any other empty square. Pieces are captured whenever the moved piece ends orthogonally adjacent to opposing pieces."
                    )
                ),
                RuleDescriptionSection(
                    heading = "Winner",
                    paragraphs = listOf(
                        "Dragons win if any gold reaches d4 or all ravens are captured. Ravens win if all gold is captured."
                    )
                )
            ),
            hasManualCapture = false,
            hasManualEndGame = false
        ),
        boardSize = GameRules.defaultBoardSize,
        specialSquare = defaultSpecialSquare,
        presetBoard = linkedMapOf(
            "a1" to Piece.dragon,
            "g7" to Piece.dragon,
            "a2" to Piece.gold,
            "g6" to Piece.gold,
            "a7" to Piece.raven,
            "g1" to Piece.raven
        ),
        startingSide = Side.dragons,
        ruleSet = TrivialRuleEngine
    )

    private val originalGame = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "original-game",
            name = "Original Game",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Pieces move any distance orthogonally without jumping. The gold is moved by the dragons. No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            ),
            setupParagraph = "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon."
        ),
        boardSize = GameRules.defaultBoardSize,
        specialSquare = defaultSpecialSquare,
        presetBoard = originalStylePresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleEngine()
    )

    private val sherwoodRules = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "sherwood-rules",
            name = "Sherwood Rules",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Ravens and dragons move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
                "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            ),
            setupParagraph = "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon."
        ),
        boardSize = GameRules.defaultBoardSize,
        specialSquare = defaultSpecialSquare,
        presetBoard = originalStylePresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleEngine(goldMovesOneSquareAtATime = true)
    )

    private val squareOneRules = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "square-one",
            name = "Square One",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Ravens and dragons move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
                "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            ),
            setupParagraph = "The game starts in a cross formation: gold in the center with dragons surrounding it, and eight ravens around the dragons."
        ),
        boardSize = GameRules.defaultBoardSize,
        specialSquare = defaultSpecialSquare,
        presetBoard = squareOnePresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleEngine(goldMovesOneSquareAtATime = true)
    )

    private val sherwoodX9Rules = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "sherwood-x-9",
            name = "Sherwood x 9",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Ravens and dragons move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
                "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            ),
            setupParagraph = "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon."
        ),
        boardSize = 9,
        specialSquare = "e5",
        presetBoard = sherwoodX9PresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleEngine(goldMovesOneSquareAtATime = true)
    )

    private val squareOneX9Rules = RuleConfiguration(
        summary = createOriginalStyleSummary(
            id = "square-one-x-9",
            name = "Square One x 9",
            moveParagraphs = listOf(
                "Ravens move first.",
                "Ravens and dragons move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
                "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
                "You may not make a move that causes any of your own pieces to be captured.",
            ),
            setupParagraph = "The game starts in a cross formation: gold in the center with dragons surrounding it, and eight ravens around the dragons."
        ),
        boardSize = 9,
        specialSquare = "e5",
        presetBoard = squareOneX9PresetBoard,
        startingSide = Side.ravens,
        ruleSet = OriginalStyleRuleEngine(goldMovesOneSquareAtATime = true)
    )

    private val ruleConfigurations = listOf(
        freePlay,
        trivial,
        originalGame,
        sherwoodRules,
        squareOneRules,
        sherwoodX9Rules,
        squareOneX9Rules
    )
    private val ruleConfigurationsById = ruleConfigurations.associateBy { it.summary.id }

    fun availableRuleConfigurations(): List<RuleConfigurationSummary> =
        ruleConfigurations.map { it.summary }

    fun getRuleConfiguration(ruleConfigurationId: String): RuleConfiguration =
        ruleConfigurationsById[ruleConfigurationId]
            ?: throw InvalidCommandException("Unknown rule configuration: $ruleConfigurationId")

    private fun createOriginalStyleSummary(
        id: String,
        name: String,
        moveParagraphs: List<String>,
        setupParagraph: String
    ): RuleConfigurationSummary = RuleConfigurationSummary(
        id = id,
        name = name,
        descriptionSections = listOf(
            RuleDescriptionSection(
                heading = "Overview",
                paragraphs = listOf(
                    "Ravens are trying to steal the dragons' gold! The dragons need to hide it in a corner to protect it."
                )
            ),
            RuleDescriptionSection(
                heading = "Setup",
                paragraphs = listOf(
                    setupParagraph,
                )
            ),
            RuleDescriptionSection(
                heading = "Moves",
                paragraphs = moveParagraphs
            ),
            RuleDescriptionSection(
                heading = "Captures",
                paragraphs = listOf(
                    "Ravens and dragons are captured by being sandwiched orthogonally by enemies, by an enemy plus the empty center, or by an enemy plus a corner. The gold is captured by four ravens in the center, by three ravens when beside the center, and otherwise like another piece.",
                )
            ),
            RuleDescriptionSection(
                heading = "Winner",
                paragraphs = listOf(
                    "Dragons win if the gold reaches any corner square. Ravens win if they capture the gold. The game is drawn on repetition of the same position on the same player's turn, or when the side to move has no legal moves."
                )
            )
        ),
        hasManualCapture = false,
        hasManualEndGame = false
    )

    private fun shiftPresetBoard(
        presetBoard: Map<String, Piece>,
        fileOffset: Int,
        rankOffset: Int
    ): Map<String, Piece> {
        val shiftedBoard = LinkedHashMap<String, Piece>()

        presetBoard.forEach { (square, piece) ->
            val shiftedFile = square[0] + fileOffset
            val shiftedRank = square.drop(1).toInt() + rankOffset
            shiftedBoard["$shiftedFile$shiftedRank"] = piece
        }

        return shiftedBoard
    }
}
