import type { GroupedMoveHistoryRow, TurnHistoryRow, TurnRecord } from "./game-types.js";

const gameOverHistoryPrefix = "Game Over";
const drawOutcomePrefix = "Draw by ";

export const getGameOverHistoryLabel = (outcome?: string): string => {
    if (outcome === "Game ended" || outcome == null) {
        return gameOverHistoryPrefix;
    }

    return `${gameOverHistoryPrefix}: ${outcome}`;
};

export const getGameOverStatusText = (outcome?: string): string => {
    if (outcome === "Dragons win" || outcome === "Ravens win") {
        return `${outcome}. Go back to the lobby to create a new game.`;
    }

    if (outcome?.startsWith(drawOutcomePrefix)) {
        return `This game ended in a ${outcome.toLowerCase()}. Go back to the lobby to create a new game.`;
    }

    if (outcome === "Game ended" || outcome == null) {
        return "This game was ended manually. Go back to the lobby to create a new game.";
    }

    return `${outcome}. Go back to the lobby to create a new game.`;
};

export const getLatestGameOverTurn = (turns: TurnRecord[]): TurnRecord | null => {
    const reversedTurns = [...turns].reverse();
    return reversedTurns.find((turn) => turn.type === "gameOver") ?? null;
};

export const turnToNotation = (turn: TurnRecord): string => {
    if (turn.type === "gameOver") {
        return getGameOverHistoryLabel(turn.outcome);
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
