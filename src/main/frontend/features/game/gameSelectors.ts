import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "../../app/store.js";
import { getCapturableSquares, getTargetableSquares, normalizeSelectedSquare } from "../../game-rules-client.js";
import type { BotSummary, RuleConfigurationSummary, Side } from "../../game-types.js";
import { getGameOverStatusText, getLatestGameOverTurn } from "../../move-history.js";
import { selectCurrentUser, selectIsAuthenticated } from "../auth/authSelectors.js";

const emptyRuleConfigurations: RuleConfigurationSummary[] = [];
const emptyBots: BotSummary[] = [];
const emptySquares: string[] = [];

export const selectGameState = (state: RootState) => state.game;
export const selectGameView = (state: RootState) => state.game.view;
export const selectCurrentGameId = (state: RootState) => state.game.currentGameId;
export const selectSnapshot = (state: RootState) => state.game.session?.snapshot ?? null;
export const selectLifecycle = (state: RootState) => state.game.session?.lifecycle ?? null;
export const selectViewerRole = (state: RootState) => state.game.viewerRole ?? "anonymous";
export const selectDragonsPlayer = (state: RootState) => state.game.dragonsPlayer;
export const selectRavensPlayer = (state: RootState) => state.game.ravensPlayer;
export const selectDragonsBot = (state: RootState) => state.game.dragonsBot;
export const selectRavensBot = (state: RootState) => state.game.ravensBot;
export const selectAvailableBots = (state: RootState) => state.game.availableBots ?? emptyBots;
const selectDragonsPlayerUserId = (state: RootState) => state.game.session?.dragonsPlayerUserId ?? null;
const selectRavensPlayerUserId = (state: RootState) => state.game.session?.ravensPlayerUserId ?? null;
const selectDragonsBotId = (state: RootState) => state.game.session?.dragonsBotId ?? null;
const selectRavensBotId = (state: RootState) => state.game.session?.ravensBotId ?? null;
export const selectCanUndo = (state: RootState) => state.game.session?.canUndo ?? false;
export const selectUndoOwnerSide = (state: RootState) => state.game.session?.undoOwnerSide ?? null;
export const selectSelectedSquare = (state: RootState) => state.ui.selectedSquare;
export const selectIsSubmitting = (state: RootState) => state.game.isSubmitting;
export const selectIsLoadingGame = (state: RootState) => state.game.loadState === "loading";
export const selectFeedbackMessage = (state: RootState) => state.game.feedbackMessage;
const selectAvailableRuleConfigurations = (state: RootState) =>
    state.game.session?.availableRuleConfigurations ?? emptyRuleConfigurations;
const selectSelectedRuleConfigurationId = (state: RootState) =>
    state.game.session?.selectedRuleConfigurationId ?? null;
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

const selectCurrentUserOwnsBothSeats = createSelector(
    selectCurrentUser,
    selectDragonsPlayer,
    selectRavensPlayer,
    (currentUser, dragonsPlayer, ravensPlayer) =>
        !!currentUser &&
        dragonsPlayer?.id === currentUser.id &&
        ravensPlayer?.id === currentUser.id
);

export const selectHasBotSeat = createSelector(
    selectSnapshot,
    (state: RootState) => state.game.session?.dragonsBotId ?? null,
    (state: RootState) => state.game.session?.ravensBotId ?? null,
    (snapshot, dragonsBotId, ravensBotId) => !!snapshot && (dragonsBotId != null || ravensBotId != null)
);

export const selectCanViewerAct = createSelector(
    selectSnapshot,
    selectViewerRole,
    selectViewerOwnsASeat,
    selectCurrentUserOwnsBothSeats,
    (snapshot, viewerRole, viewerOwnsASeat, currentUserOwnsBothSeats) => {
        if (!snapshot || !viewerOwnsASeat) {
            return false;
        }

        if (snapshot.phase === "none") {
            return true;
        }

        if (currentUserOwnsBothSeats) {
            return true;
        }

        return viewerRole === snapshot.activeSide;
    }
);

