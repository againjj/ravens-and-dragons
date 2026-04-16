import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AuthSessionResponse, LocalProfileResponse } from "../../game.js";

export interface AuthState {
    session: AuthSessionResponse;
    profile: LocalProfileResponse | null;
    profileLoadState: "idle" | "loading" | "ready" | "error";
    isSubmitting: boolean;
    loadState: "idle" | "loading" | "ready" | "error";
    feedbackMessage: string | null;
}

export const initialAuthState: AuthState = {
    session: {
        authenticated: false,
        user: null,
        oauthProviders: []
    },
    profile: null,
    profileLoadState: "idle",
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
            if (action.payload.user?.authType !== "local") {
                state.profile = null;
                state.profileLoadState = "idle";
            } else if (state.profile && state.profile.id === action.payload.user.id) {
                state.profile.displayName = action.payload.user.displayName;
            }
        },
        authFeedbackMessageSet(state, action: PayloadAction<string | null>) {
            state.feedbackMessage = action.payload;
        },
        localProfileCleared(state) {
            state.profile = null;
            state.profileLoadState = "idle";
        },
        localProfileLoadStarted(state) {
            state.profileLoadState = "loading";
            state.feedbackMessage = null;
        },
        localProfileSet(state, action: PayloadAction<LocalProfileResponse>) {
            state.profile = action.payload;
            state.profileLoadState = "ready";
            state.feedbackMessage = null;
        },
        localProfileLoadFailed(state) {
            state.profileLoadState = "error";
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
