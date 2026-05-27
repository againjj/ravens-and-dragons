import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
    fetchAuthSession,
    fetchUsers,
    isServerUnavailableError,
    isUnauthorizedError,
    notifyAuthSessionExpired,
    notifyServerUnavailable,
    serverUnavailableMessage,
    sessionExpiredMessage
} from "@ravensanddragons/platform-frontend/api-client";
import type { AuthUserSummary } from "@ravensanddragons/platform-frontend/auth-types";
import { fetchGinRummyGame, sendCommand } from "./gin-rummy-client";
import type { DragSource, EndAction, FlyingCard, GinRummyConfig, GinRummyGame, KnockChoice } from "./gin-rummy-types";

type CreateOptionsState = GinRummyConfig & {
    publiclyListed: boolean;
};

interface GinRummyPlayState {
    game: GinRummyGame | null;
    message: string | null;
    isSubmitting: boolean;
    activePickerSeat: number | null;
    players: AuthUserSummary[];
    currentUser: AuthUserSummary | null;
    revealedTurnKey: string | null;
    knockChoices: KnockChoice[];
    pendingEndAction: EndAction | null;
    showFinishedLayout: boolean;
    dismissedRoundResultKey: string | null;
    dismissedRoundReasonKey: string | null;
    flyingCard: FlyingCard | null;
    activeDragSource: DragSource | null;
    activeDragCardId: string | null;
}

interface GinRummyState {
    createOptions: CreateOptionsState;
    play: GinRummyPlayState;
}

const defaultErrorMessage = "Unable to update Gin Rummy.";

const asyncErrorMessage = (error: unknown, fallback = defaultErrorMessage): string => {
    if (isUnauthorizedError(error)) {
        notifyAuthSessionExpired();
        return sessionExpiredMessage;
    }
    if (isServerUnavailableError(error)) {
        notifyServerUnavailable();
        return serverUnavailableMessage;
    }
    return error instanceof Error ? error.message : fallback;
};

const clearTurnInteraction = (state: GinRummyPlayState) => {
    state.knockChoices = [];
    state.pendingEndAction = null;
    state.revealedTurnKey = null;
    state.showFinishedLayout = false;
};

const roundResultKey = (game: GinRummyGame): string | null =>
    game.roundResult
        ? `${game.id}:${game.roundResult.gameNumber ?? game.gameNumber}:${game.roundResult.roundNumber ?? game.roundNumber}:${game.roundResult.reason}`
        : null;

const receiveGame = (state: GinRummyPlayState, game: GinRummyGame, requireCurrentOrNewer: boolean) => {
    if (requireCurrentOrNewer && state.game && game.version < state.game.version) return;
    const previous = state.game;
    const previousRoundResultKey = previous ? roundResultKey(previous) : null;
    const nextGame = !game.roundResult && previous?.roundResult && previousRoundResultKey && state.dismissedRoundResultKey !== previousRoundResultKey
        ? { ...game, roundResult: previous.roundResult }
        : game;
    state.game = nextGame;
    state.message = null;
    if (!previous || previous.currentSeat !== nextGame.currentSeat || previous.roundNumber !== nextGame.roundNumber) {
        clearTurnInteraction(state);
    }
};

const initialState: GinRummyState = {
    createOptions: {
        publiclyListed: true,
        targetScore: 100,
        playMode: "singleGame",
        bigGinAllowed: false,
        optionalDealRule: true,
        lineBonusEnabled: false,
        aceHighAllowed: true
    },
    play: {
        game: null,
        message: null,
        isSubmitting: false,
        activePickerSeat: null,
        players: [],
        currentUser: null,
        revealedTurnKey: null,
        knockChoices: [],
        pendingEndAction: null,
        showFinishedLayout: false,
        dismissedRoundResultKey: null,
        dismissedRoundReasonKey: null,
        flyingCard: null,
        activeDragSource: null,
        activeDragCardId: null
    }
};

export const loadGinRummyGame = createAsyncThunk<GinRummyGame, string, { rejectValue: string }>(
    "ginRummy/loadGame",
    async (gameId, { rejectWithValue }) => {
        try {
            return await fetchGinRummyGame(gameId);
        } catch (error) {
            return rejectWithValue(asyncErrorMessage(error));
        }
    }
);

export const loadGinRummyAuthSession = createAsyncThunk<AuthUserSummary | null, void, { rejectValue: string }>(
    "ginRummy/loadAuthSession",
    async (_, { rejectWithValue }) => {
        try {
            return (await fetchAuthSession()).user;
        } catch (error) {
            return rejectWithValue(asyncErrorMessage(error));
        }
    }
);

