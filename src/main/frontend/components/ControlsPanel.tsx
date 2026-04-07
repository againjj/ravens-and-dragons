import { useAppSelector } from "../app/hooks.js";
import { selectCanUndo, selectIsSubmitting, selectSnapshot } from "../features/game/gameSelectors.js";

interface ControlsPanelProps {
    onStartGame: () => void;
    onUndo: () => void;
    onResetGame: () => void;
    onSkipCapture: () => void;
}

export const ControlsPanel = ({
    onStartGame,
    onUndo,
    onResetGame,
    onSkipCapture
}: ControlsPanelProps) => {
    const snapshot = useAppSelector(selectSnapshot);
    const canUndo = useAppSelector(selectCanUndo);
    const isSubmitting = useAppSelector(selectIsSubmitting);
    const disabled = !snapshot || isSubmitting;

    return (
        <div className="controls controls-sidebar">
            <button
                id="start-button"
                type="button"
                disabled={disabled || snapshot.phase !== "setup"}
                onClick={onStartGame}
            >
                Start Game
            </button>
            <button
                id="capture-skip-button"
                type="button"
                disabled={disabled || snapshot.phase !== "capture"}
                onClick={onSkipCapture}
            >
                Skip Capture
            </button>
            <button
                id="undo-button"
                type="button"
                disabled={disabled || !canUndo}
                onClick={onUndo}
            >
                Undo
            </button>
            <button
                id="reset-button"
                type="button"
                disabled={disabled}
                onClick={onResetGame}
            >
                Reset to Setup
            </button>
        </div>
    );
};
