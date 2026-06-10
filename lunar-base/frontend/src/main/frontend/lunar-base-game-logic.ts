import type { LunarBaseCard, LunarBaseGame, LunarBasePlayer, LunarBaseResourceColorName } from "./lunar-base-types";

const lunarBaseResourceColorNames = ["red", "blue", "yellow", "gray"] as const;

export const isLunarBaseResourceColor = (color: string): color is LunarBaseResourceColorName =>
    lunarBaseResourceColorNames.includes(color as LunarBaseResourceColorName);

export const isDiscardableFromHand = (card: LunarBaseCard | null | undefined): card is LunarBaseCard =>
    card?.type === "influence";

export const isPlayableAgentFromHand = (card: LunarBaseCard | null | undefined): card is LunarBaseCard =>
    card?.type === "agent";

export const stationOppositeSideCard = (card: LunarBaseCard): LunarBaseCard =>
    card.type === "station" ? { ...card, flipped: !card.flipped } : card;

export const creditCost = (card: LunarBaseCard, orbs: LunarBasePlayer["orbs"]): number => {
    const counts: Record<LunarBaseResourceColorName, number> = { red: 0, blue: 0, yellow: 0, gray: 0 };
    (card.cardCost ?? []).forEach((color) => {
        if (isLunarBaseResourceColor(color)) counts[color] += 1;
    });
    const coloredRemainder =
        Math.max(0, counts.red - orbs.red) +
        Math.max(0, counts.blue - orbs.blue) +
        Math.max(0, counts.yellow - orbs.yellow) +
        counts.gray;
    return Math.max(0, coloredRemainder - orbs.gray);
};

export const canPlayCard = (card: LunarBaseCard, player: LunarBasePlayer): boolean =>
    creditCost(card, player.orbs) <= player.credits;

export const displayPlayerOrder = (game: LunarBaseGame, viewerSeat: number | null): number[] => {
    const playerIndexes = game.players.map((_, index) => index);
    if (viewerSeat === null || viewerSeat < 0 || viewerSeat >= game.players.length) return playerIndexes;
    return [...playerIndexes.slice(viewerSeat), ...playerIndexes.slice(0, viewerSeat)];
};
