import { useAppSelector } from "../app/hooks.js";
import { selectCurrentUser, selectIsAuthenticated } from "../features/auth/authSelectors.js";
import {
    selectCanClaimDragons,
    selectCanClaimRavens,
    selectDragonsPlayer,
    selectRavensPlayer,
    selectViewerOwnsASeat,
    selectViewerRole
} from "../features/game/gameSelectors.js";

interface SeatPanelProps {
    onClaimDragons: () => void;
    onClaimRavens: () => void;
}

export const SeatPanel = ({ onClaimDragons, onClaimRavens }: SeatPanelProps) => {
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const viewerRole = useAppSelector(selectViewerRole);
    const dragonsPlayer = useAppSelector(selectDragonsPlayer);
    const ravensPlayer = useAppSelector(selectRavensPlayer);
    const canClaimDragons = useAppSelector(selectCanClaimDragons);
    const canClaimRavens = useAppSelector(selectCanClaimRavens);
    const viewerOwnsASeat = useAppSelector(selectViewerOwnsASeat);

    return (
        <section className="legend">
            <h2>Seats</h2>
            <p>{isAuthenticated && currentUser ? `Viewing as ${currentUser.displayName} (${viewerRole})` : "Viewing as anonymous spectator"}</p>
            <p>
                <strong>Dragons:</strong> {dragonsPlayer?.displayName ?? "Open seat"}
            </p>
            <p>
                <strong>Ravens:</strong> {ravensPlayer?.displayName ?? "Open seat"}
            </p>
            {!viewerOwnsASeat ? (
                <div className="controls">
                    <button type="button" disabled={!canClaimDragons} onClick={onClaimDragons}>
                        Claim Dragons
                    </button>
                    <button type="button" disabled={!canClaimRavens} onClick={onClaimRavens}>
                        Claim Ravens
                    </button>
                </div>
            ) : null}
        </section>
    );
};
