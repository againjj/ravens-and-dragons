import { type ReactElement } from "react";
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
export declare const PlayerPicker: ({ players, bots, seatedPlayers, currentUserId, canCurrentUserTakeSecondSeat, onAddMyself, onAddPlayer, onAddBot, onCancel }: PlayerPickerProps) => ReactElement;
