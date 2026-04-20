import { assignBotOpponent as assignBotOpponentRequest, claimGameSide, createGameSession, fetchGameView, sendGameCommandRequest } from "../../game-client.js";
import type { AppThunk, RootState } from "../../app/store.js";
import { normalizeSelectedSquare } from "../../game-rules-client.js";
import type { GameCommandRequest, GameViewResponse, ServerGameSession, Side } from "../../game-types.js";
import { buildCreateGameRequest } from "./createGameState.js";
import { gameActions } from "./gameSlice.js";
import { uiActions } from "../ui/uiSlice.js";
import { authActions } from "../auth/authSlice.js";

const serverUnavailableMessage = "The server is down. Please wait and try again later.";

const resetSessionScopedUiState = (): AppThunk => (dispatch) => {
    dispatch(uiActions.selectedSquareSet(null));
};

const isServerUnavailableError = (error: unknown): boolean =>
    error instanceof TypeError ||
    (
        error instanceof Error &&
        /failed to fetch|networkerror|network request failed|load failed/i.test(error.message)
    );

const getUserActionErrorMessage = (error: unknown, fallbackMessage: string): string =>
    isServerUnavailableError(error) ? serverUnavailableMessage : fallbackMessage;

const getCreateGameErrorMessage = (error: unknown): string =>
    isServerUnavailableError(error)
        ? serverUnavailableMessage
        : error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Unable to create a new game right now.";

const getOauthProviders = (getState: () => RootState): string[] => getState().auth.session.oauthProviders;

const applyFetchedGameView = (view: GameViewResponse): AppThunk => (dispatch, getState) => {
    dispatch(gameActions.gameViewUpdated(view));
    dispatch(
        authActions.authSessionSet({
            authenticated: view.currentUser != null,
            user: view.currentUser,
            oauthProviders: getOauthProviders(getState)
        })
    );
    dispatch(syncSelectedSquare());
};

const loadAndApplyGameView = (gameId: string): AppThunk<Promise<void>> => async (dispatch) => {
    const view = await fetchGameView(gameId);
    dispatch(applyFetchedGameView(view));
};

const loadGameViewForUserAction = (
    gameId: string,
    fallbackMessage: string
): AppThunk<Promise<boolean>> => async (dispatch) => {
    try {
        await dispatch(loadAndApplyGameView(gameId));
        return true;
    } catch (error) {
        dispatch(gameActions.loadFailed());
        dispatch(gameActions.feedbackMessageSet(getUserActionErrorMessage(error, fallbackMessage)));
        return false;
    }
};

const handleCommandAuthFailure = (status?: number): AppThunk<Promise<void>> => async (dispatch, getState) => {
    if (status === 401) {
        dispatch(
            authActions.authSessionSet({
                authenticated: false,
                user: null,
                oauthProviders: getOauthProviders(getState)
            })
        );
    }

    if (status === 401 || status === 403) {
        await dispatch(refreshCurrentGameView());
    }
};

const syncSelectedSquare = (): AppThunk => (dispatch, getState) => {
    const snapshot = getState().game.session?.snapshot;
    if (!snapshot) {
        dispatch(resetSessionScopedUiState());
        return;
    }

    dispatch(uiActions.selectedSquareSet(normalizeSelectedSquare(snapshot, getState().ui.selectedSquare)));
};

const sendSelectionClearingCommand = (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">
): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(resetSessionScopedUiState());
    await dispatch(sendCommand(partialCommand));
};

const runSeatManagementRequest = (
    runRequest: () => Promise<{ data?: ServerGameSession; errorMessage?: string; status?: number }>,
    fallbackMessage: string
): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const gameId = getState().game.currentGameId;
    if (!gameId || getState().game.isSubmitting) {
        return;
    }

    dispatch(gameActions.commandStarted());
    try {
        const result = await runRequest();
        if (result.data) {
            dispatch(applyServerSession(result.data));
            await dispatch(refreshCurrentGameView());
            return;
        }

        dispatch(gameActions.feedbackMessageSet(result.errorMessage ?? fallbackMessage));
        await dispatch(handleCommandAuthFailure(result.status));
    } catch (error) {
        dispatch(gameActions.feedbackMessageSet(getUserActionErrorMessage(error, fallbackMessage)));
    } finally {
        dispatch(gameActions.commandFinished());
    }
};

export const createGame = (): AppThunk<Promise<string | null>> => async (dispatch, getState) => {
    dispatch(gameActions.commandStarted());

    try {
        const session = await createGameSession(buildCreateGameRequest(getState().createGame));
        dispatch(gameActions.sessionUpdated(session));
        return session.id;
    } catch (error) {
        dispatch(gameActions.feedbackMessageSet(getCreateGameErrorMessage(error)));
        return null;
    } finally {
        dispatch(gameActions.commandFinished());
    }
};

export const openGame = (gameId: string): AppThunk<Promise<boolean>> => async (dispatch) => {
    const trimmedGameId = gameId.trim();
    if (!trimmedGameId) {
        dispatch(gameActions.feedbackMessageSet("Enter a game ID to open a game."));
        return false;
    }

    dispatch(resetSessionScopedUiState());
    dispatch(gameActions.gameLoadRequested(trimmedGameId));

    return dispatch(loadGameViewForUserAction(trimmedGameId, `Unable to open game "${trimmedGameId}".`));
};

export const returnToLobby = (): AppThunk => (dispatch) => {
    dispatch(resetSessionScopedUiState());
    dispatch(gameActions.returnedToLobby());
};

export const applyServerSession = (session: ServerGameSession): AppThunk => (dispatch) => {
    dispatch(gameActions.sessionUpdated(session));
    dispatch(syncSelectedSquare());
};

export const refreshCurrentGameView = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const currentGameId = getState().game.currentGameId;
    if (!currentGameId || getState().game.view !== "game") {
        return;
    }

    try {
        await dispatch(loadAndApplyGameView(currentGameId));
    } catch {
        // Keep the current board visible if metadata refresh fails.
    }
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
        await dispatch(handleCommandAuthFailure(result.status));
    } catch (error) {
        dispatch(gameActions.feedbackMessageSet(getUserActionErrorMessage(error, "Unable to apply that action right now.")));
    } finally {
        dispatch(gameActions.commandFinished());
    }
};

export const claimSide = (side: Side): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const gameId = getState().game.currentGameId;
    if (!gameId) {
        return;
    }

    await dispatch(
        runSeatManagementRequest(
            () => claimGameSide(gameId, { side }),
            "Unable to claim that side right now."
        )
    );
};

export const assignBotOpponent = (botId: string): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const gameId = getState().game.currentGameId;
    if (!gameId) {
        return;
    }

    await dispatch(
        runSeatManagementRequest(
            () => assignBotOpponentRequest(gameId, { botId }),
            "Unable to assign that bot opponent right now."
        )
    );
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

export const endGame = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "end-game" }, { clearSelection: true });

export const skipCapture = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "skip-capture" });

export const undoMove = (): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "undo" }, { clearSelection: true });

export const capturePiece = (square: string): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "capture-piece", square });

export const movePiece = (origin: string, destination: string): AppThunk<Promise<void>> =>
    createCommandThunk({ type: "move-piece", origin, destination });
