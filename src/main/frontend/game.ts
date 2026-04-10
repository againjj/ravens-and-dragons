export type Piece = "dragon" | "raven" | "gold";
export type Side = "dragons" | "ravens";
export type Phase = "none" | "setup" | "move" | "capture";
export type TurnType = "move" | "gameOver";
export type GameLifecycle = "new" | "active" | "finished";
export interface RuleDescriptionSection {
    heading?: string;
    paragraphs: string[];
}
export interface RuleConfigurationSummary {
    id: string;
    name: string;
    descriptionSections: RuleDescriptionSection[];
    hasSetupPhase: boolean;
    hasManualCapture: boolean;
    hasManualEndGame: boolean;
}
export type TurnHistoryRow =
    | { type: "move"; label: string; key: string }
    | { type: "gameOver"; label: string; key: string };

export interface TurnRecord {
    type: TurnType;
    from?: string;
    to?: string;
    capturedSquares?: string[];
    outcome?: string;
}

export interface ServerGameSnapshot {
    board: Record<string, Piece>;
    phase: Phase;
    activeSide: Side;
    pendingMove: TurnRecord | null;
    turns: TurnRecord[];
    ruleConfigurationId: string;
    positionKeys: string[];
}

export interface ServerGameSession {
    id: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    lifecycle: GameLifecycle;
    snapshot: ServerGameSnapshot;
    canUndo: boolean;
    availableRuleConfigurations: RuleConfigurationSummary[];
    selectedRuleConfigurationId: string;
    selectedStartingSide: Side;
}

export interface CreateGameRequest {
    ruleConfigurationId?: string;
    startingSide?: Side;
}

export interface CreateGameResponse {
    game: ServerGameSession;
}

export const generatedGameIdPattern = /^[23456789CFGHJMPQRVWX]{7}$/;

export interface GameCommandRequest {
    expectedVersion: number;
    type:
        | "start-game"
        | "select-rule-configuration"
        | "select-starting-side"
        | "cycle-setup"
        | "end-setup"
        | "move-piece"
        | "capture-piece"
        | "skip-capture"
        | "undo"
        | "end-game";
    square?: string;
    origin?: string;
    destination?: string;
    ruleConfigurationId?: string;
    side?: Side;
}

export const columnLetters = ["a", "b", "c", "d", "e", "f", "g"];
export const rowNumbers = ["7", "6", "5", "4", "3", "2", "1"];
export const boardDimension = columnLetters.length;

export const getSquareName = (rowIndex: number, colIndex: number): string => `${columnLetters[colIndex]}${rowNumbers[rowIndex]}`;
const allSquares = rowNumbers.flatMap((_, rowIndex) =>
    columnLetters.map((_, colIndex) => getSquareName(rowIndex, colIndex))
);

export const sideOwnsPiece = (side: Side, piece: Piece): boolean => {
    if (piece === "gold") {
        return side === "dragons";
    }
    return side === "dragons" ? piece === "dragon" : piece === "raven";
};

export const canCapturePiece = (side: Side, piece: Piece): boolean =>
    side === "dragons" ? piece === "raven" : piece === "dragon" || piece === "gold";

export const getCapturableSquares = (snapshot: ServerGameSnapshot): string[] =>
    Object.entries(snapshot.board)
        .filter(([, piece]) => canCapturePiece(snapshot.activeSide, piece))
        .map(([square]) => square);

const getOrthogonalPath = (origin: string, destination: string): string[] | null => {
    const originFile = columnLetters.indexOf(origin[0]);
    const destinationFile = columnLetters.indexOf(destination[0]);
    const originRank = rowNumbers.indexOf(origin[1]);
    const destinationRank = rowNumbers.indexOf(destination[1]);

    if (originFile !== destinationFile && originRank !== destinationRank) {
        return null;
    }

    const fileStep = Math.sign(destinationFile - originFile);
    const rankStep = Math.sign(destinationRank - originRank);
    const path: string[] = [];
    let nextFile = originFile + fileStep;
    let nextRank = originRank + rankStep;

    while (nextFile !== destinationFile || nextRank !== destinationRank) {
        path.push(`${columnLetters[nextFile]}${rowNumbers[nextRank]}`);
        nextFile += fileStep;
        nextRank += rankStep;
    }

    return path;
};

