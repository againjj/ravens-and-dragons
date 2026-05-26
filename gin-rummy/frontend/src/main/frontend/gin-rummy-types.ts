export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Phase = "waitingForPlayers" | "firstUpcard" | "draw" | "discardOnly" | "discard" | "roundOver" | "gameOver" | "matchOver";

export interface GinRummyConfig {
    targetScore: number;
    playMode: "singleGame" | "bestOfFiveMatch";
    bigGinAllowed: boolean;
    optionalDealRule: boolean;
    lineBonusEnabled: boolean;
    aceHighAllowed: boolean;
}

export interface Card {
    id: string;
    rank: string;
    suit: Suit;
}

export interface Seat {
    userId: string | null;
    displayName: string | null;
}

export interface ScoreLine {
    seat: number;
    points: number;
    reason: string;
    gameNumber: number;
    roundNumber: number;
}

export interface Scores {
    gamePoints: number[];
    totalPoints: number[];
    gamesWon: number[];
    handsWonThisGame: number[];
    runningLines: ScoreLine[];
}

export interface MeldArrangement {
    melds: string[][];
    deadwood: string[];
    deadwoodScore: number;
}

export interface RoundResult {
    winnerSeat: number | null;
    points: number;
    reason: string;
    knockerSeat: number | null;
    knockerDeadwood: number | null;
    defenderDeadwood: number | null;
    selectedMelds: string[][];
    selectedDeadwood: string[];
    defenderMelds: string[][];
    defenderDeadwoodCards: string[];
    layoffs: string[];
}

export interface KnockChoice {
    type: "knock" | "gin" | "bigGin";
    cardId?: string;
    arrangement: MeldArrangement;
}

export interface FlyingCard {
    key: number;
    card: Card | null;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

export interface FlyDestination {
    x: number;
    y: number;
}

export type DragSource = "hand" | "stock" | "discard";
export type EndAction = "knock" | "gin" | "bigGin";

export interface ViewerInfo {
    userId: string | null;
    hands: Record<string, Card[]>;
    deadwood: Record<string, number>;
    knockOptions: Record<string, MeldArrangement[]>;
    drewDiscardCardId?: string | null;
}

export interface GinRummyGame {
    id: string;
    gameSlug: "gin-rummy";
    version: number;
    lifecycle: string;
    config: GinRummyConfig;
    seats: Seat[];
    dealerSeat: number;
    currentSeat: number;
    phase: Phase;
    gameNumber: number;
    roundNumber: number;
    stockCount: number;
    discardTop: Card | null;
    discardCount: number;
    handCounts: number[];
    scores: Scores;
    roundResult: RoundResult | null;
    winnerSeat: number | null;
    message: string | null;
    viewer?: ViewerInfo;
}

export interface CreateGameResponse {
    game: GinRummyGame;
}
