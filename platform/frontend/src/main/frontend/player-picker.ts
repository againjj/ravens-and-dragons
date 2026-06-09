import { createElement, Fragment, useEffect, useState, type ReactElement } from "react";
import type { AuthUserSummary } from "./auth-types";

export interface PlayerPickerOption {
    id: string;
    displayName: string;
}

export interface PlayerPickerProps {
    players: AuthUserSummary[];
    bots: PlayerPickerOption[];
    addMyselfDisabled?: boolean;
    onAddMyself: () => void;
    onAddPlayer: (playerUserId: string) => void;
    onAddBot: (botId: string) => void;
    onCancel: () => void;
}

export const PlayerPicker = ({
    players,
    bots,
    addMyselfDisabled = false,
    onAddMyself,
    onAddPlayer,
    onAddBot,
    onCancel
}: PlayerPickerProps): ReactElement => {
    const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? "");
    const [selectedBotId, setSelectedBotId] = useState(bots[0]?.id ?? "");

    useEffect(() => {
        if (!players.some((player) => player.id === selectedPlayerId)) {
            setSelectedPlayerId(players[0]?.id ?? "");
        }
    }, [players, selectedPlayerId]);

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
                players.map((player) =>
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
