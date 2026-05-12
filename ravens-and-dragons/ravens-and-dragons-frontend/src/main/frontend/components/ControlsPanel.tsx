import { useRavensAndDragonsSelector } from "../frontend-state.js";
import {
    selectCanViewerAct,
    selectCanViewerUndo,
    selectCurrentRuleConfiguration,
    selectHasBotSeat,
    selectIsFinishedGame,
    selectIsSubmitting,
    selectSnapshot
} from "../features/game/gameSelectors.js";

interface ControlsPanelProps {
    onEndGame: () => void;
    onUndo: () => void;
    onSkipCapture: () => void;
}

export const ControlsPanel = ({
    onEndGame,
    onUndo,
    onSkipCapture
}: ControlsPanelProps) => {
    const snapshot = useRavensAndDragonsSelector(selectSnapshot);
    const canViewerAct = useRavensAndDragonsSelector(selectCanViewerAct);
    const canViewerUndo = useRavensAndDragonsSelector(selectCanViewerUndo);
    const hasBotSeat = useRavensAndDragonsSelector(selectHasBotSeat);
    const isSubmitting = useRavensAndDragonsSelector(selectIsSubmitting);
    const isFinishedGame = useRavensAndDragonsSelector(selectIsFinishedGame);
    const currentRuleConfiguration = useRavensAndDragonsSelector(selectCurrentRuleConfiguration);
    const disabled = !snapshot || isSubmitting || !canViewerAct;
    const phase = snapshot?.phase;
    const isActivePlay = phase === "move" || phase === "capture";
    const canSkipCapture = phase === "capture" && currentRuleConfiguration?.hasManualCapture;
    const canManualEndGame = isActivePlay && currentRuleConfiguration?.hasManualEndGame;
    const showUndo = (isActivePlay || isFinishedGame) && !!snapshot;
    const undoButton = (
        <button
            id="undo-button"
            type="button"
            disabled={isSubmitting || !canViewerUndo}
            onClick={onUndo}
        >
            Undo
        </button>
    );

    return (
        <div className="controls controls-sidebar">
            {isActivePlay ? (
                <>
                    {currentRuleConfiguration?.hasManualCapture ? (
                        <button
                            id="capture-skip-button"
                            type="button"
                            disabled={disabled || !canSkipCapture}
                            onClick={onSkipCapture}
                        >
                            Skip Capture
                        </button>
                    ) : null}
                    {showUndo ? undoButton : null}
                    {canManualEndGame ? (
                        <button
                            id="end-game-button"
                            type="button"
                            disabled={disabled}
                            onClick={onEndGame}
                        >
                            End Game
                        </button>
                    ) : null}
                </>
            ) : null}
            {showUndo && !isActivePlay ? undoButton : null}
        </div>
    );
};
