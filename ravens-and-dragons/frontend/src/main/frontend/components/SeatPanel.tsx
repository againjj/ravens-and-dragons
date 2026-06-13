import { PlayerPicker } from "@ravensanddragons/platform-frontend/player-picker";
import type { AuthUserSummary } from "@ravensanddragons/platform-frontend/auth-types";
import { isServerUnavailableError, isUnauthorizedError, notifyAuthSessionExpired, notifyServerUnavailable } from "@ravensanddragons/platform-frontend/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useRavensAndDragonsSelector } from "../frontend-state.js";
import { fetchUsers } from "../game-client.js";
import {
    selectBotAssignmentModel,
    selectCanClaimDragons,
    selectCanClaimRavens,
    selectDragonsPlayer,
    selectFeedbackMessage,
    selectRavensPlayer
} from "../features/game/gameSelectors.js";
import { selectCurrentUser } from "../features/host/hostAuthSelectors.js";
import { playerAccountMissingMessage } from "../features/game/gameThunks.js";
import type { Side } from "../game-types.js";

const portalRoot = () => document.fullscreenElement ?? document.body;

interface SeatPanelProps {
    onAssignBotOpponent: (botId: string) => void;
    onAssignPlayerSeat?: (side: Side, playerUserId: string) => void;
    onClaimDragons: () => void;
    onClaimRavens: () => void;
}

export const SeatPanel = ({ onAssignBotOpponent, onAssignPlayerSeat = () => {}, onClaimDragons, onClaimRavens }: SeatPanelProps) => {
    const currentUser = useRavensAndDragonsSelector(selectCurrentUser);
    const dragonsPlayer = useRavensAndDragonsSelector(selectDragonsPlayer);
    const ravensPlayer = useRavensAndDragonsSelector(selectRavensPlayer);
    const { dragonsBot, ravensBot, availableBots, canAssign, targetSide } = useRavensAndDragonsSelector(selectBotAssignmentModel);
    const canClaimDragons = useRavensAndDragonsSelector(selectCanClaimDragons);
    const canClaimRavens = useRavensAndDragonsSelector(selectCanClaimRavens);
    const feedbackMessage = useRavensAndDragonsSelector(selectFeedbackMessage);
    const [activePickerSide, setActivePickerSide] = useState<Side | null>(null);
    const [players, setPlayers] = useState<AuthUserSummary[]>([]);
    const reopenSideRef = useRef<Side | null>(null);
    const shouldReopenAfterFeedbackRef = useRef(false);
    const previousFeedbackMessageRef = useRef<string | null>(null);
    const seatedPlayers = [dragonsPlayer, ravensPlayer].flatMap((player) => player ? [{ id: player.id }] : []);

    const loadPlayers = useCallback(async () => {
        if (!currentUser) {
            setPlayers([]);
            return;
        }
        try {
            const users = await fetchUsers();
            setPlayers(users);
        } catch (error) {
            if (isUnauthorizedError(error)) {
                notifyAuthSessionExpired();
            } else if (isServerUnavailableError(error)) {
                notifyServerUnavailable();
            } else {
                setPlayers([]);
            }
        }
    }, [currentUser]);

    const openPicker = (side: Side) => {
        setActivePickerSide(side);
        void loadPlayers();
    };

    const closePicker = () => {
        setActivePickerSide(null);
    };

    useEffect(() => {
        if (feedbackMessage === playerAccountMissingMessage) {
            shouldReopenAfterFeedbackRef.current = true;
        }

        if (
            previousFeedbackMessageRef.current === playerAccountMissingMessage &&
            feedbackMessage == null &&
            shouldReopenAfterFeedbackRef.current &&
            reopenSideRef.current
        ) {
            shouldReopenAfterFeedbackRef.current = false;
            openPicker(reopenSideRef.current);
        }

        previousFeedbackMessageRef.current = feedbackMessage;
    }, [feedbackMessage]);

    const renderSeatValue = (
        side: Side,
        player: typeof dragonsPlayer,
        bot: typeof dragonsBot,
        canOpenPicker: boolean
    ) => {
        if (player) {
            return player.displayName;
        }
        if (bot) {
            return `Bot: ${bot.displayName}`;
        }
        if (!canOpenPicker) {
            return "Open seat";
        }

        const label = "Add Player";
        const pickerBots = canAssign && targetSide === side ? availableBots : [];
        return (
            <>
                <button
                    type="button"
                    onClick={() => {
                        openPicker(side);
                    }}
                >
                    {label}
                </button>
                {activePickerSide === side
                    ? createPortal(
                        <div className="seat-player-picker-backdrop" role="presentation">
                            <section
                                className="panel seat-player-picker-modal"
                                role="dialog"
                                aria-modal="true"
                                aria-label={`${side === "ravens" ? "Ravens" : "Dragons"} player picker`}
                            >
                                <PlayerPicker
                                    players={players}
                                    bots={pickerBots}
                                    seatedPlayers={seatedPlayers}
                                    currentUserId={currentUser?.id ?? null}
                                    canCurrentUserTakeSecondSeat={true}
                                    onAddMyself={() => {
                                        reopenSideRef.current = side;
                                        closePicker();
                                        if (side === "ravens") {
                                            onClaimRavens();
                                        } else {
                                            onClaimDragons();
                                        }
                                    }}
                                    onAddPlayer={(playerUserId) => {
                                        reopenSideRef.current = side;
                                        closePicker();
                                        onAssignPlayerSeat(side, playerUserId);
                                    }}
                                    onAddBot={(botId) => {
                                        reopenSideRef.current = side;
                                        closePicker();
                                        onAssignBotOpponent(botId);
                                    }}
                                    onCancel={closePicker}
                                />
                            </section>
                        </div>,
                        portalRoot()
                    )
                    : null}
            </>
        );
    };

    return (
        <div className="seat-summary" aria-label="Seat ownership">
            <div className="seat-summary-line">
                <span className="seat-summary-item">
                    <strong>Ravens:</strong> {renderSeatValue("ravens", ravensPlayer, ravensBot, canClaimRavens)}
                </span>
                <span className="seat-summary-item">
                    <strong>Dragons:</strong> {renderSeatValue("dragons", dragonsPlayer, dragonsBot, canClaimDragons)}
                </span>
            </div>
        </div>
    );
};
