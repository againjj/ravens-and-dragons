import {
    deleteLocalAccountRequest,
    fetchAuthSession,
    fetchLocalProfile,
    loginAsGuest,
    loginRequest,
    logoutRequest,
    signupRequest,
    updateLocalProfileRequest
} from "../../game-client.js";
import type { AuthSessionResponse, DeleteAccountRequest, LoginRequest, SignupRequest, UpdateProfileRequest } from "../../game.js";
import type { AppThunk } from "../../app/store.js";
import { authActions } from "./authSlice.js";
import { refreshCurrentGameView } from "../game/gameThunks.js";

const signedOutSession = (oauthProviders: string[]): AuthSessionResponse => ({
    authenticated: false,
    user: null,
    oauthProviders
});

export const loadAuthSession = (): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(authActions.authLoadStarted());

    try {
        const session = await fetchAuthSession();
        dispatch(authActions.authSessionSet(session));
    } catch {
        dispatch(authActions.authLoadFailed());
        dispatch(authActions.authFeedbackMessageSet("Unable to check your sign-in status right now."));
    }
};

export const continueAsGuest = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    dispatch(authActions.authRequestStarted());

    try {
        const session = await loginAsGuest();
        dispatch(authActions.authSessionSet(session));
        await dispatch(refreshCurrentGameView());
    } catch {
        dispatch(authActions.authFeedbackMessageSet("Unable to continue as a guest right now."));
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
        dispatch(authActions.authFeedbackMessageSet(error instanceof Error ? error.message : "Unable to sign up right now."));
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
        dispatch(authActions.authFeedbackMessageSet(error instanceof Error ? error.message : "Unable to sign in right now."));
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
    } catch {
        dispatch(authActions.authFeedbackMessageSet("Unable to log out right now."));
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
        dispatch(authActions.authFeedbackMessageSet(error instanceof Error ? error.message : "Unable to load your profile right now."));
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
        dispatch(authActions.authFeedbackMessageSet(error instanceof Error ? error.message : "Unable to update your profile right now."));
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
        dispatch(authActions.authFeedbackMessageSet(error instanceof Error ? error.message : "Unable to delete your account right now."));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};
