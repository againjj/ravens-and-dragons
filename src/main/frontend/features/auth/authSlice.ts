import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AuthSessionResponse } from "../../game.js";

export interface AuthState {
    session: AuthSessionResponse;
    isSubmitting: boolean;
    loadState: "idle" | "loading" | "ready" | "error";
    feedbackMessage: string | null;
}

export const initialAuthState: AuthState = {
    session: {
        authenticated: false,
        user: null
    },
    isSubmitting: false,
    loadState: "idle",
    feedbackMessage: null
};

const authSlice = createSlice({
    name: "auth",
    initialState: initialAuthState,
    reducers: {
        authLoadStarted(state) {
            state.loadState = "loading";
        },
        authSessionSet(state, action: PayloadAction<AuthSessionResponse>) {
            state.session = action.payload;
            state.loadState = "ready";
            state.feedbackMessage = null;
        },
        authFeedbackMessageSet(state, action: PayloadAction<string | null>) {
            state.feedbackMessage = action.payload;
        },
        authRequestStarted(state) {
            state.isSubmitting = true;
            state.feedbackMessage = null;
        },
        authRequestFinished(state) {
            state.isSubmitting = false;
        },
        authLoadFailed(state) {
            state.loadState = "error";
        }
    }
});

export const authReducer = authSlice.reducer;
export const authActions = authSlice.actions;
