import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { AuthPanel } from "./components/AuthPanel.js";
import { CreateGameScreen } from "./components/CreateGameScreen.js";
import { GameScreen } from "./components/GameScreen.js";
import { LobbyScreen } from "./components/LobbyScreen.js";
import { ProfileScreen } from "./components/ProfileScreen.js";
import { StatusBanner } from "./components/StatusBanner.js";
import {
    selectFeedbackMessage,
    selectIsLoadingGame
} from "./features/game/gameSelectors.js";
import { gameActions } from "./features/game/gameSlice.js";
import { continueAsGuest, loadAuthSession, login, logout, signup } from "./features/auth/authThunks.js";
import { useGameSession } from "./features/game/useGameSession.js";
import { createGame } from "./features/game/gameThunks.js";
import { useFullscreen } from "./hooks/useFullscreen.js";
import { useGameRoute } from "./hooks/useGameRoute.js";
import { selectCurrentUser, selectIsAuthenticated } from "./features/auth/authSelectors.js";

export const App = () => {
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
    const isLoadingGame = useAppSelector(selectIsLoadingGame);
    const pageRef = useRef<HTMLElement | null>(null);
    const { toggleFullscreen } = useFullscreen(pageRef);

    const { page, navigateToCreate, navigateToGame, navigateToLobby, navigateToProfile } = useGameRoute();
    const showProfileButton = isAuthenticated && currentUser?.authType === "local" && page !== "profile";
    const showLobbyButton = isAuthenticated && page !== "lobby";
    const showLogoutButton = isAuthenticated && currentUser != null;
    useGameSession();

    useEffect(() => {
        void dispatch(loadAuthSession());
    }, [dispatch]);

    const handleFullscreen = (): void => {
        void toggleFullscreen().then(({ message }) => {
            if (message) {
                dispatch(gameActions.feedbackMessageSet(message));
            }
        });
    };

    const handleLogout = () => {
        void dispatch(logout());
    };

    const handleCreateGame = () => {
        navigateToCreate();
    };

    const handleStartGameFromCreate = () => {
        void (async () => {
            const gameId = await dispatch(createGame());
            if (gameId) {
                navigateToGame(gameId);
            }
        })();
    };

    return (
        <main className="page" ref={pageRef}>
            <header className="hero app-header">
                <div className="hero-header">
                    <div className="hero-copy">
                        <h1>Ayazian Games</h1>
                    </div>
                    <div className="hero-actions">
                        {isAuthenticated && currentUser ? <span>{currentUser.displayName}</span> : null}
                        {showProfileButton ? (
                            <button
                                type="button"
                                onClick={() => {
                                    navigateToProfile();
                                }}
                            >
                                Profile
                            </button>
                        ) : null}
                        {showLobbyButton ? (
                            <button
                                id="back-to-lobby-button"
                                type="button"
                                onClick={() => {
                                    navigateToLobby();
                                }}
                            >
                                Lobby
                            </button>
                        ) : null}
                        {showLogoutButton ? (
                            <button
                                type="button"
                                onClick={handleLogout}
                            >
                                Log Out
                            </button>
                        ) : null}
                        <button
                            id="fullscreen-button"
                            className="icon-button"
                            type="button"
                            title="Full screen"
                            aria-label="Full screen"
                            onClick={handleFullscreen}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            <section className="page-content">
                {page === "loading" ? (
                    <section className="panel">
                        <StatusBanner text="Loading..." />
                    </section>
                ) : page === "login" ? (
                    <AuthPanel
                        onContinueAsGuest={() => {
                            void dispatch(continueAsGuest());
                        }}
                        onLogin={(request) => {
                            void dispatch(login(request));
                        }}
                        onSignup={(request) => {
                            void dispatch(signup(request));
                        }}
                        onLogout={handleLogout}
                    />
                ) : page === "lobby" ? (
                    <LobbyScreen
                        feedbackMessage={feedbackMessage}
                        isLoading={isLoadingGame}
                        onCreateGame={handleCreateGame}
                        onOpenGame={(gameId) => {
                            navigateToGame(gameId);
                        }}
                    />
                ) : page === "create" ? (
                    <CreateGameScreen onStartGame={handleStartGameFromCreate} />
                ) : page === "profile" ? (
                    <section className="auth-layout">
                        <ProfileScreen />
                    </section>
                ) : (
                    <GameScreen />
                )}
            </section>

            <footer className="app-footer">
                <small>&copy; 2026 Johnathon Ayazian</small>
            </footer>
        </main>
    );
};