const isCenterSquare = (square: string): boolean => square === "d4";
const isCornerSquare = (square: string): boolean => ["a1", "a7", "g1", "g7"].includes(square);
const originalStyleRuleConfigurationIds = new Set(["original-game", "sherwood-rules"]);
const isOriginalStyleRuleConfiguration = (ruleConfigurationId: string): boolean =>
    originalStyleRuleConfigurationIds.has(ruleConfigurationId);
const isSingleOrthogonalStep = (origin: string, destination: string): boolean => {
    const fileDistance = Math.abs(columnLetters.indexOf(origin[0]) - columnLetters.indexOf(destination[0]));
    const rankDistance = Math.abs(rowNumbers.indexOf(origin[1]) - rowNumbers.indexOf(destination[1]));
    return fileDistance + rankDistance === 1;
};

const getNeighbors = (square: string): string[] => {
    const fileIndex = columnLetters.indexOf(square[0]);
    const rankIndex = rowNumbers.indexOf(square[1]);
    const pairs = [
        [fileIndex, rankIndex - 1],
        [fileIndex + 1, rankIndex],
        [fileIndex, rankIndex + 1],
        [fileIndex - 1, rankIndex]
    ];

    return pairs
        .filter(([file, rank]) => file >= 0 && file < columnLetters.length && rank >= 0 && rank < rowNumbers.length)
        .map(([file, rank]) => `${columnLetters[file]}${rowNumbers[rank]}`);
};

const isEnemyPiece = (piece: Piece | undefined, movedPiece: Piece): boolean => {
    if (!piece) {
        return false;
    }

    return movedPiece === "raven" ? piece === "dragon" || piece === "gold" : piece === "raven";
};

const getOppositePairs = (square: string): Array<[string, string]> => {
    const fileIndex = columnLetters.indexOf(square[0]);
    const rankIndex = rowNumbers.indexOf(square[1]);
    const pairs = [
        [
            [fileIndex, rankIndex - 1],
            [fileIndex, rankIndex + 1]
        ],
        [
            [fileIndex - 1, rankIndex],
            [fileIndex + 1, rankIndex]
        ]
    ];

    return pairs
        .filter(([[firstFile, firstRank], [secondFile, secondRank]]) =>
            firstFile >= 0 &&
            firstFile < columnLetters.length &&
            firstRank >= 0 &&
            firstRank < rowNumbers.length &&
            secondFile >= 0 &&
            secondFile < columnLetters.length &&
            secondRank >= 0 &&
            secondRank < rowNumbers.length
        )
        .map(([[firstFile, firstRank], [secondFile, secondRank]]) => [
            `${columnLetters[firstFile]}${rowNumbers[firstRank]}`,
            `${columnLetters[secondFile]}${rowNumbers[secondRank]}`
        ]);
};

const sideOwnsPieceForOriginalGameCapture = (side: Side, piece: Piece): boolean =>
    side === "dragons" ? piece === "dragon" || piece === "gold" : piece === "raven";

const isHostileSquareForOriginalGame = (
    board: Record<string, Piece>,
    square: string,
    capturingSide: Side
): boolean => {
    const piece = board[square];
    if (piece) {
        return sideOwnsPieceForOriginalGameCapture(capturingSide, piece);
    }

    return isCenterSquare(square) || isCornerSquare(square);
};

const isRegularPieceCapturedInOriginalGame = (
    board: Record<string, Piece>,
    square: string,
    capturingSide: Side
): boolean =>
    getOppositePairs(square).some(([first, second]) =>
        isHostileSquareForOriginalGame(board, first, capturingSide) &&
        isHostileSquareForOriginalGame(board, second, capturingSide)
    );

const isGoldCapturedInOriginalGame = (board: Record<string, Piece>, square: string): boolean => {
    const neighbors = getNeighbors(square);
    if (isCenterSquare(square)) {
        return neighbors.every((neighbor) => board[neighbor] === "raven");
    }

    if (neighbors.includes("d4")) {
        return neighbors
            .filter((neighbor) => neighbor !== "d4")
            .every((neighbor) => board[neighbor] === "raven");
    }

    return isRegularPieceCapturedInOriginalGame(board, square, "ravens");
};

const getAutoCapturedSquaresInOriginalGame = (
    board: Record<string, Piece>,
    capturingSide: Side
): string[] =>
    Object.entries(board)
        .filter(([, piece]) => !sideOwnsPiece(capturingSide, piece))
        .filter(([square, piece]) =>
            piece === "gold"
                ? isGoldCapturedInOriginalGame(board, square)
                : isRegularPieceCapturedInOriginalGame(board, square, capturingSide)
        )
        .map(([square]) => square);

