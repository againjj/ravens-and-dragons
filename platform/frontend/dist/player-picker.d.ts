import type { AuthUserSummary } from "./auth-types";
import type { ReactElement } from "react";

export interface PlayerPickerOption {
    id: string;
    displayName: string;
}

export interface PlayerPickerProps {
    players: AuthUserSummary[];
    bots: PlayerPickerOption[];
    onAddMyself: () => void;
    onAddPlayer: (playerUserId: string) => void;
    onAddBot: (botId: string) => void;
    onCancel: () => void;
}

export declare const PlayerPicker: (props: PlayerPickerProps) => ReactElement;
