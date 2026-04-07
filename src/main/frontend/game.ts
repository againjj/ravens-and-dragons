export type Piece = "dragon" | "raven" | "gold";
export type Side = "dragons" | "ravens";
export type Phase = "none" | "setup" | "move" | "capture";
export type TurnType = "move" | "gameOver";
export type TurnHistoryRow =
    | { type: "move"; label: string; key: string }
    | { type: "gameOver"; label: string; key: string };

export interface TurnRecord {
    type: TurnType;
    from?: string;
    to?: string;
    captured?: string;
}

export interface ServerGameSnapshot {
    board: Record<string, Piece>;
    phase: Phase;
    activeSide: Side;
    pendingMove: TurnRecord | null;
    turns: TurnRecord[];
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
    type: "start-game" | "cycle-setup" | "end-setup" | "move-piece" | "capture-piece" | "skip-capture" | "undo" | "end-game";
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

export const turnToNotation = (turn: TurnRecord): string => {
    if (turn.type === "gameOver") {
        return "Game Over";
    }

    return `${turn.from}-${turn.to}${turn.captured ? `x${turn.captured}` : ""}`;
};

export const getTurnHistoryRows = (turns: TurnRecord[]): TurnHistoryRow[] =>
    turns.map((turn, index) => ({
        type: turn.type,
        label: turnToNotation(turn),
        key: `${turn.type}-${turn.from ?? "none"}-${turn.to ?? "none"}-${turn.captured ?? "none"}-${index}`
    }));
