import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "../../app/store.js";
import { getCapturableSquares, getTargetableSquares, normalizeSelectedSquare } from "../../game-rules-client.js";
import type { RuleConfigurationSummary } from "../../game-types.js";
import { selectCurrentUser, selectIsAuthenticated } from "../auth/authSelectors.js";

const emptyRuleConfigurations: RuleConfigurationSummary[] = [];
const emptySquares: string[] = [];

export const selectGameState = (state: RootState) => state.game;
export const selectGameView = (state: RootState) => state.game.view;
export const selectCurrentGameId = (state: RootState) => state.game.currentGameId;
export const selectSnapshot = (state: RootState) => state.game.session?.snapshot ?? null;
export const selectLifecycle = (state: RootState) => state.game.session?.lifecycle ?? null;
export const selectViewerRole = (state: RootState) => state.game.viewerRole ?? "anonymous";
export const selectDragonsPlayer = (state: RootState) => state.game.dragonsPlayer;
export const selectRavensPlayer = (state: RootState) => state.game.ravensPlayer;
export const selectCanUndo = (state: RootState) => state.game.session?.canUndo ?? false;
export const selectUndoOwnerSide = (state: RootState) => state.game.session?.undoOwnerSide ?? null;
export const selectSelectedSquare = (state: RootState) => state.ui.selectedSquare;
export const selectIsSubmitting = (state: RootState) => state.game.isSubmitting;
export const selectIsLoadingGame = (state: RootState) => state.game.loadState === "loading";
export const selectFeedbackMessage = (state: RootState) => state.game.feedbackMessage;
export const selectAvailableRuleConfigurations = (state: RootState) =>
    state.game.session?.availableRuleConfigurations ?? emptyRuleConfigurations;
export const selectSelectedRuleConfigurationId = (state: RootState) =>
    state.game.session?.selectedRuleConfigurationId ?? null;
export const selectSelectedStartingSide = (state: RootState) =>
    state.game.session?.selectedStartingSide ?? "dragons";
export const selectSelectedBoardSize = (state: RootState) =>
    state.game.session?.selectedBoardSize ?? 7;
export const selectCurrentRuleConfiguration = createSelector(
    selectAvailableRuleConfigurations,
    selectSelectedRuleConfigurationId,
    (ruleConfigurations, selectedRuleConfigurationId) =>
        ruleConfigurations.find((ruleConfiguration) => ruleConfiguration.id === selectedRuleConfigurationId) ?? null
);

export const selectViewerOwnsASeat = createSelector(
    selectViewerRole,
    (viewerRole) => viewerRole === "dragons" || viewerRole === "ravens"
);

export const selectCanViewerAct = createSelector(
    selectSnapshot,
    selectViewerRole,
    selectViewerOwnsASeat,
    (snapshot, viewerRole, viewerOwnsASeat) => {
        if (!snapshot || !viewerOwnsASeat) {
            return false;
        }

        if (snapshot.phase === "none") {
            return true;
        }

        return viewerRole === snapshot.activeSide;
    }
);

export const selectCanViewerUndo = createSelector(
    selectCanUndo,
    selectUndoOwnerSide,
    selectViewerRole,
    (canUndo, undoOwnerSide, viewerRole) =>
        canUndo &&
        undoOwnerSide != null &&
        viewerRole === undoOwnerSide
);

export const selectCanClaimDragons = createSelector(
    selectIsAuthenticated,
    selectCurrentUser,
    selectDragonsPlayer,
    selectRavensPlayer,
    (isAuthenticated, currentUser, dragonsPlayer, ravensPlayer) =>
        isAuthenticated &&
        !!currentUser &&
        dragonsPlayer == null &&
        ravensPlayer?.id !== currentUser.id
);

export const selectCanClaimRavens = createSelector(
    selectIsAuthenticated,
    selectCurrentUser,
    selectDragonsPlayer,
    selectRavensPlayer,
    (isAuthenticated, currentUser, dragonsPlayer, ravensPlayer) =>
        isAuthenticated &&
        !!currentUser &&
        ravensPlayer == null &&
        dragonsPlayer?.id !== currentUser.id
);

export const selectCapturableSquares = createSelector(selectSnapshot, (snapshot) =>
    snapshot && snapshot.phase === "capture" ? getCapturableSquares(snapshot) : emptySquares
);

export const selectIsFinishedGame = createSelector(
    selectSnapshot,
    selectLifecycle,
    (snapshot, lifecycle) => snapshot?.phase === "none" && lifecycle === "finished"
);

export const selectShowPreGameControls = createSelector(
    selectSnapshot,
    selectLifecycle,
    (snapshot, lifecycle) => snapshot?.phase === "none" && lifecycle === "new"
);

export const selectShowOwnedPreGameControls = createSelector(
    selectShowPreGameControls,
    selectViewerOwnsASeat,
    (showPreGameControls, viewerOwnsASeat) => showPreGameControls && viewerOwnsASeat
);

export const selectTargetableSquares = createSelector(
    selectSnapshot,
    selectSelectedSquare,
    (snapshot, selectedSquare) => {
        if (!snapshot) {
            return emptySquares;
        }

        return getTargetableSquares(snapshot, normalizeSelectedSquare(snapshot, selectedSquare));
    }
);

export const selectStatusText = createSelector(
    selectGameState,
    selectSnapshot,
    selectIsFinishedGame,
    selectViewerOwnsASeat,
    (gameState, snapshot, isFinishedGame, viewerOwnsASeat) => {
    if (gameState.feedbackMessage) {
        return gameState.feedbackMessage;
    }

    if (!snapshot) {
        if (gameState.loadState === "error") {
            return "Unable to load game.";
        }

        return gameState.connectionState === "reconnecting"
            ? "Connection lost. Trying to reconnect..."
            : "Loading game...";
    }

    if (snapshot.phase === "setup") {
        return "Setup phase: place the pieces on the board.";
    }

    if (snapshot.phase === "none") {
        return isFinishedGame
            ? "This game is finished. Go back to the lobby to create a new game."
            : viewerOwnsASeat
                ? "No game in progress. Select a play style and start the game."
                : "No game in progress. Claim a side or wait for someone else to start the game.";
    }

    if (snapshot.phase === "capture") {
        return `${snapshot.activeSide === "dragons" ? "Dragons" : "Ravens"} moved. Capture a piece, or skip the capture.`;
    }

    const moverLabel = snapshot.activeSide === "dragons" ? "Dragons" : "Ravens";
    return `${moverLabel} to move.`;
});
