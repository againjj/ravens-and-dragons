import { useRef, type CSSProperties } from "react";

import { getBoardDimension, getColumnLetters } from "../board-geometry.js";
import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import {
    selectCurrentGameId,
    selectCurrentRuleConfiguration,
    selectFeedbackMessage,
    selectSnapshot,
    selectStatusText
} from "../features/game/gameSelectors.js";
import { gameActions } from "../features/game/gameSlice.js";
import {
    assignBotOpponent,
    claimSide,
    endGame,
    skipCapture,
    undoMove
} from "../features/game/gameThunks.js";
import { useBoardSizing } from "../hooks/useBoardSizing.js";
import { Board } from "./Board.js";
import { ControlsPanel } from "./ControlsPanel.js";
import { MoveList } from "./MoveList.js";
import { SeatPanel } from "./SeatPanel.js";
import { RulesPanel } from "./RulesPanel.js";
import { StatusBanner } from "./StatusBanner.js";

export const GameScreen = () => {
    const dispatch = useAppDispatch();
    const currentGameId = useAppSelector(selectCurrentGameId);
    const currentRuleConfiguration = useAppSelector(selectCurrentRuleConfiguration);
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
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
                    <SeatPanel
                        onAssignBotOpponent={(botId) => {
                            void dispatch(assignBotOpponent(botId));
                        }}
                        onClaimDragons={() => {
                            void dispatch(claimSide("dragons"));
                        }}
                        onClaimRavens={() => {
                            void dispatch(claimSide("ravens"));
                        }}
                    />
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

                <section className="panel side-panel turns-panel">
                    <div className="turns-panel-header">
                        <h2>Move List</h2>
                        <ControlsPanel
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
                    </div>

                    <MoveList />
                </section>

                <section className="panel side-panel top-panel">
                    <RulesPanel sections={currentRuleConfiguration?.descriptionSections ?? []} />
                </section>
            </section>

            {feedbackMessage ? (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onClick={() => {
                        dispatch(gameActions.feedbackMessageSet(null));
                    }}
                >
                    <section
                        className="panel modal-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="game-feedback-title"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <h2 id="game-feedback-title">Action Error</h2>
                        <p>{feedbackMessage}</p>
                        <button
                            type="button"
                            onClick={() => {
                                dispatch(gameActions.feedbackMessageSet(null));
                            }}
                        >
                            OK
                        </button>
                    </section>
                </div>
            ) : null}
        </section>
    );
};
