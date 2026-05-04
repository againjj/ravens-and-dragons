import { useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { authActions } from "../features/auth/authSlice.js";
import { selectAuthFeedbackMessage, selectCurrentUser, selectIsAuthSubmitting, selectIsAuthenticated, selectOAuthProviders } from "../features/auth/authSelectors.js";
import { getOAuthLoginUrl } from "../game-client.js";

interface AuthPanelProps {
    onContinueAsGuest: () => void;
    onLogin: (request: { username: string; password: string }) => void;
    onSignup: (request: { username: string; password: string; displayName: string }) => void;
    onLogout: () => void;
}

export const AuthPanel = ({
    onContinueAsGuest,
    onLogin,
    onSignup,
    onLogout
}: AuthPanelProps) => {
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const oauthProviders = useAppSelector(selectOAuthProviders);
    const isSubmitting = useAppSelector(selectIsAuthSubmitting);
    const feedbackMessage = useAppSelector(selectAuthFeedbackMessage);
    const googleOauthEnabled = oauthProviders.includes("google");
    const [loginUsername, setLoginUsername] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [signupUsername, setSignupUsername] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupDisplayName, setSignupDisplayName] = useState("");
    const isSignupPasswordValid = signupPassword.length >= 8;
    const isSignupDisplayNameValid = signupDisplayName.trim() !== "";
    const dismissFeedback = () => {
        dispatch(authActions.authFeedbackMessageSet(null));
    };

    if (isAuthenticated && currentUser) {
        return (
            <section className="panel">
                <h2>Player</h2>
                <p>
                    Signed in as <strong>{currentUser.displayName}</strong> ({currentUser.authType})
                </p>
                <button type="button" disabled={isSubmitting} onClick={onLogout}>
                    Log Out
                </button>
                <p className="lobby-feedback" aria-live="polite">
                    {feedbackMessage ?? " "}
                </p>
            </section>
        );
    }

    return (
        <>
            <section className="auth-layout">
                <section className="panel page-header-panel">
                    <div className="page-header-copy">
                        <h2>Welcome</h2>
                        <p>You need to log in before playing a game.</p>
                    </div>
                </section>

                <section className="auth-grid" aria-label="Sign in options">
                    <section className="panel auth-panel">
                        <div className="lobby-card-copy">
                            <h2>Sign In</h2>
                            <p>
                                {googleOauthEnabled
                                    ? "Sign in with your account, as a guest, or with Google."
                                    : "Sign in with your account or as a guest."}
                            </p>
                        </div>
                        <div className="lobby-actions">
                            <div className="control-row">
                                <label className="control-label" htmlFor="login-username-input">
                                    Username
                                </label>
                                <input
                                    id="login-username-input"
                                    className="text-input"
                                    type="text"
                                    value={loginUsername}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setLoginUsername(event.target.value);
                                    }}
                                />
                            </div>
                            <div className="control-row">
                                <label className="control-label" htmlFor="login-password-input">
                                    Password
                                </label>
                                <input
                                    id="login-password-input"
                                    className="text-input"
                                    type="password"
                                    value={loginPassword}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setLoginPassword(event.target.value);
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                disabled={isSubmitting || loginUsername.trim() === "" || loginPassword === ""}
                                onClick={() => {
                                    onLogin({ username: loginUsername.trim(), password: loginPassword });
                                }}
                            >
                                Sign In
                            </button>
                            <button type="button" disabled={isSubmitting} onClick={onContinueAsGuest}>
                                Continue as Guest
                            </button>
                            {googleOauthEnabled ? (
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => {
                                        const nextPath = new URLSearchParams(window.location.search).get("next") ?? "/lobby";
                                        window.location.assign(getOAuthLoginUrl("google", nextPath));
                                    }}
                                >
                                    Sign in with Google
                                </button>
                            ) : null}
                        </div>
                    </section>

                    <section className="panel auth-panel">
                        <div className="lobby-card-copy">
                            <h2>Create Account</h2>
                        </div>
                        <div className="lobby-actions">
                            <div className="control-row">
                                <label className="control-label" htmlFor="signup-display-name-input">
                                    Display Name
                                </label>
                                <input
                                    id="signup-display-name-input"
                                    className="text-input"
                                    type="text"
                                    value={signupDisplayName}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setSignupDisplayName(event.target.value);
                                    }}
                                />
                            </div>
                            <div className="control-row">
                                <label className="control-label" htmlFor="signup-username-input">
                                    Username
                                </label>
                                <input
                                    id="signup-username-input"
                                    className="text-input"
                                    type="text"
                                    value={signupUsername}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setSignupUsername(event.target.value);
                                    }}
                                />
                            </div>
                            <div className="control-row">
                                <label className="control-label" htmlFor="signup-password-input">
                                    Password
                                </label>
                                <input
                                    id="signup-password-input"
                                    className="text-input"
                                    type="password"
                                    value={signupPassword}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                        setSignupPassword(event.target.value);
                                    }}
                                />
                            </div>
                            <p className="auth-guidance">Use at least 8 characters for your password.</p>
                            <button
                                type="button"
                                disabled={
                                    isSubmitting ||
                                    signupUsername.trim() === "" ||
                                    !isSignupDisplayNameValid ||
                                    !isSignupPasswordValid
                                }
                                onClick={() => {
                                    onSignup({
                                        username: signupUsername.trim(),
                                        password: signupPassword,
                                        displayName: signupDisplayName.trim()
                                    });
                                }}
                            >
                                Sign Up
                            </button>
                        </div>
                    </section>
                </section>
            </section>

            {feedbackMessage ? (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onClick={() => {
                        dismissFeedback();
                    }}
                >
                    <section
                        className="panel modal-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="auth-feedback-title"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <h2 id="auth-feedback-title">Sign In Error</h2>
                        <p>{feedbackMessage}</p>
                        <button
                            type="button"
                            onClick={() => {
                                dismissFeedback();
                            }}
                        >
                            OK
                        </button>
                    </section>
                </div>
            ) : null}
        </>
    );
};