export const loadGinRummyPlayers = createAsyncThunk<AuthUserSummary[]>(
    "ginRummy/loadPlayers",
    async () => {
        try {
            return await fetchUsers();
        } catch {
            return [];
        }
    }
);

export const runGinRummyCommand = createAsyncThunk<
    GinRummyGame,
    { game: GinRummyGame; command: Record<string, unknown> },
    { rejectValue: string }
>(
    "ginRummy/runCommand",
    async ({ game, command }, { rejectWithValue }) => {
        try {
            return await sendCommand(game, command);
        } catch (error) {
            return rejectWithValue(asyncErrorMessage(error));
        }
    }
);

const ginRummySlice = createSlice({
    name: "ginRummy",
    initialState,
    reducers: {
        updateCreateOptions(state, action: PayloadAction<Partial<CreateOptionsState>>) {
            state.createOptions = { ...state.createOptions, ...action.payload };
        },
        setPlayMessage(state, action: PayloadAction<string | null>) {
            state.play.message = action.payload;
        },
        receiveGinRummyGame(state, action: PayloadAction<GinRummyGame>) {
            receiveGame(state.play, action.payload, true);
        },
        setActivePickerSeat(state, action: PayloadAction<number | null>) {
            state.play.activePickerSeat = action.payload;
        },
        setRevealedTurnKey(state, action: PayloadAction<string | null>) {
            state.play.revealedTurnKey = action.payload;
        },
        setKnockChoices(state, action: PayloadAction<KnockChoice[]>) {
            state.play.knockChoices = action.payload;
        },
        clearKnockChoicesAndPendingEndAction(state) {
            state.play.knockChoices = [];
            state.play.pendingEndAction = null;
        },
        setPendingEndAction(state, action: PayloadAction<EndAction | null>) {
            state.play.pendingEndAction = action.payload;
        },
        setShowFinishedLayout(state, action: PayloadAction<boolean>) {
            state.play.showFinishedLayout = action.payload;
        },
        setDismissedRoundResultKey(state, action: PayloadAction<string | null>) {
            state.play.dismissedRoundResultKey = action.payload;
        },
        setDismissedRoundReasonKey(state, action: PayloadAction<string | null>) {
            state.play.dismissedRoundReasonKey = action.payload;
        },
        setFlyingCard(state, action: PayloadAction<FlyingCard | null>) {
            state.play.flyingCard = action.payload;
        },
        clearFlyingCardByKey(state, action: PayloadAction<number>) {
            if (state.play.flyingCard?.key === action.payload) {
                state.play.flyingCard = null;
            }
        },
        setActiveDragSource(state, action: PayloadAction<DragSource | null>) {
            state.play.activeDragSource = action.payload;
        },
        setActiveDragCardId(state, action: PayloadAction<string | null>) {
            state.play.activeDragCardId = action.payload;
        },
        clearDragState(state) {
            state.play.activeDragSource = null;
            state.play.activeDragCardId = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(loadGinRummyGame.fulfilled, (state, action) => {
                receiveGame(state.play, action.payload, true);
            })
            .addCase(loadGinRummyGame.rejected, (state, action) => {
                state.play.message = action.payload ?? defaultErrorMessage;
            })
            .addCase(loadGinRummyAuthSession.fulfilled, (state, action) => {
                state.play.currentUser = action.payload;
            })
            .addCase(loadGinRummyAuthSession.rejected, (state, action) => {
                state.play.message = action.payload ?? defaultErrorMessage;
            })
            .addCase(loadGinRummyPlayers.fulfilled, (state, action) => {
                state.play.players = action.payload;
            })
            .addCase(runGinRummyCommand.pending, (state) => {
                state.play.isSubmitting = true;
                state.play.message = null;
            })
            .addCase(runGinRummyCommand.fulfilled, (state, action) => {
                state.play.isSubmitting = false;
                receiveGame(state.play, action.payload, true);
            })
            .addCase(runGinRummyCommand.rejected, (state, action) => {
                state.play.isSubmitting = false;
                state.play.message = action.payload ?? defaultErrorMessage;
            });
    }
});

export const {
    updateCreateOptions,
    setPlayMessage,
    receiveGinRummyGame,
    setActivePickerSeat,
    setRevealedTurnKey,
    setKnockChoices,
    clearKnockChoicesAndPendingEndAction,
    setPendingEndAction,
    setShowFinishedLayout,
    setDismissedRoundResultKey,
    setDismissedRoundReasonKey,
    setFlyingCard,
    clearFlyingCardByKey,
    setActiveDragSource,
    setActiveDragCardId,
    clearDragState
} = ginRummySlice.actions;

export const ginRummyReducer = ginRummySlice.reducer;
