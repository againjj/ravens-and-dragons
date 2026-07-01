export type CardType = "station" | "module" | "agent" | "influence";
export type Orientation = "vertical" | "horizontal";
export type CardRotation = 0 | 90 | 180 | 270;
export type ConnectorPosition = "top" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom";

export interface LunarBaseCard {
    id: string;
    type: CardType;
    name?: string;
    color?: LunarBaseColorName | null;
    cardCost?: LunarBaseColorName[];
    orbs?: LunarBaseColorName[];
    connectors?: Partial<Record<ConnectorPosition, LunarBaseColorName | null>>;
    colonists?: number;
    achievements?: number[];
    flipped?: boolean;
    stationFrontName?: string | null;
    stationFrontOrbs?: LunarBaseColorName[];
    stationFrontColonists?: number;
    stationFrontAchievements?: number[];
    stationFrontMainActionText?: string | null;
    stationBackName?: string | null;
    stationBackOrbs?: LunarBaseColorName[];
    stationBackColonists?: number;
    stationBackAchievements?: number[];
    stationBackMainActionText?: string | null;
    mainActionText?: string | null;
    onPlayingText?: string | null;
    effectText?: string | null;
}

export interface LunarBaseSeat {
    userId: string | null;
    displayName: string | null;
}

export interface LunarBaseBoardCard {
    card: LunarBaseCard;
    x: number;
    y: number;
    rotation: CardRotation;
}

export interface LunarBasePlayer {
    orbs: { red: number; blue: number; yellow: number; gray: number };
    credits: number;
    colonists: number;
    achievements: number;
    handCount: number;
    influenceHandCount: number;
    board: LunarBaseBoardCard[];
}

export interface LunarBaseActionButton {
    label: string;
    value: string;
}

export interface LunarBaseInteractionPrompt {
    text: string;
}

export interface LunarBaseActionInteraction {
    kind: string;
    actorIndex: number;
    interactionPrompt?: LunarBaseInteractionPrompt | null;
    buttons: LunarBaseActionButton[];
    remaining?: number;
    action?: LunarBaseActionNode | null;
    actionText?: string | null;
    targetCardIds?: string[] | null;
    targetPlayerIndex?: number | null;
    flippedStationIds?: string[];
    defendedAction?: LunarBaseActionFrame | null;
}

export interface LunarBaseActionNode {
    kind: string;
    amount?: number | null;
    amountKind?: string | null;
    flipAmount?: number | null;
    flipAmountKind?: string | null;
    side?: string | null;
    moduleName?: string | null;
    playerRef?: string | null;
    scope?: string | null;
    actions?: LunarBaseActionNode[];
}

export interface LunarBaseActionFrame {
    actorIndex: number;
    action: LunarBaseActionNode;
    remaining?: number | null;
    sourceCardName?: string | null;
    sourceActorIndex?: number | null;
    influenceNegation?: boolean;
    targetPlayerIndex?: number | null;
    targetCardId?: string | null;
    targetX?: number | null;
    targetY?: number | null;
    targetRotation?: number | null;
}

export interface LunarBaseActionState {
    phase: "choosingMainAction" | "resolvingAction";
    mainActionChosen: boolean;
    interaction: LunarBaseActionInteraction | null;
    activeActions?: LunarBaseActionNode[];
    sourceCardName?: string | null;
}

export interface LunarBaseEndGameCondition {
    playerIndex: number;
    conditions: string[];
}

export interface LunarBaseEndGameResult {
    label: "Victory" | "Epic Victory" | "Draw";
    winningPlayerIndexes: number[];
    playerConditions: LunarBaseEndGameCondition[];
}

export interface LunarBaseGame {
    id: string;
    gameSlug: "lunar-base";
    version: number;
    lifecycle: "active" | "finished";
    config: { playerCount: number; useInfluences: boolean };
    seats: LunarBaseSeat[];
    currentPlayerIndex: number;
    players: LunarBasePlayer[];
    supply: Array<LunarBaseCard | null>;
    stockCount: number;
    discardTop: LunarBaseCard | null;
    discardCount: number;
    actionState: LunarBaseActionState;
    endGameResult?: LunarBaseEndGameResult | null;
    viewer?: {
        userId: string | null;
        seatIndex: number | null;
        hand: LunarBaseCard[];
        revealedHands?: LunarBaseCard[][];
    };
}

export interface CreateGameResponse {
    game: LunarBaseGame;
}

export interface LunarBaseCommandResponse {
    game: LunarBaseGame;
    message: string | null;
}

export interface FlyingCard {
    key: number;
    annotation: string;
    card: LunarBaseCard | null;
    faceDown?: boolean;
    rotation?: CardRotation;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

export type DragSource = "board" | "hand" | "stock" | "supply";
export type AnimationDestination =
    | { type: "viewerHandEnd" }
    | { type: "handCard"; cardId: string }
    | { type: "discard" }
    | { type: "boardCard"; cardId: string };

export interface CardMovementAnimation {
    annotation: string;
    card: LunarBaseCard | null;
    faceDown?: boolean;
    rotation?: CardRotation;
    sourceKey?: string | null;
    fromX: number;
    fromY: number;
    destination: AnimationDestination;
    toX?: number;
    toY?: number;
    hiddenDestinationKey?: string | null;
}

export interface SelectedCard {
    cardId: string;
    source?: "board" | "hand";
    sourcePlayerIndex?: number;
    rotation: CardRotation;
    visualRotation: number;
    originRotation: CardRotation;
}

export interface StationFlipAnimation {
    from: LunarBaseCard;
    to: LunarBaseCard;
}

export interface StationRevealState {
    cardId: string;
    phase: "revealing" | "revealed" | "hiding";
}

export type LunarBaseColorName = keyof typeof lunarBaseColors;
export type LunarBaseResourceColorName = Exclude<LunarBaseColorName, "orange">;

export const lunarBaseColors = {
    red: { rgb: "199, 53, 63", css: "rgb(199, 53, 63)", tint: "rgb(246, 225, 227)" },
    blue: { rgb: "69, 137, 198", css: "rgb(69, 137, 198)", tint: "rgb(225, 237, 247)" },
    yellow: { rgb: "242, 186, 71", css: "rgb(242, 186, 71)", tint: "rgb(253, 245, 229)" },
    gray: { rgb: "200, 200, 200", css: "rgb(200, 200, 200)", tint: "rgb(241, 241, 241)" },
    orange: { rgb: "232, 150, 65", css: "rgb(232, 150, 65)", tint: "rgb(252, 239, 226)" }
} as const;
