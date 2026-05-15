import {
    deleteLocalAccountRequest,
    fetchAuthSession,
    fetchLocalProfile,
    loginAsGuest,
    loginRequest,
    logoutRequest,
    isServerUnavailableError,
    notifyServerUnavailable,
    serverUnavailableMessage,
    signupRequest,
    updateLocalProfileRequest
} from "@ravensanddragons/platform-frontend/api-client";
import type { AppThunk } from "../../app/store.js";
import type { AuthSessionResponse, DeleteAccountRequest, LoginRequest, SignupRequest, UpdateProfileRequest } from "@ravensanddragons/platform-frontend/auth-types";
import { authActions } from "./authSlice.js";
import { refreshCurrentGameView } from "../../../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game/gameThunks.js";

export const signedOutSession = (oauthProviders: string[]): AuthSessionResponse => ({
    authenticated: false,
    user: null,
    oauthProviders
});

const getRequestErrorMessage = (error: unknown, fallbackMessage: string): string =>
    isServerUnavailableError(error)
        ? serverUnavailableMessage
        : error instanceof Error && error.message.trim().length > 0
            ? error.message
            : fallbackMessage;

export const loadAuthSession = (): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(authActions.authLoadStarted());

    try {
        const session = await fetchAuthSession();
        dispatch(authActions.authSessionSet(session));
    } catch {
        dispatch(authActions.authLoadFailed());
        dispatch(authActions.authFeedbackMessageSet(serverUnavailableMessage));
        notifyServerUnavailable();
    }
};

export const continueAsGuest = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    dispatch(authActions.authRequestStarted());

    try {
        const session = await loginAsGuest();
        dispatch(authActions.authSessionSet(session));
        await dispatch(refreshCurrentGameView());
    } catch (error) {
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to continue as a guest right now.")));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};

export const signup = (request: SignupRequest): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(authActions.authRequestStarted());

    try {
        const session = await signupRequest(request);
        dispatch(authActions.authSessionSet(session));
        await dispatch(refreshCurrentGameView());
    } catch (error) {
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to sign up right now.")));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};

export const login = (request: LoginRequest): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(authActions.authRequestStarted());

    try {
        const session = await loginRequest(request);
        dispatch(authActions.authSessionSet(session));
        await dispatch(refreshCurrentGameView());
    } catch (error) {
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to sign in right now.")));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};

export const logout = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    dispatch(authActions.authRequestStarted());

    try {
        await logoutRequest();
        window.history.pushState({}, "", "/login");
        dispatch(authActions.authSessionSet(signedOutSession(getState().auth.session.oauthProviders)));
    } catch (error) {
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to log out right now.")));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};

export const loadLocalProfile = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    if (getState().auth.session.user?.authType !== "local") {
        dispatch(authActions.localProfileCleared());
        return;
    }

    dispatch(authActions.localProfileLoadStarted());
    try {
        const profile = await fetchLocalProfile();
        dispatch(authActions.localProfileSet(profile));
    } catch (error) {
        dispatch(authActions.localProfileLoadFailed());
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to load your profile right now.")));
    }
};

export const updateLocalProfile = (request: UpdateProfileRequest): AppThunk<Promise<void>> => async (dispatch, getState) => {
    dispatch(authActions.authRequestStarted());

    try {
        const session = await updateLocalProfileRequest(request);
        dispatch(authActions.authSessionSet(session));
        const currentProfile = getState().auth.profile;
        if (currentProfile) {
            dispatch(authActions.localProfileSet({ ...currentProfile, displayName: request.displayName }));
        }
        await dispatch(refreshCurrentGameView());
    } catch (error) {
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to update your profile right now.")));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};

export const deleteLocalAccount = (request: DeleteAccountRequest): AppThunk<Promise<void>> => async (dispatch, getState) => {
    dispatch(authActions.authRequestStarted());

    try {
        await deleteLocalAccountRequest(request);
        dispatch(authActions.authSessionSet(signedOutSession(getState().auth.session.oauthProviders)));
    } catch (error) {
        dispatch(authActions.authFeedbackMessageSet(getRequestErrorMessage(error, "Unable to delete your account right now.")));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};
