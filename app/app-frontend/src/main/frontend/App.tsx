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
import { continueAsGuest, loadAuthSession, login, logout, signup, signedOutSession } from "./features/auth/authThunks.js";
import type { GameEntry } from "@ravensanddragons/platform-frontend/game-entry";
import { useFullscreen } from "@ravensanddragons/platform-frontend/hooks/useFullscreen";
import type { AppDispatch } from "./app/store.js";
import { useGameRoute } from "./hooks/useGameRoute.js";
import { selectCurrentUser, selectIsAuthenticated, selectOAuthProviders } from "./features/auth/authSelectors.js";
import { authActions } from "./features/auth/authSlice.js";
import { fetchPlayerGames, openPlayerGamesStream, type PlayerGameListing } from "./features/playerGames/playerGamesClient.js";
import { clickerGameEntry } from "../../../../../clicker/clicker-frontend/src/main/frontend/clicker-entry.js";
import { ravensAndDragonsGameEntry } from "../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/ravens-and-dragons-entry.js";
import {
    authSessionExpiredEventType,
    createResponseError,
    isServerUnavailableError,
    isUnauthorizedError,
    notifyAuthSessionExpired,
    notifyServerUnavailable,
    serverUnavailableEventType,
    serverUnavailableMessage,
    sessionExpiredMessage
} from "@ravensanddragons/platform-frontend/api-client";

interface AppProps {
    gameEntries?: GameEntry<AppDispatch>[];
}

const registeredGameEntries: GameEntry<AppDispatch>[] = [ravensAndDragonsGameEntry, clickerGameEntry];

