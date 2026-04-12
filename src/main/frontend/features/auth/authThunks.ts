import {
    fetchAuthSession,
    loginAsGuest,
    loginRequest,
    logoutRequest,
    signupRequest
} from "../../game-client.js";
import type { LoginRequest, SignupRequest } from "../../game.js";
import type { AppThunk } from "../../app/store.js";
import { authActions } from "./authSlice.js";
import { refreshCurrentGameView } from "../game/gameThunks.js";

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

export const continueAsGuest = (): AppThunk<Promise<void>> => async (dispatch) => {
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

export const logout = (): AppThunk<Promise<void>> => async (dispatch) => {
    dispatch(authActions.authRequestStarted());

    try {
        await logoutRequest();
        dispatch(
            authActions.authSessionSet({
                authenticated: false,
                user: null
            })
        );
    } catch {
        dispatch(authActions.authFeedbackMessageSet("Unable to log out right now."));
    } finally {
        dispatch(authActions.authRequestFinished());
    }
};
