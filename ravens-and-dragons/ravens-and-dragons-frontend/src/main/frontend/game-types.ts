import type { AuthUserSummary } from "@ravensanddragons/platform-frontend/auth-types";

export type Piece = "dragon" | "raven" | "gold";
export type Side = "dragons" | "ravens";
export type Phase = "none" | "move" | "capture";
export type TurnType = "move" | "gameOver";
export type GameLifecycle = "new" | "active" | "finished";
export type ViewerRole = "anonymous" | "spectator" | "dragons" | "ravens";

export interface RuleDescriptionSection {
    heading?: string;
    paragraphs: string[];
}

export interface RuleConfigurationSummary {
    id: string;
    name: string;
    descriptionSections: RuleDescriptionSection[];
    hasManualCapture: boolean;
    hasManualEndGame: boolean;
}

export type TurnHistoryRow =
    | { type: "move"; label: string; key: string }
    | { type: "gameOver"; label: string; key: string };

export interface GroupedMoveHistoryRow {
    key: string;
    leftLabel: string;
    moveNumber: number;
    rightLabel: string | null;
}

export interface TurnRecord {
    type: TurnType;
    from?: string;
    to?: string;
    capturedSquares?: string[];
    outcome?: string;
}

export interface ServerGameSnapshot {
    board: Record<string, Piece>;
    boardSize: number;
    specialSquare: string;
    phase: Phase;
    activeSide: Side;
    pendingMove: TurnRecord | null;
    turns: TurnRecord[];
    ruleConfigurationId: string;
    positionKeys: string[];
}

export interface ServerGameSession {
    id: string;
    gameSlug: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    lifecycle: GameLifecycle;
    snapshot: ServerGameSnapshot;
    canUndo: boolean;
    undoOwnerSide?: Side | null;
    availableRuleConfigurations: RuleConfigurationSummary[];
    selectedRuleConfigurationId: string;
    selectedStartingSide: Side;
    selectedBoardSize: number;
    dragonsPlayerUserId?: string | null;
    ravensPlayerUserId?: string | null;
    dragonsBotId?: string | null;
    ravensBotId?: string | null;
    createdByUserId?: string | null;
}

export interface GamePlayerSummary {
    id: string;
    displayName: string;
}

export interface BotSummary {
    id: string;
    displayName: string;
}

export interface GameViewResponse {
    game: ServerGameSession;
    currentUser: AuthUserSummary | null;
    dragonsPlayer: GamePlayerSummary | null;
    ravensPlayer: GamePlayerSummary | null;
    dragonsBot: BotSummary | null;
    ravensBot: BotSummary | null;
    availableBots: BotSummary[];
    viewerRole: ViewerRole;
}

export interface CreateGameRequest {
    ruleConfigurationId?: string;
    startingSide?: Side;
    boardSize?: number;
    board?: Record<string, Piece>;
}

export interface CreateGameDraftState {
    isActive: boolean;
    selectedRuleConfigurationId: string;
    selectedStartingSide: Side;
    selectedBoardSize: number;
    draftBoard: Record<string, Piece>;
}

export interface CreateGameResponse {
    game: ServerGameSession;
}

export const generatedGameIdPattern = /^[23456789CFGHJMPQRVWX]{7}$/;

export interface GameCommandRequest {
    expectedVersion: number;
    type:
        | "move-piece"
        | "capture-piece"
        | "skip-capture"
        | "undo"
        | "end-game"
        | "claim-side"
        | "assign-bot-opponent";
    square?: string;
    origin?: string;
    destination?: string;
    ruleConfigurationId?: string;
    side?: Side;
    boardSize?: number;
    botId?: string;
}
