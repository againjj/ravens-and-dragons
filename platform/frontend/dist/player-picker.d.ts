import { type ReactElement } from "react";
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
export declare const PlayerPicker: ({ players, bots, addMyselfDisabled, onAddMyself, onAddPlayer, onAddBot, onCancel }: PlayerPickerProps) => ReactElement;
