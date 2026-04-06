import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { ServerGameSession } from "../../game.js";

export interface GameState {
    session: ServerGameSession | null;
    isSubmitting: boolean;
    loadState: "idle" | "loading" | "ready" | "error";
    connectionState: "idle" | "connecting" | "open" | "reconnecting";
    feedbackMessage: string | null;
}

const initialState: GameState = {
    session: null,
    isSubmitting: false,
    loadState: "idle",
    connectionState: "idle",
    feedbackMessage: null
};

const gameSlice = createSlice({
    name: "game",
    initialState,
    reducers: {
        loadStarted(state) {
            state.loadState = "loading";
            state.connectionState = "connecting";
            state.feedbackMessage = null;
        },
        loadFailed(state) {
            state.loadState = "error";
            state.feedbackMessage = null;
        },
        commandStarted(state) {
            state.isSubmitting = true;
            state.feedbackMessage = null;
        },
        commandFinished(state) {
            state.isSubmitting = false;
        },
        sessionUpdated(state, action: PayloadAction<ServerGameSession>) {
            state.session = action.payload;
            state.loadState = "ready";
            state.feedbackMessage = null;
        },
        feedbackMessageSet(state, action: PayloadAction<string>) {
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
