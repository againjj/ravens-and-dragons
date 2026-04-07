export type Piece = "dragon" | "raven" | "gold";
export type Side = "dragons" | "ravens";
export type Phase = "setup" | "move" | "capture";

export interface MoveRecord {
    from: string;
    to: string;
    captured?: string;
}

export interface ServerGameSnapshot {
    board: Record<string, Piece>;
    phase: Phase;
    activeSide: Side;
    pendingMove: MoveRecord | null;
    turns: MoveRecord[];
}

export interface ServerGameSession {
    id: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    snapshot: ServerGameSnapshot;
    canUndo: boolean;
}

export interface GameCommandRequest {
    expectedVersion: number;
    type: "cycle-setup" | "begin-game" | "move-piece" | "capture-piece" | "skip-capture" | "undo" | "reset-game";
    square?: string;
    origin?: string;
    destination?: string;
}

export const rowLetters = ["i", "h", "g", "f", "e", "d", "c", "b", "a"];

export const getSquareName = (rowIndex: number, colIndex: number): string => `${rowLetters[rowIndex]}${colIndex + 1}`;

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

export const getTargetableSquares = (snapshot: ServerGameSnapshot, selectedSquare: string | null): string[] => {
    if (snapshot.phase !== "move" || !selectedSquare) {
        return [];
    }

    const targetableSquares: string[] = [];
    for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
        for (let colIndex = 0; colIndex < 9; colIndex += 1) {
            const square = getSquareName(rowIndex, colIndex);
            if (!(square in snapshot.board) && square !== selectedSquare) {
                targetableSquares.push(square);
            }
        }
    }
    return targetableSquares;
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

export const moveToNotation = (move: MoveRecord): string =>
    `${move.from}-${move.to}${move.captured ? `x${move.captured}` : ""}`;
