import { useRef, type CSSProperties } from "react";

import { getBoardDimension, getColumnLetters } from "../board-geometry.js";
import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import {
    selectCurrentGameId,
    selectCurrentRuleConfiguration,
    selectSnapshot,
    selectStatusText
} from "../features/game/gameSelectors.js";
import {
    claimSide,
    endGame,
    endSetup,
    selectBoardSize,
    selectRuleConfiguration,
    selectStartingSide,
    skipCapture,
    startGame,
    undoMove
} from "../features/game/gameThunks.js";
import { useBoardSizing } from "../hooks/useBoardSizing.js";
import { Board } from "./Board.js";
import { ControlsPanel } from "./ControlsPanel.js";
import { MoveList } from "./MoveList.js";
import { SeatPanel } from "./SeatPanel.js";
import { StatusBanner } from "./StatusBanner.js";

export const GameScreen = () => {
    const dispatch = useAppDispatch();
    const currentGameId = useAppSelector(selectCurrentGameId);
    const currentRuleConfiguration = useAppSelector(selectCurrentRuleConfiguration);
    const snapshot = useAppSelector(selectSnapshot);
    const statusText = useAppSelector(selectStatusText);
    const boardShellRef = useRef<HTMLDivElement | null>(null);
    const boardDimension = getBoardDimension(snapshot);
    const columnLetters = getColumnLetters(boardDimension);
    const boardStyle = { "--board-dimension": String(boardDimension) } as CSSProperties;

    useBoardSizing(boardShellRef, true);

    return (
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
    );
};
