export type Piece = "dragon" | "raven" | "gold";
export type Side = "dragons" | "ravens";
export type Phase = "none" | "setup" | "move" | "capture";
export type TurnType = "move" | "gameOver";
export type GameLifecycle = "new" | "active" | "finished";
export type AuthType = "guest" | "local" | "oauth";
export type ViewerRole = "anonymous" | "spectator" | "dragons" | "ravens";

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

export interface GroupedMoveHistoryRow {
    key: string;
    leftLabel: string;
    moveNumber: number;
    rightLabel: string | null;
}

export interface TurnRecord {
    type: TurnType;
    from?: string;
    to?: string;
    capturedSquares?: string[];
    outcome?: string;
}

export interface ServerGameSnapshot {
    board: Record<string, Piece>;
    boardSize: number;
    specialSquare: string;
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
    undoOwnerSide?: Side | null;
    availableRuleConfigurations: RuleConfigurationSummary[];
    selectedRuleConfigurationId: string;
    selectedStartingSide: Side;
    selectedBoardSize: number;
    dragonsPlayerUserId?: string | null;
    ravensPlayerUserId?: string | null;
    createdByUserId?: string | null;
}

export interface AuthUserSummary {
    id: string;
    displayName: string;
    authType: AuthType;
}

export interface AuthSessionResponse {
    authenticated: boolean;
    user: AuthUserSummary | null;
    oauthProviders: string[];
}

export interface LocalProfileResponse {
    id: string;
    username: string;
    displayName: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface SignupRequest {
    username: string;
    password: string;
    displayName: string;
    email?: string;
}

export interface UpdateProfileRequest {
    displayName: string;
}

export interface DeleteAccountRequest {
    password: string;
}

export interface GamePlayerSummary {
    id: string;
    displayName: string;
}

export interface GameViewResponse {
    game: ServerGameSession;
    currentUser: AuthUserSummary | null;
    dragonsPlayer: GamePlayerSummary | null;
    ravensPlayer: GamePlayerSummary | null;
    viewerRole: ViewerRole;
}

export interface CreateGameRequest {
    ruleConfigurationId?: string;
    startingSide?: Side;
    boardSize?: number;
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
        | "select-board-size"
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
    boardSize?: number;
}

export interface ClaimSideRequest {
    side: Side;
}

const maxColumnLetters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index));
export const columnLetters = ["a", "b", "c", "d", "e", "f", "g"];
export const rowNumbers = ["7", "6", "5", "4", "3", "2", "1"];
export const boardDimension = columnLetters.length;

export const getColumnLetters = (boardSize: number): string[] => maxColumnLetters.slice(0, boardSize);

export const getRowNumbers = (boardSize: number): string[] =>
    Array.from({ length: boardSize }, (_, index) => String(boardSize - index));

export const getBoardDimension = (snapshot: Pick<ServerGameSnapshot, "boardSize"> | null | undefined): number =>
    snapshot?.boardSize ?? boardDimension;

export const getSquareName = (rowIndex: number, colIndex: number, boardSize: number = boardDimension): string =>
    `${getColumnLetters(boardSize)[colIndex]}${getRowNumbers(boardSize)[rowIndex]}`;

const getRank = (square: string): string => square.slice(1);

