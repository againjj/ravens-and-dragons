import { getCenterSquare, getColumnLetters, getRowNumbers, isValidBoardSize } from "../../board-geometry.js";
import type {
    CreateGameDraftState,
    CreateGameRequest,
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
const setupCycle: Piece[] = ["raven", "dragon", "gold"];
const freePlayDefaultStartingSide: Side = "ravens";
const dragonsStartSide: Side = "dragons";
const ravensStartSide: Side = "ravens";
const originalSetupParagraph =
    "The game starts in a cross formation: gold in the center with dragons surrounding it, and two ravens behind each dragon.";
const squareOneSetupParagraph =
    "The game starts in a cross formation: gold in the center with dragons surrounding it, and eight ravens around the dragons.";
const originalStyleMoveParagraphs = [
    "Ravens move first.",
    "Pieces move any distance orthogonally without jumping. The gold is moved by the dragons. No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
    "You may not make a move that causes any of your own pieces to be captured."
];
const sherwoodStyleMoveParagraphs = [
    "Ravens move first.",
    "Ravens and dragons move any distance orthogonally without jumping. The gold is moved by the dragons and may move only one square orthogonally at a time.",
    "No piece may land on the center square after the gold leaves it, and only the gold may land on the corner squares.",
    "You may not make a move that causes any of your own pieces to be captured."
];

interface PresetRuleConfigurationDefinition {
    id: string;
    name: string;
    boardSize: number;
    specialSquare: string;
    presetBoard: Record<string, Piece>;
    startingSide: Side;
    descriptionSections: RuleConfigurationSummary["descriptionSections"];
    hasManualCapture?: boolean;
    hasManualEndGame?: boolean;
}

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
                "Ravens and dragons are captured by being sandwiched orthogonally by enemies, by an enemy plus the empty center, or by an enemy plus a corner. The gold is captured by four ravens in the center, by three ravens when beside the center, and otherwise like another piece."
            ]
        },
        {
            heading: "Winner",
            paragraphs: [
                "Dragons win if the gold reaches any corner square. Ravens win if they capture the gold. The game is drawn on repetition of the same position on the same player's turn, or when the side to move has no legal moves."
            ]
        }
    ],
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

const createPresetRuleConfiguration = ({
    id,
    name,
    boardSize,
    specialSquare,
    presetBoard,
    startingSide,
    descriptionSections,
    hasManualCapture = false,
    hasManualEndGame = false
}: PresetRuleConfigurationDefinition): CreateRuleConfiguration => ({
    summary: {
        id,
        name,
        descriptionSections,
        hasManualCapture,
        hasManualEndGame
    },
    boardSize,
    specialSquare,
    presetBoard,
    startingSide
});

const createOriginalStylePresetRuleConfiguration = (
    definition: Omit<PresetRuleConfigurationDefinition, "descriptionSections" | "startingSide"> & {
        moveParagraphs: string[];
        setupParagraph: string;
    }
): CreateRuleConfiguration =>
    createPresetRuleConfiguration({
        ...definition,
        startingSide: ravensStartSide,
        descriptionSections: createOriginalStyleSummary(
            definition.id,
            definition.name,
            definition.moveParagraphs,
            definition.setupParagraph
        ).descriptionSections
    });

const freePlay = createPresetRuleConfiguration({
    id: defaultRuleConfigurationId,
    name: "Free Play",
    boardSize: defaultBoardSize,
    specialSquare: getCenterSquare(defaultBoardSize),
    presetBoard: {},
    startingSide: freePlayDefaultStartingSide,
    hasManualCapture: true,
    hasManualEndGame: true,
    descriptionSections: [
        {
            heading: "Overview",
            paragraphs: [
                "Ravens are trying to steal the dragons' gold! Build the opening position on the create page, then ravens and dragons alternate turns once the game starts."
            ]
        },
        {
            heading: "Create Game",
            paragraphs: [
                "On the create page, click any square to cycle through raven, dragon, gold, then empty. Starting the game locks in that drafted board as the live opening position."
            ]
        },
        {
            heading: "Turns",
            paragraphs: [
                "The selected starting side moves first. Dragons may move the gold on their turns. To move, click on a piece, and then click on the destination square. After moving, you may optionally capture an opposing piece. End the game to finish this game, then create a new game in the lobby to play again."
            ]
        }
    ]
});

