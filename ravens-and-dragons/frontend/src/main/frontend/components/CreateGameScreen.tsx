import { useRef, useState, type CSSProperties } from "react";
import type { GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";

import { getBoardDimension, getColumnLetters } from "../board-geometry.js";
import { useRavensAndDragonsDispatch, useRavensAndDragonsSelector } from "../frontend-state.js";
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
    gameName: string;
    onStartGame?: (options?: GameStartOptions | boolean) => void | Promise<void>;
}

export const CreateGameScreen = ({ gameName, onStartGame }: CreateGameScreenProps) => {
    const dispatch = useRavensAndDragonsDispatch();
    const feedbackMessage = useRavensAndDragonsSelector(selectFeedbackMessage);
    const isSubmitting = useRavensAndDragonsSelector(selectIsSubmitting);
    const currentRuleConfiguration = useRavensAndDragonsSelector(selectCreateGameCurrentRuleConfiguration);
    const availableRuleConfigurations = useRavensAndDragonsSelector(selectCreateGameAvailableRuleConfigurations);
    const selectedRuleConfigurationId = useRavensAndDragonsSelector(selectCreateGameSelectedRuleConfigurationId);
    const selectedStartingSide = useRavensAndDragonsSelector(selectCreateGameSelectedStartingSide);
    const selectedBoardSize = useRavensAndDragonsSelector(selectCreateGameSelectedBoardSize);
    const snapshot = useRavensAndDragonsSelector(selectCreateGameSnapshot);
    const canEditBoard = useRavensAndDragonsSelector(selectCreateGameCanEditBoard);
    const [publiclyListed, setPubliclyListed] = useState(true);
    const boardShellRef = useRef<HTMLDivElement | null>(null);
    const boardDimension = getBoardDimension(snapshot);
    const columnLetters = getColumnLetters(boardDimension);
    const boardStyle = { "--board-dimension": String(boardDimension) } as CSSProperties;

    useBoardSizing(boardShellRef, true);

    return (
        <section className="game-page ravens-page">
            <h1 className="content-title">Create game: {gameName}</h1>

            <section className="game-layout create-layout">
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
                        publiclyListed={publiclyListed}
                        onPubliclyListedChange={setPubliclyListed}
                        onStartGame={onStartGame ? () => onStartGame(publiclyListed) : undefined}
                    />
                    <p className="create-feedback" aria-live="polite">
                        {feedbackMessage ?? " "}
                    </p>
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

                <section className="panel side-panel top-panel rules-bottom-panel">
                    <RulesPanel title="Rules" sections={currentRuleConfiguration?.descriptionSections ?? []} />
                </section>
            </section>
        </section>
    );
};
