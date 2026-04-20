import { useAppSelector } from "../app/hooks.js";
import {
    selectCanClaimDragons,
    selectCanClaimRavens,
    selectDragonsPlayer,
    selectRavensPlayer
} from "../features/game/gameSelectors.js";

interface SeatPanelProps {
    onClaimDragons: () => void;
    onClaimRavens: () => void;
}

export const SeatPanel = ({ onClaimDragons, onClaimRavens }: SeatPanelProps) => {
    const dragonsPlayer = useAppSelector(selectDragonsPlayer);
    const ravensPlayer = useAppSelector(selectRavensPlayer);
    const canClaimDragons = useAppSelector(selectCanClaimDragons);
    const canClaimRavens = useAppSelector(selectCanClaimRavens);

    return (
        <div className="seat-summary" aria-label="Seat ownership">
            <div className="seat-summary-line">
                <span className="seat-summary-item">
                    <strong>Dragons:</strong> {dragonsPlayer?.displayName ?? "Open seat"}
                </span>
                <span className="seat-summary-item">
                    <strong>Ravens:</strong> {ravensPlayer?.displayName ?? "Open seat"}
                </span>
                {canClaimDragons || canClaimRavens ? (
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
                    </span>
                ) : null}
            </div>
        </div>
    );
};
