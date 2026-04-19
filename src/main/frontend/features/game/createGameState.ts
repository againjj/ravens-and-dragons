import { getCenterSquare, getColumnLetters, getRowNumbers, isValidBoardSize } from "../../board-geometry.js";
import type {
    CreateGameDraftState,
    Piece,
    RuleConfigurationSummary,
    ServerGameSnapshot,
    Side
} from "../../game-types.js";

export interface CreateRuleConfiguration {
    summary: RuleConfigurationSummary;
    boardSize: number;
    specialSquare: string;
    presetBoard: Record<string, Piece>;
    startingSide: Side;
}

const defaultBoardSize = 7;
const defaultRuleConfigurationId = "free-play";
const setupCycle: Piece[] = ["dragon", "raven", "gold"];

const createOriginalStyleSummary = (
    id: string,
    name: string,
    moveParagraphs: string[],
    setupParagraph: string
): RuleConfigurationSummary => ({
    id,
    name,
    descriptionSections: [
        {
            heading: "Overview",
            paragraphs: ["Ravens are trying to steal the dragons' gold! The dragons need to hide it in a corner to protect it."]
        },
        {
            heading: "Setup",
            paragraphs: [setupParagraph]
        },
        {
            heading: "Moves",
            paragraphs: moveParagraphs
        },
        {
            heading: "Captures",
            paragraphs: [
                "Dragons and ravens are captured by being sandwiched orthogonally by enemies, by an enemy plus the empty center, or by an enemy plus a corner. The gold is captured by four ravens in the center, by three ravens when beside the center, and otherwise like another piece."
            ]
        },
        {
            heading: "Winner",
            paragraphs: [
                "Dragons win if the gold reaches any corner square. Ravens win if they capture the gold. The game is drawn on repetition of the same position on the same player's turn, or when the side to move has no legal moves."
            ]
        }
    ],
    hasSetupPhase: false,
    hasManualCapture: false,
    hasManualEndGame: false
});

const shiftPresetBoard = (
    presetBoard: Record<string, Piece>,
    fileOffset: number,
    rankOffset: number
): Record<string, Piece> =>
    Object.entries(presetBoard).reduce<Record<string, Piece>>((shiftedBoard, [square, piece]) => {
        const shiftedFile = String.fromCharCode(square.charCodeAt(0) + fileOffset);
        const shiftedRank = Number.parseInt(square.slice(1), 10) + rankOffset;
        shiftedBoard[`${shiftedFile}${shiftedRank}`] = piece;
        return shiftedBoard;
    }, {});

const freePlay: CreateRuleConfiguration = {
    summary: {
        id: defaultRuleConfigurationId,
        name: "Free Play",
        descriptionSections: [
            {
                heading: "Overview",
                paragraphs: [
                    "Ravens are trying to steal the dragons' gold! Start a game. Place pieces during setup, then dragons and ravens alternate turns."
                ]
            },
            {
                heading: "Setup Phase",
                paragraphs: [
                    "Click any square to cycle through dragon, raven, gold, then empty. Click \"End Setup\" when all the pieces are placed."
                ]
            },
            {
                heading: "Turns",
                paragraphs: [
                    "The selected starting side moves first. Dragons may move the gold on their turns. To move, click on a piece, and then click on the destination square. After moving, you may optionally capture an opposing piece. End the game to finish this game, then create a new game in the lobby to play again."
                ]
            }
        ],
        hasSetupPhase: true,
        hasManualCapture: true,
        hasManualEndGame: true
    },
    boardSize: defaultBoardSize,
    specialSquare: getCenterSquare(defaultBoardSize),
    presetBoard: {},
    startingSide: "dragons"
};

