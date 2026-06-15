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

export interface DragAutoScrollEdgeState {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
}

export interface DragAutoScrollState {
    armed: DragAutoScrollEdgeState;
}

export interface DragAutoScrollBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
    scrollLeft: number;
    scrollTop: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
}

const edgeDistances = (box: DragAutoScrollBox, clientX: number, clientY: number) => ({
    left: clientX - box.left,
    right: box.right - clientX,
    top: clientY - box.top,
    bottom: box.bottom - clientY
});

export const createDragAutoScrollState = (box: DragAutoScrollBox, clientX: number, clientY: number, threshold: number): DragAutoScrollState => {
    const distances = edgeDistances(box, clientX, clientY);
    return {
        armed: {
            left: distances.left >= threshold,
            right: distances.right >= threshold,
            top: distances.top >= threshold,
            bottom: distances.bottom >= threshold
        }
    };
};

export const dragAutoScrollDelta = (
    state: DragAutoScrollState,
    box: DragAutoScrollBox,
    clientX: number,
    clientY: number,
    threshold: number,
    maxStep = 10
): { dx: number; dy: number } => {
    const distances = edgeDistances(box, clientX, clientY);
    const nextArmed = { ...state.armed };
    (Object.keys(nextArmed) as Array<keyof DragAutoScrollEdgeState>).forEach((edge) => {
        if (!nextArmed[edge] && distances[edge] >= threshold) {
            nextArmed[edge] = true;
        }
    });
    state.armed = nextArmed;

    const step = (distance: number) => Math.max(1, Math.ceil(((threshold - distance) / threshold) * maxStep));
    const canScrollLeft = box.scrollLeft > 0;
    const canScrollRight = box.scrollLeft + box.clientWidth < box.scrollWidth;
    const canScrollUp = box.scrollTop > 0;
    const canScrollDown = box.scrollTop + box.clientHeight < box.scrollHeight;
    const dx = nextArmed.left && canScrollLeft && distances.left < threshold
        ? -step(distances.left)
        : nextArmed.right && canScrollRight && distances.right < threshold
            ? step(distances.right)
            : 0;
    const dy = nextArmed.top && canScrollUp && distances.top < threshold
        ? -step(distances.top)
        : nextArmed.bottom && canScrollDown && distances.bottom < threshold
            ? step(distances.bottom)
            : 0;
    return { dx, dy };
};
