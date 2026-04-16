import { useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { deleteLocalAccount, loadLocalProfile, updateLocalProfile } from "../features/auth/authThunks.js";
import { selectAuthFeedbackMessage, selectCurrentUser, selectIsAuthSubmitting, selectLocalProfile, selectLocalProfileLoadState } from "../features/auth/authSelectors.js";
import { authActions } from "../features/auth/authSlice.js";
import type { DeleteAccountRequest, UpdateProfileRequest } from "../game.js";

export const ProfileScreen = () => {
    const dispatch = useAppDispatch();
    const currentUser = useAppSelector(selectCurrentUser);
    const profile = useAppSelector(selectLocalProfile);
    const profileLoadState = useAppSelector(selectLocalProfileLoadState);
    const isSubmitting = useAppSelector(selectIsAuthSubmitting);
    const feedbackMessage = useAppSelector(selectAuthFeedbackMessage);
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        void dispatch(loadLocalProfile());
    }, [dispatch]);

    const handleProfileUpdate = (request: UpdateProfileRequest) => {
        void dispatch(updateLocalProfile(request));
    };

    const handleDeleteAccount = (request: DeleteAccountRequest) => {
        void dispatch(deleteLocalAccount(request));
    };

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.displayName);
        }
    }, [profile]);

    return (
        <>
            <section className="panel page-header-panel">
                <div className="page-header-copy">
                    <h2>Profile</h2>
                    <p>{currentUser ? `Signed in as ${currentUser.displayName}.` : "Loading your profile."}</p>
                </div>
            </section>

            <section className="auth-grid">
                <section className="panel auth-panel">
                    <h2>Name</h2>
                    {profileLoadState === "loading" && !profile ? <p>Loading profile...</p> : null}
                    {profile ? (
                        <div className="lobby-actions">
                            <p>
                                Username: <strong>{profile.username}</strong>
                            </p>
                            <p>
                                Current display name: <strong>{profile.displayName}</strong>
                            </p>
                            <div className="control-row">
                                <label className="control-label" htmlFor="profile-display-name-input">
                                    New Display Name
                                </label>
                                <div className="profile-inline-actions">
                                    <input
                                        id="profile-display-name-input"
                                        className="text-input"
                                        type="text"
                                        value={displayName}
                                        disabled={isSubmitting}
                                        onChange={(event) => {
                                            setDisplayName(event.target.value);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        disabled={isSubmitting || displayName.trim() === "" || displayName.trim() === profile.displayName}
                                        onClick={() => {
                                            handleProfileUpdate({ displayName: displayName.trim() });
                                        }}
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </section>

                <section className="panel auth-panel">
                    <h2>Account deletion</h2>
                    <p>Enter your password to delete your account.</p>
                    <div className="lobby-actions">
                        <div className="control-row">
                            <label className="control-label" htmlFor="delete-account-password-input">
                                Confirm Password
                            </label>
                            <input
                                id="delete-account-password-input"
                                className="text-input"
                                type="password"
                                value={password}
                                disabled={isSubmitting}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            disabled={isSubmitting || password === ""}
                            onClick={() => {
                                handleDeleteAccount({ password });
                                setPassword("");
                            }}
                        >
                            Delete Account
                        </button>
                    </div>
                    <p className="lobby-feedback" aria-live="polite">
                        {feedbackMessage ?? " "}
                    </p>
                </section>
            </section>

            {feedbackMessage ? (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onClick={() => {
                        dispatch(authActions.authFeedbackMessageSet(null));
                    }}
                >
                    <section
                        className="panel modal-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="profile-feedback-title"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <h2 id="profile-feedback-title">Profile Error</h2>
                        <p>{feedbackMessage}</p>
                        <button
                            type="button"
                            onClick={() => {
                                dispatch(authActions.authFeedbackMessageSet(null));
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
