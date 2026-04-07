import { useAppSelector } from "../app/hooks.js";
import { selectCanUndo, selectIsSubmitting, selectSnapshot } from "../features/game/gameSelectors.js";

interface ControlsPanelProps {
    onStartGame: () => void;
    onEndSetup: () => void;
    onEndGame: () => void;
    onUndo: () => void;
    onSkipCapture: () => void;
}

export const ControlsPanel = ({
    onStartGame,
    onEndSetup,
    onEndGame,
    onUndo,
    onSkipCapture
}: ControlsPanelProps) => {
    const snapshot = useAppSelector(selectSnapshot);
    const canUndo = useAppSelector(selectCanUndo);
    const isSubmitting = useAppSelector(selectIsSubmitting);
    const disabled = !snapshot || isSubmitting;
    const phase = snapshot?.phase;
    const isActivePlay = phase === "move" || phase === "capture";
    const canSkipCapture = phase === "capture";

    return (
        <div className="controls controls-sidebar">
            {phase === "none" ? (
                <button
                    id="start-button"
                    type="button"
                    disabled={disabled}
                    onClick={onStartGame}
                >
                    Start Game
                </button>
            ) : null}
            {phase === "setup" ? (
                <button
                    id="end-setup-button"
                    type="button"
                    disabled={disabled}
                    onClick={onEndSetup}
                >
                    End Setup
                </button>
            ) : null}
            {isActivePlay ? (
                <>
                    <button
                        id="capture-skip-button"
                        type="button"
                        disabled={disabled || !canSkipCapture}
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
                        id="end-game-button"
                        type="button"
                        disabled={disabled}
                        onClick={onEndGame}
                    >
                        End Game
                    </button>
                </>
            ) : null}
        </div>
    );
};