const wouldCauseFriendlyCaptureInOriginalGame = (
    snapshot: ServerGameSnapshot,
    origin: string,
    destination: string,
    piece: Piece
): boolean => {
    const movedBoard = { ...snapshot.board };
    delete movedBoard[origin];
    movedBoard[destination] = piece;
    const opposingSide = snapshot.activeSide === "dragons" ? "ravens" : "dragons";

    if (
        piece === "gold"
            ? isGoldCapturedInOriginalGame(movedBoard, destination)
            : isRegularPieceCapturedInOriginalGame(movedBoard, destination, opposingSide)
    ) {
        return true;
    }

    for (const capturedSquare of getAutoCapturedSquaresInOriginalGame(movedBoard, snapshot.activeSide)) {
        delete movedBoard[capturedSquare];
    }

    return Object.entries(movedBoard)
        .filter(([, remainingPiece]) => sideOwnsPiece(snapshot.activeSide, remainingPiece))
        .filter(([square]) => square !== destination)
        .some(([square, remainingPiece]) =>
            remainingPiece === "gold"
                ? isGoldCapturedInOriginalGame(movedBoard, square)
                : isRegularPieceCapturedInOriginalGame(movedBoard, square, opposingSide)
        );
};

const isIllegalOriginalGameDestination = (
    snapshot: ServerGameSnapshot,
    origin: string,
    piece: Piece,
    destination: string
): boolean => {
    if (snapshot.ruleConfigurationId === "sherwood-rules" && piece === "gold" && !isSingleOrthogonalStep(origin, destination)) {
        return true;
    }

    if (isCenterSquare(destination)) {
        return true;
    }

    if (piece !== "gold" && isCornerSquare(destination)) {
        return true;
    }

    return getOppositePairs(destination).some(
        ([first, second]) => isEnemyPiece(snapshot.board[first], piece) && isEnemyPiece(snapshot.board[second], piece)
    ) || wouldCauseFriendlyCaptureInOriginalGame(snapshot, origin, destination, piece);
};

export const getTargetableSquares = (snapshot: ServerGameSnapshot, selectedSquare: string | null): string[] => {
    if (snapshot.phase !== "move" || !selectedSquare) {
        return [];
    }

    const selectedPiece = snapshot.board[selectedSquare];
    if (!selectedPiece) {
        return [];
    }

    return allSquares.filter((square) => {
        if (square in snapshot.board || square === selectedSquare) {
            return false;
        }

        if (!isOriginalStyleRuleConfiguration(snapshot.ruleConfigurationId)) {
            return true;
        }

        const path = getOrthogonalPath(selectedSquare, square);
        if (path === null || path.some((pathSquare) => pathSquare in snapshot.board)) {
            return false;
        }

        return !isIllegalOriginalGameDestination(snapshot, selectedSquare, selectedPiece, square);
    });
};

export const getPieceAtSquare = (snapshot: ServerGameSnapshot, square: string): Piece | undefined => snapshot.board[square];

export const normalizeSelectedSquare = (
    snapshot: ServerGameSnapshot,
    selectedSquare: string | null
): string | null => {
    if (!selectedSquare || snapshot.phase !== "move") {
        return null;
    }

    const piece = getPieceAtSquare(snapshot, selectedSquare);
    return piece && sideOwnsPiece(snapshot.activeSide, piece) ? selectedSquare : null;
};

export const turnToNotation = (turn: TurnRecord): string => {
    if (turn.type === "gameOver") {
        if (turn.outcome === "Game ended") {
            return "Game Over";
        }
        return turn.outcome ? `Game Over: ${turn.outcome}` : "Game Over";
    }

    const captures = (turn.capturedSquares ?? []).map((square) => `x${square}`).join("");
    return `${turn.from}-${turn.to}${captures}`;
};

export const getTurnHistoryRows = (turns: TurnRecord[]): TurnHistoryRow[] =>
    turns.map((turn, index) => ({
        type: turn.type,
        label: turnToNotation(turn),
        key: `${turn.type}-${turn.from ?? "none"}-${turn.to ?? "none"}-${(turn.capturedSquares ?? []).join(".") || "none"}-${turn.outcome ?? "none"}-${index}`
    }));
