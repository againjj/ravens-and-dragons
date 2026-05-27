import { deckById } from "./gin-rummy-cards";
import type { Card, EndAction, FlyDestination, GinRummyGame, MeldArrangement, Phase, RoundResult, Suit } from "./gin-rummy-types";
export const seatDisplayName = (game: Pick<GinRummyGame, "seats">, seat: number, fallback = `Seat ${seat + 1}`): string => {
    const name = game.seats[seat]?.displayName ?? fallback;
    const userId = game.seats[seat]?.userId;
    const isSelfPlay = Boolean(userId && game.seats.every((candidate) => candidate.userId === userId));
    return isSelfPlay ? `${name} (${seat + 1})` : name;
};

export const discardPileInteractionState = (
    canAct: boolean,
    phase: Phase,
    hasDiscardTop: boolean
): { canDrawDiscard: boolean; canDiscardToPile: boolean; disabled: boolean } => {
    const canDrawDiscard = canAct && hasDiscardTop && (phase === "draw" || phase === "firstUpcard");
    const canDiscardToPile = canAct && phase !== "draw" && phase !== "firstUpcard";
    return {
        canDrawDiscard,
        canDiscardToPile,
        disabled: !canDrawDiscard && !canDiscardToPile
    };
};

export const canDiscardCardToPile = (
    canDiscardToPile: boolean,
    cardId: string,
    drewDiscardCardId: string | null | undefined,
    pendingEndAction: EndAction | null,
    legalEndDiscardIds: Set<string>
): boolean =>
    canDiscardToPile
    && cardId !== drewDiscardCardId
    && (!pendingEndAction || legalEndDiscardIds.has(cardId));

export const endActionButtonState = (
    action: EndAction,
    pendingEndAction: EndAction | null,
    isSubmitting: boolean
): { selected: boolean; disabled: boolean } => ({
    selected: pendingEndAction === action,
    disabled: Boolean(pendingEndAction) || isSubmitting
});