const trivial = createPresetRuleConfiguration({
    id: "trivial",
    name: "Trivial Configuration",
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
    startingSide: dragonsStartSide,
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
    ]
});

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

const originalStylePresetConfigurations = [
    {
        id: "original-game",
        name: "Original Game",
        boardSize: defaultBoardSize,
        specialSquare: "d4",
        presetBoard: originalStylePresetBoard,
        moveParagraphs: originalStyleMoveParagraphs,
        setupParagraph: originalSetupParagraph
    },
    {
        id: "sherwood-rules",
        name: "Sherwood Rules",
        boardSize: defaultBoardSize,
        specialSquare: "d4",
        presetBoard: originalStylePresetBoard,
        moveParagraphs: sherwoodStyleMoveParagraphs,
        setupParagraph: originalSetupParagraph
    },
    {
        id: "square-one",
        name: "Square One",
        boardSize: defaultBoardSize,
        specialSquare: "d4",
        presetBoard: squareOnePresetBoard,
        moveParagraphs: sherwoodStyleMoveParagraphs,
        setupParagraph: squareOneSetupParagraph
    },
    {
        id: "sherwood-x-9",
        name: "Sherwood x 9",
        boardSize: 9,
        specialSquare: "e5",
        presetBoard: shiftPresetBoard(originalStylePresetBoard, 1, 1),
        moveParagraphs: sherwoodStyleMoveParagraphs,
        setupParagraph: originalSetupParagraph
    },
    {
        id: "square-one-x-9",
        name: "Square One x 9",
        boardSize: 9,
        specialSquare: "e5",
        presetBoard: shiftPresetBoard(squareOnePresetBoard, 1, 1),
        moveParagraphs: sherwoodStyleMoveParagraphs,
        setupParagraph: squareOneSetupParagraph
    }
].map(createOriginalStylePresetRuleConfiguration);

export const createRuleConfigurations: CreateRuleConfiguration[] = [freePlay, trivial, ...originalStylePresetConfigurations];

const createRuleConfigurationById = new Map(createRuleConfigurations.map((ruleConfiguration) => [ruleConfiguration.summary.id, ruleConfiguration]));

export const getCreateRuleConfiguration = (ruleConfigurationId: string): CreateRuleConfiguration | null =>
    createRuleConfigurationById.get(ruleConfigurationId) ?? null;

export const getCreateRuleConfigurationSummaries = (): RuleConfigurationSummary[] =>
    createRuleConfigurations.map((ruleConfiguration) => ruleConfiguration.summary);

export const createDraftState = (): CreateGameDraftState => ({
    isActive: false,
    selectedRuleConfigurationId: defaultRuleConfigurationId,
    selectedStartingSide: freePlayDefaultStartingSide,
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
            phase: "move",
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

export const buildCreateGameRequest = (draftState: CreateGameDraftState): CreateGameRequest => {
    const request: CreateGameRequest = {
        ruleConfigurationId: draftState.selectedRuleConfigurationId,
        startingSide: draftState.selectedStartingSide,
        boardSize: draftState.selectedBoardSize
    };

    if (draftState.selectedRuleConfigurationId === defaultRuleConfigurationId) {
        request.board = filterDraftBoardToBoardSize(draftState.draftBoard, draftState.selectedBoardSize);
    }

    return request;
};

export const isDraftBoardEditable = (draftState: CreateGameDraftState): boolean =>
    draftState.isActive && draftState.selectedRuleConfigurationId === defaultRuleConfigurationId;

export const isValidDraftBoardSize = (boardSize: number): boolean => isValidBoardSize(boardSize);
