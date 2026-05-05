import { useRef, type CSSProperties } from "react";

import { getBoardDimension, getColumnLetters } from "../board-geometry.js";
import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { BoardView } from "./Board.js";
import { GameSetupControls } from "./GameSetupControls.js";
import { RulesPanel } from "./RulesPanel.js";
import {
    selectCreateGameAvailableRuleConfigurations,
    selectCreateGameCanEditBoard,
    selectCreateGameCurrentRuleConfiguration,
    selectCreateGameSelectedBoardSize,
    selectCreateGameSelectedRuleConfigurationId,
    selectCreateGameSelectedStartingSide,
    selectCreateGameSnapshot
} from "../features/game/createGameSelectors.js";
import { createGameDraftActions } from "../features/game/createGameSlice.js";
import { selectFeedbackMessage, selectIsSubmitting } from "../features/game/gameSelectors.js";
import { useBoardSizing } from "../hooks/useBoardSizing.js";

interface CreateGameScreenProps {
    onStartGame?: () => void | Promise<void>;
}

export const CreateGameScreen = ({ onStartGame }: CreateGameScreenProps = {}) => {
    const dispatch = useAppDispatch();
    const feedbackMessage = useAppSelector(selectFeedbackMessage);
    const isSubmitting = useAppSelector(selectIsSubmitting);
    const currentRuleConfiguration = useAppSelector(selectCreateGameCurrentRuleConfiguration);
    const availableRuleConfigurations = useAppSelector(selectCreateGameAvailableRuleConfigurations);
    const selectedRuleConfigurationId = useAppSelector(selectCreateGameSelectedRuleConfigurationId);
    const selectedStartingSide = useAppSelector(selectCreateGameSelectedStartingSide);
    const selectedBoardSize = useAppSelector(selectCreateGameSelectedBoardSize);
    const snapshot = useAppSelector(selectCreateGameSnapshot);
    const canEditBoard = useAppSelector(selectCreateGameCanEditBoard);
    const boardShellRef = useRef<HTMLDivElement | null>(null);
    const boardDimension = getBoardDimension(snapshot);
    const columnLetters = getColumnLetters(boardDimension);
    const boardStyle = { "--board-dimension": String(boardDimension) } as CSSProperties;

    useBoardSizing(boardShellRef, true);

    return (
        <section className="game-page create-game-page">
            <h1 className="content-title">Ravens and Dragons</h1>

            <section className="game-layout create-layout">
                <section className="panel page-header-panel game-header-panel create-header-panel layout-info-panel">
                    <div className="page-header-copy">
                        <h2>Create Game</h2>
                        <p>Configure and start your game.</p>
                    </div>
                </section>

                <section className="panel board-panel">
                    <div className="board-shell" ref={boardShellRef}>
                        <BoardView
                            snapshot={snapshot}
                            selectedSquare={null}
                            canViewerAct={canEditBoard}
                            capturableSquares={[]}
                            targetableSquares={[]}
                            onCycleSetupSquare={(square) => {
                                void dispatch(createGameDraftActions.setupSquareCycled(square));
                            }}
                        />
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

                <section className="panel side-panel top-panel create-config-panel">
                    <div className="page-header-copy">
                        <h2>Configuration</h2>
                    </div>
                    <GameSetupControls
                        availableRuleConfigurations={availableRuleConfigurations}
                        selectedRuleConfigurationId={selectedRuleConfigurationId}
                        selectedStartingSide={selectedStartingSide}
                        selectedBoardSize={selectedBoardSize}
                        isDisabled={isSubmitting}
                        onSelectRuleConfiguration={(ruleConfigurationId) => {
                            void dispatch(createGameDraftActions.ruleConfigurationSelected(ruleConfigurationId));
                        }}
                        onSelectStartingSide={(side) => {
                            dispatch(createGameDraftActions.startingSideSelected(side));
                        }}
                        onSelectBoardSize={(boardSize) => {
                            dispatch(createGameDraftActions.boardSizeSelected(boardSize));
                        }}
                        startGameHint={
                            selectedRuleConfigurationId === "free-play" ? (
                                <p className="create-draft-note">Place the pieces before starting the game.</p>
                            ) : null
                        }
                        onStartGame={onStartGame}
                    />
                    <p className="create-feedback" aria-live="polite">
                        {feedbackMessage ?? " "}
                    </p>
                </section>

                <section className="panel side-panel top-panel create-rules-panel rules-bottom-panel">
                    <RulesPanel title="Rules" sections={currentRuleConfiguration?.descriptionSections ?? []} />
                </section>
            </section>
        </section>
    );
};
