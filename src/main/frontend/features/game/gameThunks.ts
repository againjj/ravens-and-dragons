import type { GameCommandRequest } from "../../game.js";
import { fetchGameSession, sendGameCommandRequest } from "../../game-client.js";
import { normalizeSelectedSquare } from "../../game.js";
import type { AppThunk } from "../../app/store.js";
import { gameActions } from "./gameSlice.js";
import { uiActions } from "../ui/uiSlice.js";

const syncSelectedSquare = (): AppThunk => (dispatch, getState) => {
    const snapshot = getState().game.session?.snapshot;
    if (!snapshot) {
        dispatch(uiActions.selectedSquareSet(null));
        return;
    }

    dispatch(uiActions.selectedSquareSet(normalizeSelectedSquare(snapshot, getState().ui.selectedSquare)));
};

const sendSelectionClearingCommand = (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">
): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(uiActions.selectedSquareSet(null));
    await dispatch(sendCommand(partialCommand));
};

export const loadGame = (): AppThunk<Promise<boolean>> => async (dispatch) => {
    dispatch(gameActions.loadStarted());

    try {
        const session = await fetchGameSession();
        dispatch(gameActions.sessionUpdated(session));
        dispatch(syncSelectedSquare());
        return true;
    } catch {
        dispatch(gameActions.loadFailed());
        return false;
    }
};

export const applyServerSession = (session: import("../../game.js").ServerGameSession): AppThunk => (dispatch) => {
    dispatch(gameActions.sessionUpdated(session));
    dispatch(syncSelectedSquare());
};

export const sendCommand = (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">
): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const currentGame = getState().game.session;
    if (!currentGame || getState().game.isSubmitting) {
        return;
    }

    dispatch(gameActions.commandStarted());

    try {
        const result = await sendGameCommandRequest(currentGame, partialCommand);
        if (result.game) {
            dispatch(applyServerSession(result.game));
            return;
        }

        dispatch(gameActions.feedbackMessageSet(result.errorMessage ?? "Unable to apply that action right now."));
    } finally {
        dispatch(gameActions.commandFinished());
    }
};

const createCommandThunk = (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">,
    options: { clearSelection?: boolean } = {}
): AppThunk<Promise<void>> => async (dispatch) => {
    if (options.clearSelection) {
        await dispatch(sendSelectionClearingCommand(partialCommand));
        return;
    }

    await dispatch(sendCommand(partialCommand));
};

export const startGame = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "start-game" }, { clearSelection: true });

export const endSetup = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "end-setup" }, { clearSelection: true });

export const endGame = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "end-game" }, { clearSelection: true });

export const skipCapture = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "skip-capture" });

export const undoMove = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "undo" }, { clearSelection: true });

export const cycleSetup = (square: string): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "cycle-setup", square });

export const capturePiece = (square: string): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "capture-piece", square });

export const movePiece = (origin: string, destination: string): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "move-piece", origin, destination });
