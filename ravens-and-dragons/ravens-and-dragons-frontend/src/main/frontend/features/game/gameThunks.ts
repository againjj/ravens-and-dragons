import { createGameSession, fetchGameView, sendGameCommandRequest } from "../../game-client.js";
import type { RavensAndDragonsHostState, RavensAndDragonsThunk } from "../../frontend-state.js";
import { normalizeSelectedSquare } from "../../game-rules-client.js";
import type { GameCommandRequest, GameViewResponse, ServerGameSession, Side } from "../../game-types.js";
import { buildCreateGameRequest } from "./createGameState.js";
import { gameActions } from "./gameSlice.js";
import { uiActions } from "../ui/uiSlice.js";
import { hostAuthSessionSet } from "../host/hostAuthActions.js";
import { selectBotAssignmentModel } from "./gameSelectors.js";

const serverUnavailableMessage = "The server is down. Please wait and try again later.";
export const playerAccountMissingMessage = "The chosen player account no longer exists.";

const resetSessionScopedUiState = (): RavensAndDragonsThunk => (dispatch) => {
    dispatch(uiActions.selectedSquareSet(null));
};

const isServerUnavailableError = (error: unknown): boolean =>
    error instanceof Error &&
    /failed to fetch|networkerror|network request failed|load failed/i.test(error.message);

const getUserActionErrorMessage = (error: unknown, fallbackMessage: string): string =>
    isServerUnavailableError(error) ? serverUnavailableMessage : fallbackMessage;

const getCreateGameErrorMessage = (error: unknown): string =>
    isServerUnavailableError(error)
        ? serverUnavailableMessage
        : error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Unable to create a new game right now.";

const getOauthProviders = (getState: () => RavensAndDragonsHostState): string[] => getState().auth.session.oauthProviders;

const applyFetchedGameView = (view: GameViewResponse): RavensAndDragonsThunk => (dispatch, getState) => {
    dispatch(gameActions.gameViewUpdated(view));
    dispatch(
        hostAuthSessionSet({
            authenticated: view.currentUser != null,
            user: view.currentUser,
            oauthProviders: getOauthProviders(getState)
        })
    );
    dispatch(syncSelectedSquare());
};

const loadAndApplyGameView = (gameId: string): RavensAndDragonsThunk<Promise<void>> => async (dispatch) => {
    const view = await fetchGameView(gameId);
    dispatch(applyFetchedGameView(view));
};

const requiresMetadataRefresh = (
    previousSession: ServerGameSession | null,
    nextSession: ServerGameSession
): boolean =>
    previousSession == null ||
    previousSession.dragonsPlayerUserId !== nextSession.dragonsPlayerUserId ||
    previousSession.ravensPlayerUserId !== nextSession.ravensPlayerUserId ||
    previousSession.dragonsBotId !== nextSession.dragonsBotId ||
    previousSession.ravensBotId !== nextSession.ravensBotId ||
    previousSession.selectedRuleConfigurationId !== nextSession.selectedRuleConfigurationId;

const loadGameViewForUserAction = (
    gameId: string,
    fallbackMessage: string
): RavensAndDragonsThunk<Promise<boolean>> => async (dispatch) => {
    try {
        await dispatch(loadAndApplyGameView(gameId));
        return true;
    } catch (error) {
        dispatch(gameActions.loadFailed());
        dispatch(gameActions.feedbackMessageSet(getUserActionErrorMessage(error, fallbackMessage)));
        return false;
    }
};

