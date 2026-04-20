import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { BotSummary, GamePlayerSummary, GameViewResponse, ServerGameSession, ViewerRole } from "../../game-types.js";

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
        },
        commandStarted(state) {
            state.isSubmitting = true;
            state.feedbackMessage = null;
        },
        commandFinished(state) {
            state.isSubmitting = false;
        },
        sessionUpdated(state, action: PayloadAction<ServerGameSession>) {
            state.currentGameId = action.payload.id;
            state.session = action.payload;
            state.loadState = "ready";
            state.feedbackMessage = null;
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
