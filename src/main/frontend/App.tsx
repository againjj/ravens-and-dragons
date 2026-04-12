import { useEffect, useRef, type CSSProperties } from "react";

import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { AuthPanel } from "./components/AuthPanel.js";
import { Board } from "./components/Board.js";
import { ControlsPanel } from "./components/ControlsPanel.js";
import { LobbyScreen } from "./components/LobbyScreen.js";
import { MoveList } from "./components/MoveList.js";
import { SeatPanel } from "./components/SeatPanel.js";
import { StatusBanner } from "./components/StatusBanner.js";
import {
    selectCurrentGameId,
    selectCurrentRuleConfiguration,
    selectFeedbackMessage,
    selectIsLoadingGame,
    selectSnapshot,
    selectStatusText
} from "./features/game/gameSelectors.js";
import { gameActions } from "./features/game/gameSlice.js";
import {
    claimSide,
    createGame,
    endGame,
    endSetup,
    selectBoardSize,
    selectRuleConfiguration,
    selectStartingSide,
    skipCapture,
    startGame,
    undoMove
} from "./features/game/gameThunks.js";
import { continueAsGuest, loadAuthSession, login, logout, signup } from "./features/auth/authThunks.js";
import { getBoardDimension, getColumnLetters } from "./game.js";
import { useGameSession } from "./features/game/useGameSession.js";
import { useBoardSizing } from "./hooks/useBoardSizing.js";
import { useFullscreen } from "./hooks/useFullscreen.js";
import { useGameRoute } from "./hooks/useGameRoute.js";
import { selectCurrentUser, selectIsAuthenticated } from "./features/auth/authSelectors.js";

export const App = () => {
    const dispatch = useAppDispatch();
    const statusText = useAppSelector(selectStatusText);
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const currentRuleConfiguration = useAppSelector(selectCurrentRuleConfiguration);
    const currentGameId = useAppSelector(selectCurrentGameId);
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
    const isLoadingGame = useAppSelector(selectIsLoadingGame);
    const snapshot = useAppSelector(selectSnapshot);
    const boardDimension = getBoardDimension(snapshot);
    const columnLetters = getColumnLetters(boardDimension);
    const boardStyle = { "--board-dimension": String(boardDimension) } as CSSProperties;
    const pageRef = useRef<HTMLElement | null>(null);
    const boardShellRef = useRef<HTMLDivElement | null>(null);
    const { toggleFullscreen } = useFullscreen(pageRef);

    const { page, navigateToGame, navigateToLobby } = useGameRoute();
    useGameSession();
    useBoardSizing(boardShellRef, page === "game");

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

    return (
        <main className="page" ref={pageRef}>
            <section className="hero">
                <div className="hero-header">
                    <div className="hero-copy">
                        <h1>Dragons vs Ravens</h1>
                    </div>
                    <div className="hero-actions">
                        {isAuthenticated && currentUser ? (
                            <>
                                <span>{currentUser.displayName}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void dispatch(logout());
                                    }}
                                >
                                    Log Out
                                </button>
                            </>
                        ) : null}
                        {page === "game" ? (
                            <button
                                id="back-to-lobby-button"
                                type="button"
                                onClick={() => {
                                    navigateToLobby();
                                }}
                            >
                                Back to Lobby
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
            </section>

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
                    onLogout={() => {
                        void dispatch(logout());
                    }}
                />
            ) : page === "lobby" ? (
                <LobbyScreen
                    feedbackMessage={feedbackMessage}
                    isLoading={isLoadingGame}
                    onCreateGame={() => {
                        void dispatch(createGame()).then((createdGameId) => {
                            if (createdGameId) {
                                navigateToGame(createdGameId, { loadGame: false });
                            }
                        });
                    }}
                    onOpenGame={(gameId) => {
                        navigateToGame(gameId);
                    }}
                />
            ) : (
                <section className="game-page">
                    <section className="panel page-header-panel game-header-panel">
                        <div className="page-header-copy">
                            <h2>{currentGameId ? `Game ${currentGameId}` : "Current Game"}</h2>
                            <StatusBanner text={statusText} />
                        </div>
                    </section>

                    <section className="game-layout">
                        <section className="panel board-panel">
                            <div className="board-shell" ref={boardShellRef}>
                                <Board />
                                <div className="board-footer">
                                    <div className="board-footer-spacer" aria-hidden="true"></div>
                                    <div className="column-labels bottom" id="column-labels-bottom" style={boardStyle}>
                                        {columnLetters.map((letter) => (
                                            <span key={letter}>{letter}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="panel side-panel top-panel">
                            <section className="controls-panel">
                                <ControlsPanel
                                    onStartGame={() => {
                                        void dispatch(startGame());
                                    }}
                                    onSelectRuleConfiguration={(ruleConfigurationId) => {
                                        void dispatch(selectRuleConfiguration(ruleConfigurationId));
                                    }}
                                    onSelectStartingSide={(side) => {
                                        void dispatch(selectStartingSide(side));
                                    }}
                                    onSelectBoardSize={(boardSize) => {
                                        void dispatch(selectBoardSize(boardSize));
                                    }}
                                    onEndSetup={() => {
                                        void dispatch(endSetup());
                                    }}
                                    onEndGame={() => {
                                        void dispatch(endGame());
                                    }}
                                    onUndo={() => {
                                        void dispatch(undoMove());
                                    }}
                                    onSkipCapture={() => {
                                        void dispatch(skipCapture());
                                    }}
                                />
                            </section>

                            <SeatPanel
                                onClaimDragons={() => {
                                    void dispatch(claimSide("dragons"));
                                }}
                                onClaimRavens={() => {
                                    void dispatch(claimSide("ravens"));
                                }}
                            />

                            <section className="legend">
                                <h2>Rules</h2>
                                {(currentRuleConfiguration?.descriptionSections ?? []).map((section, index) => (
                                    <div key={`${section.heading ?? "section"}-${index}`} className="legend-section">
                                        {section.heading ? <h3>{section.heading}</h3> : null}
                                        {section.paragraphs.map((paragraph) => (
                                            <p key={paragraph}>{paragraph}</p>
                                        ))}
                                    </div>
                                ))}
                            </section>
                        </section>

                        <section className="panel side-panel bottom-panel">
                            <MoveList />
                        </section>
                    </section>
                </section>
            )}
        </main>
    );
};
