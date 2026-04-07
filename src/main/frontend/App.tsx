import { useRef } from "react";

import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { Board } from "./components/Board.js";
import { ControlsPanel } from "./components/ControlsPanel.js";
import { MoveList } from "./components/MoveList.js";
import { StatusBanner } from "./components/StatusBanner.js";
import { selectStatusText } from "./features/game/gameSelectors.js";
import { gameActions } from "./features/game/gameSlice.js";
import { beginGame, resetGame, skipCapture, undoMove } from "./features/game/gameThunks.js";
import { useGameSession } from "./features/game/useGameSession.js";
import { useBoardSizing } from "./hooks/useBoardSizing.js";
import { useFullscreen } from "./hooks/useFullscreen.js";

export const App = () => {
    const dispatch = useAppDispatch();
    const statusText = useAppSelector(selectStatusText);
    const pageRef = useRef<HTMLElement | null>(null);
    const boardShellRef = useRef<HTMLDivElement | null>(null);
    const { toggleFullscreen } = useFullscreen(pageRef);

    useGameSession();
    useBoardSizing(boardShellRef);

    const handleFullscreen = (): void => {
        void toggleFullscreen().then(({ message }) => {
            if (message) {
                dispatch(gameActions.feedbackMessageSet(message));
            }
        });
    };

    const handleStartGame = (): void => {
        void dispatch(beginGame());
    };

    const handleResetGame = (): void => {
        void dispatch(resetGame());
    };

    const handleSkipCapture = (): void => {
        void dispatch(skipCapture());
    };

    const handleUndo = (): void => {
        void dispatch(undoMove());
    };

    return (
        <main className="page" ref={pageRef}>
            <section className="hero">
                <div className="hero-header">
                    <h1>Dragons vs Ravens</h1>
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
            </section>

            <section className="game-layout">
                <section className="panel board-panel">
                    <StatusBanner text={statusText} />
                    <div className="board-shell" ref={boardShellRef}>
                        <Board />
                        <div className="board-footer">
                            <div className="board-footer-spacer" aria-hidden="true"></div>
                            <div className="column-labels bottom" id="column-labels-bottom">
                                {Array.from({ length: 9 }, (_, index) => (
                                    <span key={index + 1}>{index + 1}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="panel side-panel top-panel">
                    <section className="legend">
                        <p className="subtitle sidebar-intro">
                            Place dragons and ravens during setup, then alternate turns. Dragons may move the gold on their turns.
                        </p>
                    </section>

                    <section className="controls-panel">
                        <ControlsPanel
                            onStartGame={handleStartGame}
                            onUndo={handleUndo}
                            onResetGame={handleResetGame}
                            onSkipCapture={handleSkipCapture}
                        />
                    </section>

                    <section className="legend">
                        <h2>Setup</h2>
                        <p>Click an empty square to cycle through dragon, raven, then empty. The gold begins in the center at e5.</p>
                    </section>

                    <section className="legend">
                        <h2>Turns</h2>
                        <p>On a dragon turn, you may move a dragon or the gold. On a raven turn, move a raven. After moving, you may capture one opposing piece.</p>
                    </section>
                </section>

                <section className="panel side-panel bottom-panel">
                    <MoveList />
                </section>
            </section>
        </main>
    );
};