export const selectCanViewerUndo = createSelector(
    selectCanUndo,
    selectUndoOwnerSide,
    selectViewerRole,
    selectCurrentUserOwnsBothSeats,
    (canUndo, undoOwnerSide, viewerRole, currentUserOwnsBothSeats) =>
        canUndo &&
        (currentUserOwnsBothSeats || (undoOwnerSide != null && viewerRole === undoOwnerSide))
);

export const selectCanClaimDragons = createSelector(
    selectIsAuthenticated,
    selectCurrentUser,
    selectDragonsPlayer,
    selectDragonsBotId,
    (isAuthenticated, currentUser, dragonsPlayer, dragonsBotId) =>
        isAuthenticated &&
        !!currentUser &&
        dragonsPlayer == null &&
        dragonsBotId == null
);

export const selectCanClaimRavens = createSelector(
    selectIsAuthenticated,
    selectCurrentUser,
    selectRavensPlayer,
    selectRavensBotId,
    (isAuthenticated, currentUser, ravensPlayer, ravensBotId) =>
        isAuthenticated &&
        !!currentUser &&
        ravensPlayer == null &&
        ravensBotId == null
);

export const selectIsBotAssignmentSupported = createSelector(
    selectSelectedRuleConfigurationId,
    selectAvailableBots,
    (selectedRuleConfigurationId, availableBots) =>
        selectedRuleConfigurationId != null && availableBots.length > 0
);

export const selectBotAssignmentTargetSide = createSelector(
    selectCurrentUser,
    selectDragonsPlayerUserId,
    selectRavensPlayerUserId,
    (currentUser, dragonsPlayerUserId, ravensPlayerUserId): Side | null => {
        if (!currentUser) {
            return null;
        }
        if (dragonsPlayerUserId === currentUser.id && ravensPlayerUserId == null) {
            return "ravens";
        }
        if (ravensPlayerUserId === currentUser.id && dragonsPlayerUserId == null) {
            return "dragons";
        }
        return null;
    }
);

export const selectIsFinishedGame = createSelector(
    selectSnapshot,
    selectLifecycle,
    (snapshot, lifecycle) => snapshot?.phase === "none" && lifecycle === "finished"
);

export const selectCanAssignBotOpponent = createSelector(
    selectIsAuthenticated,
    selectCurrentUserOwnsBothSeats,
    selectIsFinishedGame,
    selectSnapshot,
    selectDragonsBot,
    selectRavensBot,
    selectIsBotAssignmentSupported,
    selectBotAssignmentTargetSide,
    (
        isAuthenticated,
        currentUserOwnsBothSeats,
        isFinishedGame,
        snapshot,
        dragonsBot,
        ravensBot,
        isBotAssignmentSupported,
        botAssignmentTargetSide
    ) =>
        isAuthenticated &&
        !currentUserOwnsBothSeats &&
        !isFinishedGame &&
        snapshot != null &&
        snapshot.turns.length === 0 &&
        dragonsBot == null &&
        ravensBot == null &&
        isBotAssignmentSupported &&
        botAssignmentTargetSide != null
);

export const selectCapturableSquares = createSelector(selectSnapshot, (snapshot) =>
    snapshot && snapshot.phase === "capture" ? getCapturableSquares(snapshot) : emptySquares
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

        if (snapshot.phase === "none") {
            if (isFinishedGame) {
                const gameOverTurn = getLatestGameOverTurn(snapshot.turns);
                return gameOverTurn ? getGameOverStatusText(gameOverTurn.outcome) : "This game is finished. Go back to the lobby to create a new game.";
            }

            return viewerOwnsASeat
                ? "No game in progress. Select a play style and start the game."
                : "No game in progress. Claim a side or wait for someone else to start the game.";
        }

        if (snapshot.phase === "capture") {
            return `${snapshot.activeSide === "dragons" ? "Dragons" : "Ravens"} moved. Capture a piece, or skip the capture.`;
        }

        const moverLabel = snapshot.activeSide === "dragons" ? "Dragons" : "Ravens";
        return `${moverLabel} to move.`;
    }
);
