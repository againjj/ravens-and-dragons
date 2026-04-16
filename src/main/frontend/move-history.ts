import type { GroupedMoveHistoryRow, TurnHistoryRow, TurnRecord } from "./game-types.js";

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
