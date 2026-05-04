import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { BotSummary, GamePlayerSummary, GameViewResponse, ServerGameSession, Side, ViewerRole } from "../../game-types.js";

export type GameView = "lobby" | "game";

export interface GameState {
    currentGameId: string | null;
    view: GameView;
    session: ServerGameSession | null;
    viewerRole: ViewerRole | null;
    dragonsPlayer: GamePlayerSummary | null;
    ravensPlayer: GamePlayerSummary | null;
    dragonsBot: BotSummary | null;
    ravensBot: BotSummary | null;
    availableBots: BotSummary[];
    pendingBotAssignment: { side: Side; botId: string } | null;
    isSubmitting: boolean;
    loadState: "idle" | "loading" | "ready" | "error";
    connectionState: "idle" | "connecting" | "open" | "reconnecting";
    feedbackMessage: string | null;
}

export const initialGameState: GameState = {
    currentGameId: null,
    view: "lobby",
    session: null,
    viewerRole: null,
    dragonsPlayer: null,
    ravensPlayer: null,
    dragonsBot: null,
    ravensBot: null,
    availableBots: [],
    pendingBotAssignment: null,
    isSubmitting: false,
    loadState: "idle",
    connectionState: "idle",
    feedbackMessage: null
};

const gameSlice = createSlice({
    name: "game",
    initialState: initialGameState,
    reducers: {
        gameLoadRequested(state, action: PayloadAction<string>) {
            state.currentGameId = action.payload;
            state.view = "game";
            state.session = null;
            state.viewerRole = null;
            state.dragonsPlayer = null;
            state.ravensPlayer = null;
            state.dragonsBot = null;
            state.ravensBot = null;
            state.availableBots = [];
            state.pendingBotAssignment = null;
            state.isSubmitting = false;
            state.loadState = "loading";
            state.connectionState = "connecting";
            state.feedbackMessage = null;
        },
        gameOpened(state, action: PayloadAction<string>) {
            state.currentGameId = action.payload;
            state.view = "game";
            state.feedbackMessage = null;
        },
        returnedToLobby(state) {
            state.currentGameId = null;
            state.view = "lobby";
            state.session = null;
            state.viewerRole = null;
            state.dragonsPlayer = null;
            state.ravensPlayer = null;
            state.dragonsBot = null;
            state.ravensBot = null;
            state.availableBots = [];
            state.pendingBotAssignment = null;
            state.isSubmitting = false;
            state.loadState = "idle";
            state.connectionState = "idle";
            state.feedbackMessage = null;
        },
        loadStarted(state) {
            state.loadState = "loading";
            state.connectionState = state.view === "game" ? "connecting" : "idle";
            state.feedbackMessage = null;
        },
        loadFailed(state) {
            state.loadState = "error";
            state.session = null;
            state.viewerRole = null;
            state.dragonsPlayer = null;
            state.ravensPlayer = null;
            state.dragonsBot = null;
            state.ravensBot = null;
            state.availableBots = [];
            state.pendingBotAssignment = null;
        },
        commandStarted(state) {
            state.isSubmitting = true;
            state.feedbackMessage = null;
        },
        commandFinished(state) {
            state.isSubmitting = false;
            state.pendingBotAssignment = null;
        },
        sessionUpdated(state, action: PayloadAction<ServerGameSession>) {
            state.currentGameId = action.payload.id;
            state.session = action.payload;
            state.loadState = "ready";
            state.feedbackMessage = null;
            const pendingAssignment = state.pendingBotAssignment;
            if (
                pendingAssignment &&
                (
                    (pendingAssignment.side === "dragons" && action.payload.dragonsBotId === pendingAssignment.botId) ||
                    (pendingAssignment.side === "ravens" && action.payload.ravensBotId === pendingAssignment.botId)
                )
            ) {
                state.pendingBotAssignment = null;
            }
        },
        gameViewUpdated(state, action: PayloadAction<GameViewResponse>) {
            state.currentGameId = action.payload.game.id;
            state.session = action.payload.game;
            state.viewerRole = action.payload.viewerRole;
            state.dragonsPlayer = action.payload.dragonsPlayer;
            state.ravensPlayer = action.payload.ravensPlayer;
            state.dragonsBot = action.payload.dragonsBot;
            state.ravensBot = action.payload.ravensBot;
            state.availableBots = action.payload.availableBots;
            state.loadState = "ready";
            state.feedbackMessage = null;
            const pendingAssignment = state.pendingBotAssignment;
            if (
                pendingAssignment &&
                (
                    (pendingAssignment.side === "dragons" && action.payload.game.dragonsBotId === pendingAssignment.botId) ||
                    (pendingAssignment.side === "ravens" && action.payload.game.ravensBotId === pendingAssignment.botId)
                )
            ) {
                state.pendingBotAssignment = null;
            }
        },
        viewerMetadataUpdated(
            state,
            action: PayloadAction<
                Pick<GameViewResponse, "viewerRole" | "dragonsPlayer" | "ravensPlayer" | "dragonsBot" | "ravensBot" | "availableBots">
            >
        ) {
            state.viewerRole = action.payload.viewerRole;
            state.dragonsPlayer = action.payload.dragonsPlayer;
            state.ravensPlayer = action.payload.ravensPlayer;
            state.dragonsBot = action.payload.dragonsBot;
            state.ravensBot = action.payload.ravensBot;
            state.availableBots = action.payload.availableBots;
        },
        feedbackMessageSet(state, action: PayloadAction<string | null>) {
            state.feedbackMessage = action.payload;
        },
        pendingBotAssignmentSet(state, action: PayloadAction<{ side: Side; botId: string } | null>) {
            state.pendingBotAssignment = action.payload;
        },
        streamConnected(state) {
            state.connectionState = "open";
        },
        streamDisconnected(state) {
            state.connectionState = "reconnecting";
        }
    }
});

export const gameReducer = gameSlice.reducer;
export const gameActions = gameSlice.actions;