const getAllSquares = (boardSize: number): string[] =>
    getRowNumbers(boardSize).flatMap((_, rowIndex) =>
        getColumnLetters(boardSize).map((_, colIndex) => getSquareName(rowIndex, colIndex, boardSize))
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

const getOrthogonalPath = (origin: string, destination: string, boardSize: number): string[] | null => {
    const columns = getColumnLetters(boardSize);
    const rows = getRowNumbers(boardSize);
    const originFile = columns.indexOf(origin[0]);
    const destinationFile = columns.indexOf(destination[0]);
    const originRank = rows.indexOf(getRank(origin));
    const destinationRank = rows.indexOf(getRank(destination));

    if (originFile !== destinationFile && originRank !== destinationRank) {
        return null;
    }

    const fileStep = Math.sign(destinationFile - originFile);
    const rankStep = Math.sign(destinationRank - originRank);
    const path: string[] = [];
    let nextFile = originFile + fileStep;
    let nextRank = originRank + rankStep;

    while (nextFile !== destinationFile || nextRank !== destinationRank) {
        path.push(`${columns[nextFile]}${rows[nextRank]}`);
        nextFile += fileStep;
        nextRank += rankStep;
    }

    return path;
};

const isCenterSquare = (square: string, specialSquare: string): boolean => square === specialSquare;

const isCornerSquare = (square: string, boardSize: number): boolean => {
    const columns = getColumnLetters(boardSize);
    return [
        `${columns[0]}1`,
        `${columns[0]}${boardSize}`,
        `${columns[boardSize - 1]}1`,
        `${columns[boardSize - 1]}${boardSize}`
    ].includes(square);
};

const getVisualCenterSquares = (boardSize: number, specialSquare: string): string[] => {
    if (boardSize % 2 === 1) {
        return [specialSquare];
    }

    const columns = getColumnLetters(boardSize);
    const rows = getRowNumbers(boardSize);
    const lowerFile = (boardSize / 2) - 1;
    const upperFile = boardSize / 2;
    const upperRank = (boardSize / 2) - 1;
    const lowerRank = boardSize / 2;

    return [
        `${columns[lowerFile]}${rows[upperRank]}`,
        `${columns[upperFile]}${rows[upperRank]}`,
        `${columns[lowerFile]}${rows[lowerRank]}`,
        `${columns[upperFile]}${rows[lowerRank]}`
    ];
};

export const isHighlightedBoardSquare = (
    square: string,
    snapshot: Pick<ServerGameSnapshot, "specialSquare" | "boardSize">
): boolean => getVisualCenterSquares(snapshot.boardSize, snapshot.specialSquare).includes(square) || isCornerSquare(square, snapshot.boardSize);

const originalStyleRuleConfigurationIds = new Set(["original-game", "sherwood-rules", "sherwood-x-9"]);
const sherwoodStyleRuleConfigurationIds = new Set(["sherwood-rules", "sherwood-x-9"]);

const isOriginalStyleRuleConfiguration = (ruleConfigurationId: string): boolean =>
    originalStyleRuleConfigurationIds.has(ruleConfigurationId);

const isSingleOrthogonalStep = (origin: string, destination: string, boardSize: number): boolean => {
    const columns = getColumnLetters(boardSize);
    const rows = getRowNumbers(boardSize);
    const fileDistance = Math.abs(columns.indexOf(origin[0]) - columns.indexOf(destination[0]));
    const rankDistance = Math.abs(rows.indexOf(getRank(origin)) - rows.indexOf(getRank(destination)));
    return fileDistance + rankDistance === 1;
};

const getNeighbors = (square: string, boardSize: number): string[] => {
    const columns = getColumnLetters(boardSize);
    const rows = getRowNumbers(boardSize);
    const fileIndex = columns.indexOf(square[0]);
    const rankIndex = rows.indexOf(getRank(square));
    const pairs = [
        [fileIndex, rankIndex - 1],
        [fileIndex + 1, rankIndex],
        [fileIndex, rankIndex + 1],
        [fileIndex - 1, rankIndex]
    ];

    return pairs
        .filter(([file, rank]) => file >= 0 && file < columns.length && rank >= 0 && rank < rows.length)
        .map(([file, rank]) => `${columns[file]}${rows[rank]}`);
};

const isEnemyPiece = (piece: Piece | undefined, movedPiece: Piece): boolean => {
    if (!piece) {
        return false;
    }

    return movedPiece === "raven" ? piece === "dragon" || piece === "gold" : piece === "raven";
};

const getOppositePairs = (square: string, boardSize: number): Array<[string, string]> => {
    const columns = getColumnLetters(boardSize);
    const rows = getRowNumbers(boardSize);
    const fileIndex = columns.indexOf(square[0]);
    const rankIndex = rows.indexOf(getRank(square));
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
            firstFile < columns.length &&
            firstRank >= 0 &&
            firstRank < rows.length &&
            secondFile >= 0 &&
            secondFile < columns.length &&
            secondRank >= 0 &&
            secondRank < rows.length
        )
        .map(([[firstFile, firstRank], [secondFile, secondRank]]) => [
            `${columns[firstFile]}${rows[firstRank]}`,
            `${columns[secondFile]}${rows[secondRank]}`
        ]);
};

const sideOwnsPieceForOriginalGameCapture = (side: Side, piece: Piece): boolean =>
    side === "dragons" ? piece === "dragon" || piece === "gold" : piece === "raven";

const isHostileSquareForOriginalGame = (
    board: Record<string, Piece>,
    square: string,
    capturingSide: Side,
    snapshot: ServerGameSnapshot
): boolean => {
    const piece = board[square];
    if (piece) {
        return sideOwnsPieceForOriginalGameCapture(capturingSide, piece);
    }

    return isCenterSquare(square, snapshot.specialSquare) || isCornerSquare(square, snapshot.boardSize);
};

