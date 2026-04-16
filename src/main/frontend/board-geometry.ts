import type { ServerGameSnapshot } from "./game-types.js";

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
