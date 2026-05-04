import { useAppSelector } from "../app/hooks.js";
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
    const snapshot = useAppSelector(selectSnapshot);
    const canViewerAct = useAppSelector(selectCanViewerAct);
    const canViewerUndo = useAppSelector(selectCanViewerUndo);
    const hasBotSeat = useAppSelector(selectHasBotSeat);
    const isSubmitting = useAppSelector(selectIsSubmitting);
    const isFinishedGame = useAppSelector(selectIsFinishedGame);
    const currentRuleConfiguration = useAppSelector(selectCurrentRuleConfiguration);
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