const fetchPublicGames = async (): Promise<PublicGameListing[]> => {
    const response = await fetch("/api/games/public");
    if (!response.ok) {
        throw await createResponseError(response, "Unable to load public games.");
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
    const oauthProviders = useAppSelector(selectOAuthProviders);
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
    const isLoadingGame = useAppSelector(selectIsLoadingGame);
    const pageRef = useRef<HTMLElement | null>(null);
    const userMenuRef = useRef<HTMLDivElement | null>(null);
    const { toggleFullscreen } = useFullscreen(pageRef);
    const [selectedGameSlug, setSelectedGameSlug] = useState(gameEntries[0].identity.slug);
    const [publicGames, setPublicGames] = useState<PublicGameListing[]>([]);
    const [playerGames, setPlayerGames] = useState<PlayerGameListing[]>([]);
    const [isPlayerGamesStreamPaused, setIsPlayerGamesStreamPaused] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [lobbyOpenErrorMessage, setLobbyOpenErrorMessage] = useState<string | null>(null);
    const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
    const gameEntriesBySlug = useMemo(
        () => new Map(gameEntries.map((entry) => [entry.identity.slug, entry])),
        [gameEntries]
    );
    const activeGameEntry = gameEntriesBySlug.get(selectedGameSlug) ?? gameEntries[0];

    const { PlayScreen } = activeGameEntry.components;
    const handleAuthExpired = useCallback(() => {
        setIsUserMenuOpen(false);
        dispatch(authActions.authSessionSet(signedOutSession(oauthProviders)));
        dispatch(authActions.authFeedbackMessageSet(sessionExpiredMessage));
    }, [dispatch, oauthProviders]);
    const handleServerUnavailable = useCallback(() => {
        setServerErrorMessage(serverUnavailableMessage);
    }, []);
    const { page, navigateToCreate, navigateToGame, navigateToLobby, navigateToProfile, openGameFromLobby, createGameSlug, currentGameId } = useGameRoute(
        gameEntries,
        activeGameEntry,
        setSelectedGameSlug
    );
    const showProfileLink = isAuthenticated && currentUser?.authType === "local";
    const currentUserId = currentUser?.id ?? null;
    const userTurnCount = playerGames.filter((game) => game.isCurrentUserTurn).length;
    useGameSessionLifecycles(gameEntries);

    const currentCreateGameEntry = createGameSlug ? gameEntriesBySlug.get(createGameSlug) ?? null : null;
    const CurrentCreateScreen = currentCreateGameEntry?.components.CreateScreen ?? null;
    const selectedLobbyGameEntry = gameEntriesBySlug.get(selectedGameSlug) ?? gameEntries[0];

    useEffect(() => {
        void dispatch(loadAuthSession());
    }, [dispatch]);

    useEffect(() => {
        const onAuthExpired = () => {
            handleAuthExpired();
        };
        const onServerUnavailable = () => {
            handleServerUnavailable();
        };
        window.addEventListener(authSessionExpiredEventType, onAuthExpired);
        window.addEventListener(serverUnavailableEventType, onServerUnavailable);
        return () => {
            window.removeEventListener(authSessionExpiredEventType, onAuthExpired);
            window.removeEventListener(serverUnavailableEventType, onServerUnavailable);
        };
    }, [handleAuthExpired, handleServerUnavailable]);

    useEffect(() => {
        if (!isAuthenticated || !currentUserId) {
            setPlayerGames([]);
            setIsUserMenuOpen(false);
            setIsPlayerGamesStreamPaused(false);
            return;
        }
    }, [currentUserId, isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated || !currentUserId || isPlayerGamesStreamPaused) {
            return;
        }

        let isMounted = true;
        let closeStream = () => {};
        void fetchPlayerGames()
            .then((games) => {
                if (isMounted) {
                    setPlayerGames(games);
                    closeStream = openPlayerGamesStream((updatedGames) => {
                        if (isMounted) {
                            setPlayerGames(updatedGames);
                        }
                    }, () => {
                        if (isMounted) {
                            setIsPlayerGamesStreamPaused(true);
                            notifyServerUnavailable();
                        }
                    });
                }
            })
            .catch((error) => {
                if (isMounted) {
                    if (isUnauthorizedError(error)) {
                        notifyAuthSessionExpired();
                    } else if (isServerUnavailableError(error)) {
                        setIsPlayerGamesStreamPaused(true);
                        notifyServerUnavailable();
                    } else {
                        setLobbyOpenErrorMessage(error instanceof Error ? error.message : "Unable to load your games.");
                    }
                }
            });
        return () => {
            isMounted = false;
            closeStream();
        };
    }, [currentUserId, isAuthenticated, isPlayerGamesStreamPaused]);

    useEffect(() => {
        if (currentCreateGameEntry) {
            setSelectedGameSlug(currentCreateGameEntry.identity.slug);
        }
    }, [currentCreateGameEntry]);

    useEffect(() => {
        if (!isUserMenuOpen) {
            return;
        }

        const closeOnOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && userMenuRef.current?.contains(target)) {
                return;
            }
            setIsUserMenuOpen(false);
        };

        document.addEventListener("pointerdown", closeOnOutsidePointerDown);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
        };
    }, [isUserMenuOpen]);

    useEffect(() => {
        if (page === "create" && createGameSlug && !currentCreateGameEntry) {
            navigateToLobby("replace");
        }
    }, [createGameSlug, currentCreateGameEntry, navigateToLobby, page]);

    const loadPublicGames = useCallback(() => {
        void fetchPublicGames()
            .then(setPublicGames)
            .catch((error) => {
                if (isUnauthorizedError(error)) {
                    notifyAuthSessionExpired();
                    return;
                }
                if (isServerUnavailableError(error)) {
                    notifyServerUnavailable();
                    return;
                }
                setLobbyOpenErrorMessage(error instanceof Error ? error.message : "Unable to load public games.");
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
        setIsUserMenuOpen(false);
        void dispatch(logout());
    };

    const handleStartGameFromCreate = (gameSlug: string, publiclyListed = true) => {
        void (async () => {
            try {
                const gameId = await (gameEntriesBySlug.get(gameSlug) ?? activeGameEntry).lifecycle.startGame(dispatch, gameSlug, {
                    publiclyListed
                });
                if (gameId) {
                    navigateToGame(gameId);
                }
            } catch (error) {
                if (isUnauthorizedError(error)) {
                    notifyAuthSessionExpired();
                    return;
                }
                if (isServerUnavailableError(error)) {
                    notifyServerUnavailable();
                    return;
                }
                setLobbyOpenErrorMessage(error instanceof Error ? error.message : "Unable to start a game right now.");
            }
        })();
    };

    return (
        <main className="page" ref={pageRef}>
            <header className="hero app-header">
                <div className="hero-header">
                    <div className="hero-copy">
                        <h1>
                            {page === "login" ? (
                                <span className="header-home-link">Ayazian Games</span>
                            ) : (
                                <a
                                    className="header-home-link"
                                    href="/lobby"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        navigateToLobby();
                                    }}
                                >
                                    Ayazian Games
                                </a>
                            )}
                        </h1>
                    </div>
                    <div className="hero-actions">
                        {isAuthenticated && currentUser ? (
                            <div className="user-menu-shell" ref={userMenuRef}>
                                <div className="user-menu">
                                    <button
                                        type="button"
                                        className="user-menu-trigger"
                                        aria-haspopup="menu"
                                        aria-expanded={isUserMenuOpen}
                                        onClick={() => {
                                            if (isPlayerGamesStreamPaused) {
                                                setIsPlayerGamesStreamPaused(false);
                                            }
                                            setIsUserMenuOpen((open) => !open);
                                        }}
                                    >
                                        <span className="user-menu-name">{currentUser.displayName}</span>
                                        {userTurnCount > 0 ? (
                                            <span className="turn-count-badge" aria-hidden="true">{userTurnCount}</span>
                                        ) : null}
                                        <span className="user-menu-caret" aria-hidden="true" />
                                    </button>
                                    {isUserMenuOpen ? (
                                        <div className="user-menu-panel" role="menu">
                                            {showProfileLink ? (
                                                <a
                                                    className={page === "profile" ? "is-current-page" : undefined}
                                                    href="/profile"
                                                    role="menuitem"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        setIsUserMenuOpen(false);
                                                        navigateToProfile();
                                                    }}
                                                >
                                                    Profile
                                                </a>
                                            ) : null}
                                            <a
                                                className={page === "lobby" ? "is-current-page" : undefined}
                                                href="/lobby"
                                                role="menuitem"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    setIsUserMenuOpen(false);
                                                    navigateToLobby();
                                                }}
                                            >
                                                Lobby
                                            </a>
                                            <div className="user-menu-separator" role="separator" />
                                            {playerGames.map((game) => (
                                                <a
                                                    key={game.gameId}
                                                    className={page === "game" && currentGameId === game.gameId ? "is-current-page" : undefined}
                                                    href={`/g/${encodeURIComponent(game.gameId)}`}
                                                    role="menuitem"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        setIsUserMenuOpen(false);
                                                        void openGameFromLobby(game.gameId);
                                                    }}
                                                >
                                                    {game.isCurrentUserTurn ? (
                                                        <span className="your-turn-badge">
                                                            <span>Your</span>
                                                            <span>Turn</span>
                                                        </span>
                                                    ) : null}
                                                    <span>{game.gameName}: {game.gameId}</span>
                                                </a>
                                            ))}
                                            {playerGames.length > 0 ? <div className="user-menu-separator" role="separator" /> : null}
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="user-menu-action"
                                                onClick={handleLogout}
                                            >
                                                Log Out
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
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
            {serverErrorMessage ? (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onClick={() => {
                        setServerErrorMessage(null);
                    }}
                >
                    <section
                        className="panel modal-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="server-error-title"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <h2 id="server-error-title">Server Unavailable</h2>
                        <p>{serverErrorMessage}</p>
                        <button
                            type="button"
                            onClick={() => {
                                setServerErrorMessage(null);
                            }}
                        >
                            OK
                        </button>
                    </section>
                </div>
            ) : null}
        </main>
    );
};
