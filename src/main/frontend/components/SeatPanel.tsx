import { useAppSelector } from "../app/hooks.js";
import {
    selectAvailableBots,
    selectBotAssignmentTargetSide,
    selectCanAssignBotOpponent,
    selectCanClaimDragons,
    selectCanClaimRavens,
    selectDragonsBot,
    selectDragonsPlayer,
    selectRavensBot,
    selectRavensPlayer
} from "../features/game/gameSelectors.js";

interface SeatPanelProps {
    onAssignBotOpponent: () => void;
    onClaimDragons: () => void;
    onClaimRavens: () => void;
}

export const SeatPanel = ({ onAssignBotOpponent, onClaimDragons, onClaimRavens }: SeatPanelProps) => {
    const dragonsPlayer = useAppSelector(selectDragonsPlayer);
    const ravensPlayer = useAppSelector(selectRavensPlayer);
    const dragonsBot = useAppSelector(selectDragonsBot);
    const ravensBot = useAppSelector(selectRavensBot);
    const availableBots = useAppSelector(selectAvailableBots);
    const canClaimDragons = useAppSelector(selectCanClaimDragons);
    const canClaimRavens = useAppSelector(selectCanClaimRavens);
    const canAssignBotOpponent = useAppSelector(selectCanAssignBotOpponent);
    const botAssignmentTargetSide = useAppSelector(selectBotAssignmentTargetSide);
    const assignableBot = availableBots[0] ?? null;

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
                        {canAssignBotOpponent && botAssignmentTargetSide && assignableBot ? (
                            <button type="button" onClick={onAssignBotOpponent}>
                                {`Assign Bot To ${botAssignmentTargetSide === "dragons" ? "Dragons" : "Ravens"}`}
                            </button>
                        ) : null}
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
                    </span>
                ) : null}
            </div>
        </div>
    );
};
