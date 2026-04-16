import type { RootState } from "../../app/store.js";

export const selectAuthState = (state: RootState) => state.auth;
export const selectAuthSession = (state: RootState) => state.auth.session;
export const selectCurrentUser = (state: RootState) => state.auth.session.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.session.authenticated;
export const selectOAuthProviders = (state: RootState) => state.auth.session.oauthProviders ?? [];
export const selectIsAuthSubmitting = (state: RootState) => state.auth.isSubmitting;
export const selectAuthFeedbackMessage = (state: RootState) => state.auth.feedbackMessage;
export const selectAuthLoadState = (state: RootState) => state.auth.loadState;
export const selectLocalProfile = (state: RootState) => state.auth.profile;
export const selectLocalProfileLoadState = (state: RootState) => state.auth.profileLoadState;