const trivial: CreateRuleConfiguration = {
    summary: {
        id: "trivial",
        name: "Trivial Configuration",
        descriptionSections: [
            {
                heading: "Overview",
                paragraphs: ["The dragons need to move the gold to the center."]
            },
            {
                heading: "Setup",
                paragraphs: ["The game starts from a preset board with dragons at a1 and g7, gold at a2 and g6, and ravens at a7 and g1."]
            },
            {
                heading: "Turns",
                paragraphs: [
                    "Dragons move first. Pieces can move from any square to any other empty square. Pieces are captured whenever the moved piece ends orthogonally adjacent to opposing pieces."
                ]
            },
            {
                heading: "Winner",
                paragraphs: [
                    "Dragons win if any gold reaches d4 or all ravens are captured. Ravens win if all gold is captured."
                ]
            }
        ],
        hasSetupPhase: false,
        hasManualCapture: false,
        hasManualEndGame: false
    },
    boardSize: defaultBoardSize,
    specialSquare: "d4",
    presetBoard: {
        a1: "dragon",
        g7: "dragon",
        a2: "gold",
        g6: "gold",
        a7: "raven",
        g1: "raven"
    },
    startingSide: "dragons"
};

const originalStylePresetBoard = {
    d4: "gold",
    d5: "dragon",
    c4: "dragon",
    e4: "dragon",
    d3: "dragon",
    d7: "raven",
    d6: "raven",
    a4: "raven",
    b4: "raven",
    f4: "raven",
    g4: "raven",
    d2: "raven",
    d1: "raven"
} satisfies Record<string, Piece>;

const squareOnePresetBoard = {
    d4: "gold",
    d5: "dragon",
    c4: "dragon",
    e4: "dragon",
    d3: "dragon",
    b6: "raven",
    d6: "raven",
    f6: "raven",
    b4: "raven",
    f4: "raven",
    b2: "raven",
    d2: "raven",
    f2: "raven"
} satisfies Record<string, Piece>;

const originalGame: CreateRuleConfiguration = {
    summary: createOriginalStyleSummary(
        "original-game",
        "Original Game",
        [
            "Ravens move first.",
            "Pieces move any distance orthogonally without jumping. The gold is moved by the dragons. No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
            "You may not make a move that causes any of your own pieces to be captured."
        ],
        "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon."
    ),
    boardSize: defaultBoardSize,
    specialSquare: "d4",
    presetBoard: originalStylePresetBoard,
    startingSide: "ravens"
};

const sherwoodRules: CreateRuleConfiguration = {
    summary: createOriginalStyleSummary(
        "sherwood-rules",
        "Sherwood Rules",
        [
            "Ravens move first.",
            "Dragons and ravens move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
            "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
            "You may not make a move that causes any of your own pieces to be captured."
        ],
        "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon."
    ),
    boardSize: defaultBoardSize,
    specialSquare: "d4",
    presetBoard: originalStylePresetBoard,
    startingSide: "ravens"
};

const squareOne: CreateRuleConfiguration = {
    summary: createOriginalStyleSummary(
        "square-one",
        "Square One",
        [
            "Ravens move first.",
            "Dragons and ravens move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
            "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
            "You may not make a move that causes any of your own pieces to be captured."
        ],
        "The game starts in a cross formation: gold in the center with dragons surrounding it, and eight ravens around the dragons."
    ),
    boardSize: defaultBoardSize,
    specialSquare: "d4",
    presetBoard: squareOnePresetBoard,
    startingSide: "ravens"
};

const sherwoodX9: CreateRuleConfiguration = {
    summary: createOriginalStyleSummary(
        "sherwood-x-9",
        "Sherwood x 9",
        [
            "Ravens move first.",
            "Dragons and ravens move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
            "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
            "You may not make a move that causes any of your own pieces to be captured."
        ],
        "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon."
    ),
    boardSize: 9,
    specialSquare: "e5",
    presetBoard: shiftPresetBoard(originalStylePresetBoard, 1, 1),
    startingSide: "ravens"
};

const squareOneX9: CreateRuleConfiguration = {
    summary: createOriginalStyleSummary(
        "square-one-x-9",
        "Square One x 9",
        [
            "Ravens move first.",
            "Dragons and ravens move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
            "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
            "You may not make a move that causes any of your own pieces to be captured."
        ],
        "The game starts in a cross formation: gold in the center with dragons surrounding it, and eight ravens around the dragons."
    ),
    boardSize: 9,
    specialSquare: "e5",
    presetBoard: shiftPresetBoard(squareOnePresetBoard, 1, 1),
    startingSide: "ravens"
};

