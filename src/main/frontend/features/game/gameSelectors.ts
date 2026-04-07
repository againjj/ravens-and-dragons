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
        return "Setup phase: click a square to place dragon, raven, or empty. Gold stays at e5.";
    }

    if (snapshot.phase === "capture") {
        const opposingLabel = snapshot.activeSide === "dragons" ? "raven" : "dragon or gold";
        return `${snapshot.activeSide === "dragons" ? "Dragons" : "Ravens"} moved. Capture one ${opposingLabel}, or skip the capture.`;
    }

    const moverLabel = snapshot.activeSide === "dragons" ? "Dragons" : "Ravens";
    const extra = snapshot.activeSide === "dragons" ? " Dragons may also move the gold." : "";
    return `${moverLabel} to move.${extra}`;
});
