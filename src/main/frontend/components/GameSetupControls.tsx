import type { ReactNode } from "react";

import type { RuleConfigurationSummary, Side } from "../game-types.js";

interface GameSetupControlsProps {
    availableRuleConfigurations: RuleConfigurationSummary[];
    selectedRuleConfigurationId: string;
    selectedStartingSide: Side;
    selectedBoardSize: number;
    isDisabled: boolean;
    onSelectRuleConfiguration: (ruleConfigurationId: string) => void;
    onSelectStartingSide: (side: Side) => void;
    onSelectBoardSize: (boardSize: number) => void;
    startGameHint?: ReactNode;
    onStartGame?: () => void | Promise<void>;
}

export const GameSetupControls = ({
    availableRuleConfigurations,
    selectedRuleConfigurationId,
    selectedStartingSide,
    selectedBoardSize,
    isDisabled,
    onSelectRuleConfiguration,
    onSelectStartingSide,
    onSelectBoardSize,
    startGameHint,
    onStartGame
}: GameSetupControlsProps) => {
    const showSizeAndSideSelectors = selectedRuleConfigurationId === "free-play";
    const startButtonDisabled = isDisabled || !onStartGame;

    return (
        <>
            <div className="control-row">
                <label className="control-label" htmlFor="rule-configuration-select">
                    Play Style
                </label>
                <div className="select-shell">
                    <select
                        id="rule-configuration-select"
                        value={selectedRuleConfigurationId}
                        disabled={isDisabled}
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
            {showSizeAndSideSelectors ? (
                <>
                    <div className="control-row">
                        <label className="control-label" htmlFor="board-size-select">
                            Board Size
                        </label>
                        <div className="select-shell">
                            <select
                                id="board-size-select"
                                value={String(selectedBoardSize)}
                                disabled={isDisabled}
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
                                disabled={isDisabled}
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
            {startGameHint}
            <button
                id="start-button"
                type="button"
                disabled={startButtonDisabled}
                onClick={() => {
                    onStartGame?.();
                }}
            >
                Start Game
            </button>
        </>
    );
};