export const cardLabel = (card: Card): string => `${card.rank}${suitSymbol(card.suit)}`;
export const cardLabelById = (cardId: string): string => {
    const card = deckById.get(cardId);
    return card ? cardLabel(card) : cardId;
};
export const pointLabel = (points: number): string => `${points} ${points === 1 ? "point" : "points"}`;
export const elementCenter = (element: HTMLElement | null): FlyDestination | null => {
    const rect = element?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
};
export const handInsertionPoint = (hand: HTMLElement | null, insertIndex: number): FlyDestination | null => {
    const cardElements = hand ? Array.from(hand.querySelectorAll<HTMLElement>(".gin-card-button:not(.gin-card-placeholder):not(.is-dragged)")) : [];
    const firstRect = cardElements[0]?.getBoundingClientRect();
    if (!firstRect) return elementCenter(hand);
    const secondRect = cardElements[1]?.getBoundingClientRect();
    const step = secondRect ? Math.abs(secondRect.left - firstRect.left) : firstRect.width;
    return {
        x: firstRect.left + Math.min(insertIndex, cardElements.length) * step + firstRect.width / 2,
        y: firstRect.top + firstRect.height / 2
    };
};
export const lastHandCardPoint = (hand: HTMLElement | null): FlyDestination | null => {
    const cards = hand ? Array.from(hand.querySelectorAll<HTMLElement>(".gin-card-button:not(.gin-card-placeholder)")) : [];
    return elementCenter(cards[cards.length - 1] ?? null);
};
export const arrangementLabel = (arrangement: MeldArrangement): string => {
    const melds = arrangement.melds.map((meld) => meld.map(cardLabelById).join(" ")).join(" / ") || "No melds";
    const deadwood = arrangement.deadwood.length > 0 ? arrangement.deadwood.map(cardLabelById).join(" ") : "none";
    return `${melds}, ${arrangement.deadwoodScore} deadwood: ${deadwood}`;
};
export const suitSymbol = (suit: Suit): string => ({ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[suit]);
const resultReasonLabel = (reason: string): string => reason === "Gin" ? "Go Gin" : reason === "Big Gin" ? "Go Big Gin" : reason;
const rankValue = (rank: string, aceHigh: boolean): number => rank === "A" ? (aceHigh ? 14 : 1) : rank === "J" ? 11 : rank === "Q" ? 12 : rank === "K" ? 13 : Number(rank);
const deadwoodValue = (card: Card): number => card.rank === "A" ? 1 : ["J", "Q", "K"].includes(card.rank) ? 10 : Number(card.rank);
const consecutive = (values: number[]): boolean => values.every((value, index) => index === 0 || value === values[index - 1] + 1);
export const buildScoreSummary = (game: GinRummyGame, result: RoundResult, knockerSeat: number, defenderSeat: number) => {
    const winnerSeat = result.winnerSeat ?? game.currentSeat;
    const winnerName = seatDisplayName(game, winnerSeat);
    const knockerName = seatDisplayName(game, knockerSeat);
    const defenderName = seatDisplayName(game, defenderSeat);
    const knockerDeadwood = result.knockerDeadwood ?? 0;
    const defenderDeadwood = result.defenderDeadwood ?? 0;
    const title = "Hand score";
    const lines: { label: string; value: number }[] = [];
    if (result.reason === "Gin" || result.reason === "Big Gin") {
        lines.push({ label: `${defenderName} Deadwood:`, value: defenderDeadwood });
        lines.push({ label: `${winnerName} ${resultReasonLabel(result.reason)} Bonus:`, value: result.reason === "Big Gin" ? 31 : 25 });
    } else if (result.reason === "Undercut") {
        lines.push({ label: `${knockerName} Deadwood:`, value: knockerDeadwood });
        lines.push({ label: `${defenderName} Deadwood:`, value: -defenderDeadwood });
        lines.push({ label: `${winnerName} Undercut Bonus:`, value: 25 });
    } else if (result.reason === "Knock") {
        lines.push({ label: `${defenderName} Deadwood:`, value: defenderDeadwood });
        lines.push({ label: `${knockerName} Deadwood:`, value: -knockerDeadwood });
    } else {
        lines.push({ label: "Hand score:", value: result.points });
    }
    const subtotal = lines.reduce((sum, line) => sum + line.value, 0);
    if (result.points !== subtotal && result.reason !== "Stock exhausted") {
        lines.push({
            label: result.points === subtotal * 2 ? `${winnerName} Shutout double:` : `${winnerName} Score adjustment:`,
            value: result.points - subtotal
        });
    }
    return {
        title,
        lines,
        totalLabel: `${winnerName} hand score:`
    };
};
export const groupLayoffsByMeld = (layoffs: string[], melds: string[][], aceHighAllowed: boolean): string[][] => {
    const groups = melds.map(() => [] as string[]);
    layoffs.forEach((cardId) => {
        const card = deckById.get(cardId);
        const index = card ? melds.findIndex((meld) => canLayOff(card, meld, aceHighAllowed)) : -1;
        if (index >= 0) {
            groups[index].push(cardId);
        }
    });
    return groups;
};
const canLayOff = (card: Card, meld: string[], aceHighAllowed: boolean): boolean => {
    const cards = meld.map((cardId) => deckById.get(cardId)).filter((candidate): candidate is Card => Boolean(candidate));
    if (cards.length < 3) return false;
    if (cards.every((candidate) => candidate.rank === cards[0].rank)) return card.rank === cards[0].rank;
    if (!cards.every((candidate) => candidate.suit === cards[0].suit) || card.suit !== cards[0].suit) return false;
    const lowRun = [...cards.map((candidate) => rankValue(candidate.rank, false)), rankValue(card.rank, false)].sort((a, b) => a - b);
    const highRun = [...cards.map((candidate) => rankValue(candidate.rank, true)), rankValue(card.rank, true)].sort((a, b) => a - b);
    return consecutive(lowRun) || (aceHighAllowed && consecutive(highRun));
};

export const findBestDeadwood = (cards: Card[], aceHighAllowed: boolean): number =>
    findArrangements(cards, aceHighAllowed)[0]?.deadwoodScore ?? 0;

export const findArrangements = (cards: Card[], aceHighAllowed: boolean): MeldArrangement[] => {
    const candidates = meldCandidates(cards, aceHighAllowed);
    const results: MeldArrangement[] = [];
    const byId = new Map(cards.map((card) => [card.id, card]));
    const search = (index: number, used: Set<string>, melds: string[][]) => {
        if (index === candidates.length) {
            const deadwood = cards.map((card) => card.id).filter((cardId) => !used.has(cardId));
            results.push({ melds, deadwood, deadwoodScore: deadwood.reduce((sum, cardId) => sum + deadwoodValue(byId.get(cardId)!), 0) });
            return;
        }
        search(index + 1, used, melds);
        const candidate = candidates[index];
        if (candidate.every((cardId) => !used.has(cardId))) {
            search(index + 1, new Set([...used, ...candidate]), [...melds, candidate]);
        }
    };
    search(0, new Set(), []);
    const seen = new Set<string>();
    return results
        .filter((result) => {
            const key = `${result.melds.map((meld) => [...meld].sort().join(",")).sort().join("|")}:${[...result.deadwood].sort().join(",")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .filter((result, _index, arrangements) => !arrangements.some((other) => other !== result && isDominatedByLargerMelds(result, other)))
        .sort((a, b) => a.deadwoodScore - b.deadwoodScore || a.deadwood.length - b.deadwood.length);
};

const isDominatedByLargerMelds = (arrangement: MeldArrangement, other: MeldArrangement): boolean => {
    if (arrangement.melds.length === 0) return false;
    const used = new Set(arrangement.melds.flat());
    const otherUsed = new Set(other.melds.flat());
    if ([...used].some((cardId) => !otherUsed.has(cardId))) return false;
    let hasContainingMeld = otherUsed.size > used.size;
    return arrangement.melds.every((meld) => {
        const meldSet = new Set(meld);
        return other.melds.some((otherMeld) => {
            const otherMeldSet = new Set(otherMeld);
            const contained = [...meldSet].every((cardId) => otherMeldSet.has(cardId));
            if (contained && otherMeldSet.size > meldSet.size) {
                hasContainingMeld = true;
            }
            return contained;
        });
    }) && hasContainingMeld;
};

const meldCandidates = (cards: Card[], aceHighAllowed: boolean): string[][] => {
    const byRank = new Map<string, Card[]>();
    const bySuit = new Map<Suit, Card[]>();
    cards.forEach((card) => {
        byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
        bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);
    });
    const sets = [...byRank.values()].flatMap((group) => {
        if (group.length === 3) return [group.map((card) => card.id)];
        if (group.length === 4) return [...combinations(group, 3).map((combo) => combo.map((card) => card.id)), group.map((card) => card.id)];
        return [];
    });
    const runs = [...bySuit.values()].flatMap((group) => [
        ...runCandidates(group, false),
        ...(aceHighAllowed ? runCandidates(group, true) : [])
    ]);
    return [...sets, ...runs];
};

const runCandidates = (cards: Card[], aceHigh: boolean): string[][] => {
    const ordered = [...cards].sort((a, b) => rankValue(a.rank, aceHigh) - rankValue(b.rank, aceHigh));
    const results: string[][] = [];
    ordered.forEach((_card, start) => {
        for (let end = start + 2; end < ordered.length; end += 1) {
            const slice = ordered.slice(start, end + 1);
            if (consecutive(slice.map((card) => rankValue(card.rank, aceHigh)))) {
                results.push(slice.map((card) => card.id));
            }
        }
    });
    return results;
};

const combinations = <T,>(items: T[], size: number): T[][] => {
    if (size === 0) return [[]];
    if (items.length < size) return [];
    if (items.length === size) return [items];
    const [first, ...rest] = items;
    return [
        ...combinations(rest, size - 1).map((combo) => [first, ...combo]),
        ...combinations(rest, size)
    ];
};