export const createRuleConfigurations: CreateRuleConfiguration[] = [
    freePlay,
    trivial,
    originalGame,
    sherwoodRules,
    squareOne,
    sherwoodX9,
    squareOneX9
];

const createRuleConfigurationById = new Map(createRuleConfigurations.map((ruleConfiguration) => [ruleConfiguration.summary.id, ruleConfiguration]));

export const getCreateRuleConfiguration = (ruleConfigurationId: string): CreateRuleConfiguration | null =>
    createRuleConfigurationById.get(ruleConfigurationId) ?? null;

export const getCreateRuleConfigurationSummaries = (): RuleConfigurationSummary[] =>
    createRuleConfigurations.map((ruleConfiguration) => ruleConfiguration.summary);

export const createDraftState = (): CreateGameDraftState => ({
    isActive: false,
    selectedRuleConfigurationId: defaultRuleConfigurationId,
    selectedStartingSide: "dragons",
    selectedBoardSize: defaultBoardSize,
    draftBoard: {}
});

export const createActiveDraftState = (): CreateGameDraftState => ({
    ...createDraftState(),
    isActive: true
});

const isDraftBoardSquareValid = (square: string, boardSize: number): boolean => {
    const columns = getColumnLetters(boardSize);
    const rows = getRowNumbers(boardSize);
    const file = square[0];
    const rank = square.slice(1);
    return columns.includes(file) && rows.includes(rank);
};

export const filterDraftBoardToBoardSize = (board: Record<string, Piece>, boardSize: number): Record<string, Piece> =>
    Object.entries(board).reduce<Record<string, Piece>>((filteredBoard, [square, piece]) => {
        if (isDraftBoardSquareValid(square, boardSize)) {
            filteredBoard[square] = piece;
        }
        return filteredBoard;
    }, {});

export const cycleDraftSetupSquare = (board: Record<string, Piece>, square: string): Record<string, Piece> => {
    const currentPiece = board[square];
    const nextPieceIndex = currentPiece ? setupCycle.indexOf(currentPiece) + 1 : 0;
    const nextPiece = setupCycle[nextPieceIndex];
    const nextBoard = { ...board };

    if (nextPiece) {
        nextBoard[square] = nextPiece;
    } else {
        delete nextBoard[square];
    }

    return nextBoard;
};

export const buildDraftSnapshot = (draftState: CreateGameDraftState): ServerGameSnapshot | null => {
    if (!draftState.isActive) {
        return null;
    }

    const ruleConfiguration = getCreateRuleConfiguration(draftState.selectedRuleConfigurationId);
    if (!ruleConfiguration) {
        return null;
    }

    if (draftState.selectedRuleConfigurationId === defaultRuleConfigurationId) {
        const boardSize = draftState.selectedBoardSize;
        return {
            board: filterDraftBoardToBoardSize(draftState.draftBoard, boardSize),
            boardSize,
            specialSquare: getCenterSquare(boardSize),
            phase: "setup",
            activeSide: draftState.selectedStartingSide,
            pendingMove: null,
            turns: [],
            ruleConfigurationId: defaultRuleConfigurationId,
            positionKeys: []
        };
    }

    return {
        board: { ...ruleConfiguration.presetBoard },
        boardSize: ruleConfiguration.boardSize,
        specialSquare: ruleConfiguration.specialSquare,
        phase: "none",
        activeSide: ruleConfiguration.startingSide,
        pendingMove: null,
        turns: [],
        ruleConfigurationId: ruleConfiguration.summary.id,
        positionKeys: []
    };
};

export const isDraftBoardEditable = (draftState: CreateGameDraftState): boolean =>
    draftState.isActive && draftState.selectedRuleConfigurationId === defaultRuleConfigurationId;

export const isValidDraftBoardSize = (boardSize: number): boolean => isValidBoardSize(boardSize);
