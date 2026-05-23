import assert from "node:assert/strict";
import test from "node:test";

import {
    boardDimension,
    columnLetters,
    getBoardDimension,
    getColumnLetters,
    getRowNumbers,
    getSquareName,
    rowNumbers
} from "../../../build/generated/frontend-test/board-geometry.js";
import { getCapturableSquares, getPieceAtSquare, getTargetableSquares, normalizeSelectedSquare } from "../../../build/generated/frontend-test/game-rules-client.js";
import {
    getGameOverHistoryLabel,
    getGameOverStatusText,
    getGroupedMoveHistoryRows,
    getTurnHistoryRows,
    turnToNotation
} from "../../../build/generated/frontend-test/move-history.js";

const snapshot = {
    board: {
        e5: "gold",
        a1: "dragon",
        b2: "raven"
    },
    boardSize: 7,
    specialSquare: "d4",
    phase: "move",
    activeSide: "dragons",
    pendingMove: null,
    turns: [],
    ruleConfigurationId: "free-play",
    positionKeys: []
};

test("capturable squares come from the shared server snapshot", () => {
    assert.deepEqual(getCapturableSquares(snapshot), ["b2"]);
});

test("targetable squares are all empty squares except the selected one during move phase", () => {
    const targetableSquares = getTargetableSquares(snapshot, "a1");

    assert.equal(targetableSquares.includes("a1"), false);
    assert.equal(targetableSquares.includes("b2"), false);
    assert.equal(targetableSquares.includes("c3"), true);
    assert.equal(targetableSquares.length, (boardDimension * boardDimension) - Object.keys(snapshot.board).length);
});

test("square names follow column letters and row numbers in letter-number order", () => {
    assert.equal(boardDimension, 7);
    assert.deepEqual(columnLetters, ["a", "b", "c", "d", "e", "f", "g"]);
    assert.deepEqual(rowNumbers, ["7", "6", "5", "4", "3", "2", "1"]);
    assert.equal(getSquareName(0, 0), "a7");
    assert.equal(getSquareName(3, 3), "d4");
    assert.equal(getSquareName(6, 0), "a1");
    assert.equal(getSquareName(6, 6), "g1");
});

test("board helpers support larger board dimensions", () => {
    assert.equal(getBoardDimension({ boardSize: 9 }), 9);
    assert.deepEqual(getColumnLetters(9), ["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    assert.deepEqual(getRowNumbers(9), ["9", "8", "7", "6", "5", "4", "3", "2", "1"]);
    assert.equal(getSquareName(0, 4, 9), "e9");
    assert.equal(getSquareName(4, 4, 9), "e5");
});

test("selected square stays local only when it remains valid for the shared snapshot", () => {
    assert.equal(normalizeSelectedSquare(snapshot, "a1"), "a1");
    assert.equal(normalizeSelectedSquare(snapshot, "b2"), null);
    assert.equal(normalizeSelectedSquare({ ...snapshot, phase: "capture" }, "a1"), null);
});

test("pieces are read from the server snapshot board object", () => {
    assert.equal(getPieceAtSquare(snapshot, "a1"), "dragon");
    assert.equal(getPieceAtSquare(snapshot, "c3"), undefined);
});

test("turn notation includes captures only when present and supports game over", () => {
    assert.equal(turnToNotation({ type: "move", from: "a1", to: "a2" }), "a1-a2");
    assert.equal(turnToNotation({ type: "move", from: "a1", to: "a2", capturedSquares: ["b2"] }), "a1-a2xb2");
    assert.equal(turnToNotation({ type: "gameOver" }), "Game Over");
    assert.equal(turnToNotation({ type: "gameOver", outcome: "Game ended" }), "Game Over");
    assert.equal(getGameOverHistoryLabel("Dragons win"), "Game Over: Dragons win");
    assert.equal(getGameOverHistoryLabel("Draw by repetition"), "Game Over: Draw by repetition");
    assert.equal(getGameOverStatusText("Dragons win"), "Dragons win. Go back to the lobby to create a new game.");
    assert.equal(
        getGameOverStatusText("Draw by no legal move"),
        "This game ended in a draw by no legal move. Go back to the lobby to create a new game."
    );
    assert.equal(
        getGameOverStatusText("Game ended"),
        "This game was ended manually. Go back to the lobby to create a new game."
    );
});

test("turn history rows provide render-ready labels for moves and game over", () => {
    assert.deepEqual(
        getTurnHistoryRows([
            { type: "move", from: "a1", to: "a2" },
            { type: "gameOver" }
        ]),
        [
            {
                type: "move",
                label: "a1-a2",
                key: "move-a1-a2-none-none-0"
            },
            {
                type: "gameOver",
                label: "Game Over",
                key: "gameOver-none-none-none-none-1"
            }
        ]
    );
});

test("move history rows group two moves under one visible turn number", () => {
    assert.deepEqual(
        getGroupedMoveHistoryRows(
            getTurnHistoryRows([
                { type: "move", from: "h5", to: "h7" },
                { type: "move", from: "f5", to: "f2" },
                { type: "move", from: "e3", to: "f3" },
                { type: "move", from: "e4", to: "e3" },
                { type: "move", from: "c5", to: "c3" }
            ])
        ),
        [
            {
                key: "move-h5-h7-none-none-0-move-f5-f2-none-none-1",
                leftLabel: "h5-h7",
                moveNumber: 1,
                rightLabel: "f5-f2"
            },
            {
                key: "move-e3-f3-none-none-2-move-e4-e3-none-none-3",
                leftLabel: "e3-f3",
                moveNumber: 2,
                rightLabel: "e4-e3"
            },
            {
                key: "move-c5-c3-none-none-4",
                leftLabel: "c5-c3",
                moveNumber: 3,
                rightLabel: null
            }
        ]
    );
});