const handleCommandAuthFailure = (status?: number): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
    if (status === 401) {
        dispatch(
            hostAuthSessionSet({
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

const syncSelectedSquare = (): RavensAndDragonsThunk => (dispatch, getState) => {
    const snapshot = getState().game.session?.snapshot;
    if (!snapshot) {
        dispatch(resetSessionScopedUiState());
        return;
    }

    dispatch(uiActions.selectedSquareSet(normalizeSelectedSquare(snapshot, getState().ui.selectedSquare)));
};

const sendSelectionClearingCommand = (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">
): RavensAndDragonsThunk<Promise<void>> => async (dispatch) => {
    dispatch(resetSessionScopedUiState());
    await dispatch(sendCommand(partialCommand));
};

export const createGame = (
    gameSlug: string,
    options: { publiclyListed?: boolean } = {}
): RavensAndDragonsThunk<Promise<string | null>> => async (dispatch, getState) => {
    dispatch(gameActions.commandStarted());

    try {
        const session = await createGameSession(
            gameSlug,
            buildCreateGameRequest(getState().createGame, options.publiclyListed ?? true)
        );
        dispatch(gameActions.sessionUpdated(session));
        return session.id;
    } catch (error) {
        dispatch(gameActions.feedbackMessageSet(getCreateGameErrorMessage(error)));
        return null;
    } finally {
        dispatch(gameActions.commandFinished());
    }
};

export const openGame = (gameId: string): RavensAndDragonsThunk<Promise<boolean>> => async (dispatch) => {
    const trimmedGameId = gameId.trim();
    if (!trimmedGameId) {
        dispatch(gameActions.feedbackMessageSet("Enter a game ID to open a game."));
        return false;
    }

    dispatch(resetSessionScopedUiState());
    dispatch(gameActions.gameLoadRequested(trimmedGameId));

    return dispatch(loadGameViewForUserAction(trimmedGameId, `Unable to open game "${trimmedGameId}".`));
};

export const returnToLobby = (): RavensAndDragonsThunk => (dispatch) => {
    dispatch(resetSessionScopedUiState());
    dispatch(gameActions.returnedToLobby());
};

export const applyServerSession = (session: ServerGameSession): RavensAndDragonsThunk => (dispatch) => {
    dispatch(gameActions.sessionUpdated(session));
    dispatch(syncSelectedSquare());
};

export const applyServerSessionFromStream = (session: ServerGameSession): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
    const previousSession = getState().game.session;
    dispatch(applyServerSession(session));

    if (requiresMetadataRefresh(previousSession, session)) {
        await dispatch(refreshCurrentGameView());
    }
};

export const refreshCurrentGameView = (): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
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
): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
    const currentGame = getState().game.session;
    if (!currentGame || getState().game.isSubmitting) {
        return;
    }

    dispatch(gameActions.commandStarted());

    try {
        const result = await sendGameCommandRequest(currentGame, partialCommand);
        if (result.game) {
            const shouldRefreshMetadata = requiresMetadataRefresh(currentGame, result.game);
            dispatch(applyServerSession(result.game));
            if (shouldRefreshMetadata) {
                await dispatch(refreshCurrentGameView());
            }
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

export const claimSide = (side: Side): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
    if (!getState().game.session) {
        return;
    }

    await dispatch(sendCommand({ type: "claim-side", side }));
};

export const assignPlayerSeat = (side: Side, playerUserId: string): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
    if (!getState().game.session) {
        return;
    }

    await dispatch(sendCommand({ type: "assign-player-seat", side, playerUserId }));
};

export const assignBotOpponent = (botId: string): RavensAndDragonsThunk<Promise<void>> => async (dispatch, getState) => {
    if (!getState().game.session) {
        return;
    }

    const { targetSide } = selectBotAssignmentModel(getState());

    if (targetSide) {
        dispatch(gameActions.pendingBotAssignmentSet({ side: targetSide, botId }));
    }

    await dispatch(sendCommand({ type: "assign-bot-opponent", botId }));
};

const createCommandThunk = (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">,
    options: { clearSelection?: boolean } = {}
): RavensAndDragonsThunk<Promise<void>> => async (dispatch) => {
    if (options.clearSelection) {
        await dispatch(sendSelectionClearingCommand(partialCommand));
        return;
    }

    await dispatch(sendCommand(partialCommand));
};

export const endGame = (): RavensAndDragonsThunk<Promise<void>> =>
    createCommandThunk({ type: "end-game" }, { clearSelection: true });

export const skipCapture = (): RavensAndDragonsThunk<Promise<void>> =>
    createCommandThunk({ type: "skip-capture" });

export const undoMove = (): RavensAndDragonsThunk<Promise<void>> =>
    createCommandThunk({ type: "undo" }, { clearSelection: true });

export const capturePiece = (square: string): RavensAndDragonsThunk<Promise<void>> =>
    createCommandThunk({ type: "capture-piece", square });

export const movePiece = (origin: string, destination: string): RavensAndDragonsThunk<Promise<void>> =>
    createCommandThunk({ type: "move-piece", origin, destination });
