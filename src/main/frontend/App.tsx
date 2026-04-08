import { useRef } from "react";

import { useAppDispatch, useAppSelector } from "./app/hooks.js";
import { Board } from "./components/Board.js";
import { ControlsPanel } from "./components/ControlsPanel.js";
import { MoveList } from "./components/MoveList.js";
import { StatusBanner } from "./components/StatusBanner.js";
import { selectCurrentRuleConfiguration, selectStatusText } from "./features/game/gameSelectors.js";
import { gameActions } from "./features/game/gameSlice.js";
import {
    endGame,
    endSetup,
    selectRuleConfiguration,
    selectStartingSide,
    skipCapture,
    startGame,
    undoMove
} from "./features/game/gameThunks.js";
import { columnLetters } from "./game.js";
import { useGameSession } from "./features/game/useGameSession.js";
import { useBoardSizing } from "./hooks/useBoardSizing.js";
import { useFullscreen } from "./hooks/useFullscreen.js";

export const App = () => {
    const dispatch = useAppDispatch();
    const statusText = useAppSelector(selectStatusText);
    const currentRuleConfiguration = useAppSelector(selectCurrentRuleConfiguration);
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
        </main>
    );
};
