import { useEffect, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { AuthPanel } from "./components/AuthPanel.js";
import { LobbyScreen } from "./components/LobbyScreen.js";
import { ProfileScreen } from "./components/ProfileScreen.js";
import { StatusBanner } from "./components/StatusBanner.js";
import {
    selectFeedbackMessage,
    selectIsLoadingGame
} from "./features/game/gameSelectors.js";
import { gameActions } from "./features/game/gameSlice.js";
import { continueAsGuest, loadAuthSession, login, logout, signup } from "./features/auth/authThunks.js";
import type { GameEntry } from "./game-entry.js";
import { useFullscreen } from "./hooks/useFullscreen.js";
import { useGameRoute } from "./hooks/useGameRoute.js";
import { selectCurrentUser, selectIsAuthenticated } from "./features/auth/authSelectors.js";
import { ravensAndDragonsGameEntry } from "./ravens-and-dragons-entry.js";

interface AppProps {
    gameEntry?: GameEntry;
}

export const App = ({ gameEntry = ravensAndDragonsGameEntry }: AppProps) => {
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
    const isLoadingGame = useAppSelector(selectIsLoadingGame);
    const pageRef = useRef<HTMLElement | null>(null);
    const { toggleFullscreen } = useFullscreen(pageRef);
    const [selectedGameSlug, setSelectedGameSlug] = useState(gameEntry.identity.slug);
    const gameEntries = useMemo(() => [gameEntry], [gameEntry]);
    const gameEntriesBySlug = useMemo(
        () => new Map(gameEntries.map((entry) => [entry.identity.slug, entry])),
        [gameEntries]
    );

    const { CreateScreen, PlayScreen } = gameEntry.components;
    const useGameSessionLifecycle = gameEntry.lifecycle.useSession;
    const { page, navigateToCreate, navigateToGame, navigateToLobby, navigateToProfile, createGameSlug } = useGameRoute(gameEntry);
    const showProfileButton = isAuthenticated && currentUser?.authType === "local" && page !== "profile";
    const showLobbyButton = isAuthenticated && page !== "lobby";
    const showLogoutButton = isAuthenticated && currentUser != null;
    useGameSessionLifecycle();

    const currentCreateGameEntry = createGameSlug ? gameEntriesBySlug.get(createGameSlug) ?? null : null;
    const selectedLobbyGameEntry = gameEntriesBySlug.get(selectedGameSlug) ?? gameEntries[0];

    useEffect(() => {
        void dispatch(loadAuthSession());
    }, [dispatch]);

    useEffect(() => {
        if (currentCreateGameEntry) {
            setSelectedGameSlug(currentCreateGameEntry.identity.slug);
        }
    }, [currentCreateGameEntry]);

    useEffect(() => {
        if (page === "create" && createGameSlug && !currentCreateGameEntry) {
            navigateToLobby("replace");
        }
    }, [createGameSlug, currentCreateGameEntry, navigateToLobby, page]);

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

    const handleStartGameFromCreate = (gameSlug: string) => {
        void (async () => {
            const gameId = await gameEntry.lifecycle.startGame(dispatch, gameSlug);
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
                        games={gameEntries.map((entry) => entry.identity)}
                        selectedGameSlug={selectedLobbyGameEntry.identity.slug}
                        feedbackMessage={feedbackMessage}
                        isLoading={isLoadingGame}
                        onCreateGame={(gameSlug) => {
                            setSelectedGameSlug(gameSlug);
                            navigateToCreate(gameSlug);
                        }}
                        onOpenGame={(gameId) => {
                            navigateToGame(gameId);
                        }}
                        onSelectGame={(gameSlug) => {
                            setSelectedGameSlug(gameSlug);
                        }}
                    />
                ) : page === "create" ? (
                    currentCreateGameEntry ? (
                        <CreateScreen
                            gameName={currentCreateGameEntry.identity.displayName}
                            onStartGame={() => {
                                handleStartGameFromCreate(currentCreateGameEntry.identity.slug);
                            }}
                        />
                    ) : (
                        <section className="panel">
                            <StatusBanner text="Loading..." />
                        </section>
                    )
                ) : page === "profile" ? (
                    <section className="auth-layout">
                        <ProfileScreen />
                    </section>
                ) : (
                    <PlayScreen />
                )}
            </section>

            <footer className="app-footer">
                <small>&copy; 2026 Johnathon Ayazian</small>
            </footer>
        </main>
    );
};
