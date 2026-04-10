import assert from "node:assert/strict";
import test from "node:test";

import {
    boardDimension,
    columnLetters,
    getCapturableSquares,
    getPieceAtSquare,
    getTargetableSquares,
    getSquareName,
    getTurnHistoryRows,
    normalizeSelectedSquare,
    rowNumbers,
    turnToNotation
} from "../../../build/generated/frontend/game.js";

const snapshot = {
    board: {
        e5: "gold",
        a1: "dragon",
        b2: "raven"
    },
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
