import { createElement, Fragment, useEffect, useState } from "react";
export const PlayerPicker = ({ players, bots, onAddMyself, onAddPlayer, onAddBot, onCancel }) => {
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
    return createElement("div", { className: "player-picker" }, createElement("button", { type: "button", onClick: onAddMyself }, "Add Myself"), createElement("div", { className: "select-shell" }, createElement("select", {
        "aria-label": "Choose player",
        value: selectedPlayerId,
        onChange: (event) => {
            setSelectedPlayerId(event.target.value);
        }
    }, players.map((player) => createElement("option", { key: player.id, value: player.id }, player.displayName)))), createElement("button", {
        type: "button",
        disabled: !selectedPlayerId,
        onClick: () => {
            if (selectedPlayerId) {
                onAddPlayer(selectedPlayerId);
            }
        }
    }, "Add Player"), bots.length > 0
        ? createElement(Fragment, null, createElement("div", { className: "select-shell" }, createElement("select", {
            "aria-label": "Choose bot",
            value: selectedBotId,
            onChange: (event) => {
                setSelectedBotId(event.target.value);
            }
        }, bots.map((bot) => createElement("option", { key: bot.id, value: bot.id }, bot.displayName)))), createElement("button", {
            type: "button",
            disabled: !selectedBotId,
            onClick: () => {
                if (selectedBotId) {
                    onAddBot(selectedBotId);
                }
            }
        }, "Add Bot"))
        : null, createElement("button", { type: "button", onClick: onCancel }, "Don't Add Anyone"));
};
