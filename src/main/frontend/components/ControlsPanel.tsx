import { useAppSelector } from "../app/hooks.js";
import {
    selectAvailableRuleConfigurations,
    selectCanViewerAct,
    selectCanViewerUndo,
    selectCurrentRuleConfiguration,
    selectIsFinishedGame,
    selectIsSubmitting,
    selectSelectedBoardSize,
    selectSelectedRuleConfigurationId,
    selectSelectedStartingSide,
    selectShowOwnedPreGameControls,
    selectSnapshot
} from "../features/game/gameSelectors.js";
import type { Side } from "../game.js";

interface ControlsPanelProps {
    onStartGame: () => void;
    onSelectRuleConfiguration: (ruleConfigurationId: string) => void;
    onSelectStartingSide: (side: Side) => void;
    onSelectBoardSize: (boardSize: number) => void;
    onEndSetup: () => void;
    onEndGame: () => void;
    onUndo: () => void;
    onSkipCapture: () => void;
}

export const ControlsPanel = ({
    onStartGame,
    onSelectRuleConfiguration,
    onSelectStartingSide,
    onSelectBoardSize,
    onEndSetup,
    onEndGame,
    onUndo,
    onSkipCapture
}: ControlsPanelProps) => {
    const snapshot = useAppSelector(selectSnapshot);
    const canViewerAct = useAppSelector(selectCanViewerAct);
    const canViewerUndo = useAppSelector(selectCanViewerUndo);
    const isSubmitting = useAppSelector(selectIsSubmitting);
    const showPreGameControls = useAppSelector(selectShowOwnedPreGameControls);
    const isFinishedGame = useAppSelector(selectIsFinishedGame);
    const availableRuleConfigurations = useAppSelector(selectAvailableRuleConfigurations);
    const currentRuleConfiguration = useAppSelector(selectCurrentRuleConfiguration);
    const selectedRuleConfigurationId = useAppSelector(selectSelectedRuleConfigurationId);
    const selectedStartingSide = useAppSelector(selectSelectedStartingSide);
    const selectedBoardSize = useAppSelector(selectSelectedBoardSize);
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
            {showPreGameControls ? (
                <>
                    <div className="control-row">
                        <label className="control-label" htmlFor="rule-configuration-select">
                            Play Style
                        </label>
                        <div className="select-shell">
                            <select
                                id="rule-configuration-select"
                                value={selectedRuleConfigurationId ?? ""}
                                disabled={disabled}
                                onChange={(event) => {
                                    onSelectRuleConfiguration(event.target.value);
                                }}
                            >
                                {availableRuleConfigurations.map((ruleConfiguration) => (
                                    <option key={ruleConfiguration.id} value={ruleConfiguration.id}>
                                        {ruleConfiguration.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {selectedRuleConfigurationId === "free-play" ? (
                        <>
                            <div className="control-row">
                                <label className="control-label" htmlFor="board-size-select">
                                    Board Size
                                </label>
                                <div className="select-shell">
                                    <select
                                        id="board-size-select"
                                        value={String(selectedBoardSize)}
                                        disabled={disabled}
                                        onChange={(event) => {
                                            onSelectBoardSize(Number.parseInt(event.target.value, 10));
                                        }}
                                    >
                                        {Array.from({ length: 24 }, (_, index) => index + 3).map((boardSize) => (
                                            <option key={boardSize} value={boardSize}>
                                                {boardSize}x{boardSize}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="control-row">
                                <label className="control-label" htmlFor="starting-side-select">
                                    Starting Side
                                </label>
                                <div className="select-shell">
                                    <select
                                        id="starting-side-select"
                                        value={selectedStartingSide}
                                        disabled={disabled}
                                        onChange={(event) => {
                                            onSelectStartingSide(event.target.value as Side);
                                        }}
                                    >
                                        <option value="dragons">Dragons</option>
                                        <option value="ravens">Ravens</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    ) : null}
                    <button
                        id="start-button"
                        type="button"
                        disabled={disabled}
                        onClick={onStartGame}
                    >
                        Start Game
                    </button>
                </>
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
            {showUndo && !isActivePlay ? (
                undoButton
            ) : null}
        </div>
    );
};
