import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { AuthPanel } from "./components/AuthPanel.js";
import { LobbyScreen, type PublicGameListing } from "./components/LobbyScreen.js";
import { ProfileScreen } from "./components/ProfileScreen.js";
import { StatusBanner } from "./components/StatusBanner.js";
import {
    selectFeedbackMessage,
    selectIsLoadingGame
} from "../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game/gameSelectors.js";
import { gameActions } from "../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game/gameSlice.js";
import { continueAsGuest, loadAuthSession, login, logout, signup } from "./features/auth/authThunks.js";
import type { GameEntry } from "@ravensanddragons/platform-frontend/game-entry";
import { useFullscreen } from "@ravensanddragons/platform-frontend/hooks/useFullscreen";
import type { AppDispatch } from "./app/store.js";
import { useGameRoute } from "./hooks/useGameRoute.js";
import { selectCurrentUser, selectIsAuthenticated } from "./features/auth/authSelectors.js";
import { clickerGameEntry } from "../../../../../clicker/clicker-frontend/src/main/frontend/clicker-entry.js";
import { ravensAndDragonsGameEntry } from "../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/ravens-and-dragons-entry.js";

interface AppProps {
    gameEntries?: GameEntry<AppDispatch>[];
}

const registeredGameEntries: GameEntry<AppDispatch>[] = [ravensAndDragonsGameEntry, clickerGameEntry];

const fetchPublicGames = async (): Promise<PublicGameListing[]> => {
    const response = await fetch("/api/games/public");
    if (!response.ok) {
        throw new Error("Unable to load public games.");
    }
    const payload = await response.json() as unknown;
    return Array.isArray(payload) ? payload as PublicGameListing[] : [];
};

const useGameSessionLifecycles = (gameEntries: GameEntry<AppDispatch>[]) => {
    gameEntries.forEach((entry) => {
        entry.lifecycle.useSession();
    });
};

export const App = ({ gameEntries = registeredGameEntries }: AppProps) => {
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
    const isLoadingGame = useAppSelector(selectIsLoadingGame);
    const pageRef = useRef<HTMLElement | null>(null);
    const { toggleFullscreen } = useFullscreen(pageRef);
    const [selectedGameSlug, setSelectedGameSlug] = useState(gameEntries[0].identity.slug);
    const [publicGames, setPublicGames] = useState<PublicGameListing[]>([]);
    const [lobbyOpenErrorMessage, setLobbyOpenErrorMessage] = useState<string | null>(null);
    const gameEntriesBySlug = useMemo(
        () => new Map(gameEntries.map((entry) => [entry.identity.slug, entry])),
        [gameEntries]
    );
    const activeGameEntry = gameEntriesBySlug.get(selectedGameSlug) ?? gameEntries[0];

    const { PlayScreen } = activeGameEntry.components;
    const { page, navigateToCreate, navigateToGame, navigateToLobby, navigateToProfile, openGameFromLobby, createGameSlug } = useGameRoute(
        gameEntries,
        activeGameEntry,
        setSelectedGameSlug
    );
    const showProfileButton = isAuthenticated && currentUser?.authType === "local" && page !== "profile";
    const showLobbyButton = isAuthenticated && page !== "lobby";
    const showLogoutButton = isAuthenticated && currentUser != null;
    useGameSessionLifecycles(gameEntries);

    const currentCreateGameEntry = createGameSlug ? gameEntriesBySlug.get(createGameSlug) ?? null : null;
    const CurrentCreateScreen = currentCreateGameEntry?.components.CreateScreen ?? null;
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

    const loadPublicGames = useCallback(() => {
        void fetchPublicGames()
            .then(setPublicGames)
            .catch(() => {
                setPublicGames([]);
            });
    }, []);

    useEffect(() => {
        if (page === "lobby") {
            loadPublicGames();
        }
    }, [loadPublicGames, page]);

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

    const handleStartGameFromCreate = (gameSlug: string, publiclyListed = true) => {
        void (async () => {
            const gameId = await (gameEntriesBySlug.get(gameSlug) ?? activeGameEntry).lifecycle.startGame(dispatch, gameSlug, {
                publiclyListed
            });
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
                        publicGames={publicGames}
                        selectedGameSlug={selectedLobbyGameEntry.identity.slug}
                        feedbackMessage={feedbackMessage}
                        openErrorMessage={lobbyOpenErrorMessage}
                        isLoading={isLoadingGame}
                        onCreateGame={(gameSlug) => {
                            setLobbyOpenErrorMessage(null);
                            setSelectedGameSlug(gameSlug);
                            navigateToCreate(gameSlug);
                        }}
                        onDismissOpenError={() => {
                            setLobbyOpenErrorMessage(null);
                        }}
                        onOpenGame={(gameId) => {
                            void openGameFromLobby(gameId).then((result) => {
                                setLobbyOpenErrorMessage(result.errorMessage ?? null);
                            });
                        }}
                        onSelectGame={(gameSlug) => {
                            setSelectedGameSlug(gameSlug);
                        }}
                    />
                ) : page === "create" ? (
                    currentCreateGameEntry && CurrentCreateScreen ? (
                        <CurrentCreateScreen
                            gameName={currentCreateGameEntry.identity.displayName}
                            onStartGame={(publiclyListed) => {
                                handleStartGameFromCreate(currentCreateGameEntry.identity.slug, publiclyListed);
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