const isRegularPieceCapturedInOriginalGame = (
    board: Record<string, Piece>,
    square: string,
    capturingSide: Side,
    snapshot: ServerGameSnapshot
): boolean =>
    getOppositePairs(square, snapshot.boardSize).some(([first, second]) =>
        isHostileSquareForOriginalGame(board, first, capturingSide, snapshot) &&
        isHostileSquareForOriginalGame(board, second, capturingSide, snapshot)
    );

const isGoldCapturedInOriginalGame = (
    board: Record<string, Piece>,
    square: string,
    snapshot: ServerGameSnapshot
): boolean => {
    const neighbors = getNeighbors(square, snapshot.boardSize);
    if (isCenterSquare(square, snapshot.specialSquare)) {
        return neighbors.every((neighbor) => board[neighbor] === "raven");
    }

    if (neighbors.includes(snapshot.specialSquare)) {
        return neighbors
            .filter((neighbor) => neighbor !== snapshot.specialSquare)
            .every((neighbor) => board[neighbor] === "raven");
    }

    return isRegularPieceCapturedInOriginalGame(board, square, "ravens", snapshot);
};

const getAutoCapturedSquaresInOriginalGame = (
    board: Record<string, Piece>,
    capturingSide: Side,
    snapshot: ServerGameSnapshot
): string[] =>
    Object.entries(board)
        .filter(([, piece]) => !sideOwnsPiece(capturingSide, piece))
        .filter(([square, piece]) =>
            piece === "gold"
                ? isGoldCapturedInOriginalGame(board, square, snapshot)
                : isRegularPieceCapturedInOriginalGame(board, square, capturingSide, snapshot)
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
            ? isGoldCapturedInOriginalGame(movedBoard, destination, snapshot)
            : isRegularPieceCapturedInOriginalGame(movedBoard, destination, opposingSide, snapshot)
    ) {
        return true;
    }

    for (const capturedSquare of getAutoCapturedSquaresInOriginalGame(movedBoard, snapshot.activeSide, snapshot)) {
        delete movedBoard[capturedSquare];
    }

    return Object.entries(movedBoard)
        .filter(([, remainingPiece]) => sideOwnsPiece(snapshot.activeSide, remainingPiece))
        .filter(([square]) => square !== destination)
        .some(([square, remainingPiece]) =>
            remainingPiece === "gold"
                ? isGoldCapturedInOriginalGame(movedBoard, square, snapshot)
                : isRegularPieceCapturedInOriginalGame(movedBoard, square, opposingSide, snapshot)
        );
};

const isIllegalOriginalGameDestination = (
    snapshot: ServerGameSnapshot,
    origin: string,
    piece: Piece,
    destination: string
): boolean => {
    if (sherwoodStyleRuleConfigurationIds.has(snapshot.ruleConfigurationId) && piece === "gold" && !isSingleOrthogonalStep(origin, destination, snapshot.boardSize)) {
        return true;
    }

    if (isCenterSquare(destination, snapshot.specialSquare)) {
        return true;
    }

    if (piece !== "gold" && isCornerSquare(destination, snapshot.boardSize)) {
        return true;
    }

    return getOppositePairs(destination, snapshot.boardSize).some(
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

    return getAllSquares(snapshot.boardSize).filter((square) => {
        if (square in snapshot.board || square === selectedSquare) {
            return false;
        }

        if (!isOriginalStyleRuleConfiguration(snapshot.ruleConfigurationId)) {
            return true;
        }

        const path = getOrthogonalPath(selectedSquare, square, snapshot.boardSize);
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

export const getGroupedMoveHistoryRows = (turnHistoryRows: TurnHistoryRow[]): GroupedMoveHistoryRow[] => {
    const moveRows = turnHistoryRows.filter((row): row is Extract<TurnHistoryRow, { type: "move" }> => row.type === "move");
    const groupedRows: GroupedMoveHistoryRow[] = [];

    for (let index = 0; index < moveRows.length; index += 2) {
        const leftMove = moveRows[index];
        const rightMove = moveRows[index + 1];

        groupedRows.push({
            key: rightMove ? `${leftMove.key}-${rightMove.key}` : leftMove.key,
            leftLabel: leftMove.label,
            moveNumber: (index / 2) + 1,
            rightLabel: rightMove?.label ?? null
        });
    }

    return groupedRows;
};
