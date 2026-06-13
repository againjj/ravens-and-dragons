import { createElement, Fragment, useEffect, useMemo, useState, type ReactElement } from "react";
import type { AuthUserSummary } from "./auth-types";

export interface PlayerPickerOption {
    id: string;
    displayName: string;
}

export interface PlayerPickerSeatedPlayer {
    id: string;
}

export interface PlayerPickerProps {
    players: AuthUserSummary[];
    bots: PlayerPickerOption[];
    seatedPlayers?: PlayerPickerSeatedPlayer[];
    currentUserId?: string | null;
    canCurrentUserTakeSecondSeat?: boolean;
    onAddMyself: () => void;
    onAddPlayer: (playerUserId: string) => void;
    onAddBot: (botId: string) => void;
    onCancel: () => void;
}

export const PlayerPicker = ({
    players,
    bots,
    seatedPlayers = [],
    currentUserId = null,
    canCurrentUserTakeSecondSeat = false,
    onAddMyself,
    onAddPlayer,
    onAddBot,
    onCancel
}: PlayerPickerProps): ReactElement => {
    const seatedPlayerIds = useMemo(
        () => new Set(seatedPlayers.map((player) => player.id)),
        [seatedPlayers]
    );
    const currentUserIsSeated = currentUserId !== null && seatedPlayerIds.has(currentUserId);
    const addMyselfDisabled = !currentUserId || (currentUserIsSeated && !canCurrentUserTakeSecondSeat);
    const availablePlayers = useMemo(
        () => players.filter((player) =>
            player.id !== currentUserId && (canCurrentUserTakeSecondSeat || !seatedPlayerIds.has(player.id))
        ),
        [canCurrentUserTakeSecondSeat, currentUserId, players, seatedPlayerIds]
    );
    const [selectedPlayerId, setSelectedPlayerId] = useState(availablePlayers[0]?.id ?? "");
    const [selectedBotId, setSelectedBotId] = useState(bots[0]?.id ?? "");

    useEffect(() => {
        if (!availablePlayers.some((player) => player.id === selectedPlayerId)) {
            setSelectedPlayerId(availablePlayers[0]?.id ?? "");
        }
    }, [availablePlayers, selectedPlayerId]);

    useEffect(() => {
        if (!bots.some((bot) => bot.id === selectedBotId)) {
            setSelectedBotId(bots[0]?.id ?? "");
        }
    }, [bots, selectedBotId]);

    return createElement(
        "div",
        { className: "player-picker" },
        createElement("button", { type: "button", disabled: addMyselfDisabled, onClick: onAddMyself }, "Add Myself"),
        createElement(
            "div",
            { className: "select-shell" },
            createElement(
                "select",
                {
                    "aria-label": "Choose player",
                    value: selectedPlayerId,
                    onChange: (event) => {
                        setSelectedPlayerId((event.target as HTMLSelectElement).value);
                    }
                },
                availablePlayers.map((player) =>
                    createElement("option", { key: player.id, value: player.id }, player.displayName)
                )
            )
        ),
        createElement(
            "button",
            {
                type: "button",
                disabled: !selectedPlayerId,
                onClick: () => {
                    if (selectedPlayerId) {
                        onAddPlayer(selectedPlayerId);
                    }
                }
            },
            "Add Player"
        ),
        bots.length > 0
            ? createElement(
                Fragment,
                null,
                createElement(
                    "div",
                    { className: "select-shell" },
                    createElement(
                        "select",
                        {
                            "aria-label": "Choose bot",
                            value: selectedBotId,
                            onChange: (event) => {
                                setSelectedBotId((event.target as HTMLSelectElement).value);
                            }
                        },
                        bots.map((bot) =>
                            createElement("option", { key: bot.id, value: bot.id }, bot.displayName)
                        )
                    )
                ),
                createElement(
                    "button",
                    {
                        type: "button",
                        disabled: !selectedBotId,
                        onClick: () => {
                            if (selectedBotId) {
                                onAddBot(selectedBotId);
                            }
                        }
                    },
                    "Add Bot"
                )
            )
            : null,
        createElement("button", { type: "button", onClick: onCancel }, "Don't Add Anyone")
    );
};
