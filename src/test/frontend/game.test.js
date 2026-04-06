import assert from "node:assert/strict";
import test from "node:test";

import {
    getCapturableSquares,
    getPieceAtSquare,
    getTargetableSquares,
    normalizeSelectedSquare,
    moveToNotation
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
    turns: []
};

test("capturable squares come from the shared server snapshot", () => {
    assert.deepEqual(getCapturableSquares(snapshot), ["b2"]);
});

test("targetable squares are all empty squares except the selected one during move phase", () => {
    const targetableSquares = getTargetableSquares(snapshot, "a1");

    assert.equal(targetableSquares.includes("a1"), false);
    assert.equal(targetableSquares.includes("b2"), false);
    assert.equal(targetableSquares.includes("c3"), true);
    assert.equal(targetableSquares.length, 78);
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

test("move notation includes captures only when present", () => {
    assert.equal(moveToNotation({ from: "a1", to: "a2" }), "a1-a2");
    assert.equal(moveToNotation({ from: "a1", to: "a2", captured: "b2" }), "a1-a2xb2");
});
