import { useEffect, useState } from "react";

import { useAppSelector } from "../app/hooks.js";
import {
    selectAvailableBots,
    selectBotAssignmentTargetSide,
    selectCanAssignBotOpponent,
    selectCanClaimDragons,
    selectCanClaimRavens,
    selectResolvedDragonsBot,
    selectDragonsPlayer,
    selectResolvedRavensBot,
    selectRavensPlayer
} from "../features/game/gameSelectors.js";

interface SeatPanelProps {
    onAssignBotOpponent: (botId: string) => void;
    onClaimDragons: () => void;
    onClaimRavens: () => void;
}

export const SeatPanel = ({ onAssignBotOpponent, onClaimDragons, onClaimRavens }: SeatPanelProps) => {
    const dragonsPlayer = useAppSelector(selectDragonsPlayer);
    const ravensPlayer = useAppSelector(selectRavensPlayer);
    const dragonsBot = useAppSelector(selectResolvedDragonsBot);
    const ravensBot = useAppSelector(selectResolvedRavensBot);
    const availableBots = useAppSelector(selectAvailableBots);
    const canClaimDragons = useAppSelector(selectCanClaimDragons);
    const canClaimRavens = useAppSelector(selectCanClaimRavens);
    const canAssignBotOpponent = useAppSelector(selectCanAssignBotOpponent);
    const botAssignmentTargetSide = useAppSelector(selectBotAssignmentTargetSide);
    const [selectedBotId, setSelectedBotId] = useState<string>(availableBots[0]?.id ?? "");

    useEffect(() => {
        if (availableBots.some((bot) => bot.id === selectedBotId)) {
            return;
        }
        setSelectedBotId(availableBots[0]?.id ?? "");
    }, [availableBots, selectedBotId]);

    return (
        <div className="seat-summary" aria-label="Seat ownership">
            <div className="seat-summary-line">
                <span className="seat-summary-item">
                    <strong>Dragons:</strong> {dragonsPlayer?.displayName ?? (dragonsBot ? `Bot: ${dragonsBot.displayName}` : "Open seat")}
                </span>
                <span className="seat-summary-item">
                    <strong>Ravens:</strong> {ravensPlayer?.displayName ?? (ravensBot ? `Bot: ${ravensBot.displayName}` : "Open seat")}
                </span>
                {canAssignBotOpponent || canClaimDragons || canClaimRavens ? (
                    <span className="controls seat-summary-actions">
                        {canClaimDragons ? (
                            <button type="button" onClick={onClaimDragons}>
                                Claim Dragons
                            </button>
                        ) : null}
                        {canClaimRavens ? (
                            <button type="button" onClick={onClaimRavens}>
                                Claim Ravens
                            </button>
                        ) : null}
                        {canAssignBotOpponent && botAssignmentTargetSide ? (
                            <>
                                <div className="select-shell">
                                    <select
                                        aria-label="Choose bot opponent"
                                        id="bot-opponent-select"
                                        value={selectedBotId}
                                        onChange={(event) => {
                                            setSelectedBotId(event.target.value);
                                        }}
                                    >
                                        {availableBots.map((bot) => (
                                            <option key={bot.id} value={bot.id}>
                                                {bot.displayName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    disabled={!selectedBotId}
                                    onClick={() => {
                                        if (selectedBotId) {
                                            onAssignBotOpponent(selectedBotId);
                                        }
                                    }}
                                >
                                    {`Assign Bot To ${botAssignmentTargetSide === "dragons" ? "Dragons" : "Ravens"}`}
                                </button>
                            </>
                        ) : null}
                    </span>
                ) : null}
            </div>
        </div>
    );
};
