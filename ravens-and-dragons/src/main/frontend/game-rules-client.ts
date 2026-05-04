import { getColumnLetters, getRowNumbers, getSquareName } from "./board-geometry.js";
import type { Piece, ServerGameSnapshot, Side } from "./game-types.js";

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

const originalStyleRuleConfigurationIds = new Set([
    "original-game",
    "sherwood-rules",
    "square-one",
    "sherwood-x-9",
    "square-one-x-9"
]);
const sherwoodStyleRuleConfigurationIds = new Set([
    "sherwood-rules",
    "square-one",
    "sherwood-x-9",
    "square-one-x-9"
]);

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
