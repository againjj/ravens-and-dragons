export type Piece = "dragon" | "raven" | "gold";
export type Side = "dragons" | "ravens";
export type Phase = "none" | "setup" | "move" | "capture";
export type TurnType = "move" | "gameOver";
export type GameLifecycle = "new" | "active" | "finished";
export type AuthType = "guest" | "local" | "oauth";
export type ViewerRole = "anonymous" | "spectator" | "dragons" | "ravens";

export interface RuleDescriptionSection {
    heading?: string;
    paragraphs: string[];
}

export interface RuleConfigurationSummary {
    id: string;
    name: string;
    descriptionSections: RuleDescriptionSection[];
    hasSetupPhase: boolean;
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
    createdByUserId?: string | null;
}

export interface AuthUserSummary {
    id: string;
    displayName: string;
    authType: AuthType;
}

export interface AuthSessionResponse {
    authenticated: boolean;
    user: AuthUserSummary | null;
    oauthProviders: string[];
}

export interface LocalProfileResponse {
    id: string;
    username: string;
    displayName: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface SignupRequest {
    username: string;
    password: string;
    displayName: string;
    email?: string;
}

export interface UpdateProfileRequest {
    displayName: string;
}

export interface DeleteAccountRequest {
    password: string;
}

export interface GamePlayerSummary {
    id: string;
    displayName: string;
}

export interface GameViewResponse {
    game: ServerGameSession;
    currentUser: AuthUserSummary | null;
    dragonsPlayer: GamePlayerSummary | null;
    ravensPlayer: GamePlayerSummary | null;
    viewerRole: ViewerRole;
}

export interface CreateGameRequest {
    ruleConfigurationId?: string;
    startingSide?: Side;
    boardSize?: number;
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
        | "start-game"
        | "select-rule-configuration"
        | "select-starting-side"
        | "select-board-size"
        | "cycle-setup"
        | "end-setup"
        | "move-piece"
        | "capture-piece"
        | "skip-capture"
        | "undo"
        | "end-game";
    square?: string;
    origin?: string;
    destination?: string;
    ruleConfigurationId?: string;
    side?: Side;
    boardSize?: number;
}

export interface ClaimSideRequest {
    side: Side;
}
