import { createSelector } from "@reduxjs/toolkit";

import { getCapturableSquares, getTargetableSquares, normalizeSelectedSquare } from "../../game.js";
import type { RootState } from "../../app/store.js";

export const selectGameState = (state: RootState) => state.game;
export const selectSnapshot = (state: RootState) => state.game.session?.snapshot ?? null;
export const selectCanUndo = (state: RootState) => state.game.session?.canUndo ?? false;
export const selectSelectedSquare = (state: RootState) => state.ui.selectedSquare;
export const selectIsSubmitting = (state: RootState) => state.game.isSubmitting;

export const selectCapturableSquares = createSelector(selectSnapshot, (snapshot) =>
    snapshot ? getCapturableSquares(snapshot) : []
);

export const selectTargetableSquares = createSelector(
    selectSnapshot,
    selectSelectedSquare,
    (snapshot, selectedSquare) => (snapshot ? getTargetableSquares(snapshot, selectedSquare) : [])
);

export const selectStatusText = createSelector(selectGameState, selectSnapshot, (gameState, snapshot) => {
    if (gameState.feedbackMessage) {
        return gameState.feedbackMessage;
    }

    if (!snapshot) {
        if (gameState.loadState === "error") {
            return "Unable to load shared game.";
        }

        return gameState.connectionState === "reconnecting"
            ? "Connection lost. Trying to reconnect..."
            : "Loading shared game...";
    }

    if (snapshot.phase === "setup") {
        return "Setup phase: place the pieces on the board.";
    }

    if (snapshot.phase === "none") {
        return snapshot.turns.length > 0
            ? "Game over. Start a new game when you're ready."
            : "No game in progress. Start a game to enter setup.";
    }

    if (snapshot.phase === "capture") {
        return `${snapshot.activeSide === "dragons" ? "Dragons" : "Ravens"} moved. Capture a piece, or skip the capture.`;
    }

    const moverLabel = snapshot.activeSide === "dragons" ? "Dragons" : "Ravens";
    return `${moverLabel} to move.`;
});
