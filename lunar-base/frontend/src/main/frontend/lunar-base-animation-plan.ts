import type { CardMovementAnimation, LunarBaseCard, LunarBaseGame } from "./lunar-base-types";

export type AutomaticUpdate =
    | { type: "stationFlip"; from: LunarBaseCard; to: LunarBaseCard }
    | { type: "stockDraw"; viewerSeat: number; drawnCard: LunarBaseCard };

export const findAutomaticUpdate = (previous: LunarBaseGame, updated: LunarBaseGame): AutomaticUpdate | null => {
    const updatedBoardCards = updated.players.flatMap((player) => player.board);
    const flippedStation = previous.players
        .flatMap((player) => player.board)
        .map((boardCard) => {
            const next = updatedBoardCards.find((candidate) => candidate.card.id === boardCard.card.id);
            return next && boardCard.card.type === "station" && next.card.type === "station" && boardCard.card.flipped !== next.card.flipped
                ? { type: "stationFlip" as const, from: boardCard.card, to: next.card }
                : null;
        })
        .find((change): change is Extract<AutomaticUpdate, { type: "stationFlip" }> => Boolean(change));
    if (flippedStation) return flippedStation;

    const viewerSeat = previous.viewer?.seatIndex ?? null;
    const updatedViewer = updated.viewer?.seatIndex ?? null;
    const previousHandSize = previous.viewer?.hand.length ?? 0;
    const drawnCard = updated.viewer?.hand[updated.viewer.hand.length - 1] ?? null;
    const viewerDrawAction = previous.actionState?.interaction?.kind === "draw";
    if (viewerSeat !== null && viewerSeat === updatedViewer && (viewerDrawAction || updated.stockCount < previous.stockCount) && drawnCard && updated.viewer && updated.viewer.hand.length > previousHandSize) {
        return { type: "stockDraw", viewerSeat, drawnCard };
    }
    return null;
};

export const animationSourceKey = (animation: CardMovementAnimation, game: LunarBaseGame): string | null => {
    if (animation.sourceKey !== undefined) return animation.sourceKey;
    if (!animation.card) return null;
    if (animation.destination.type === "handCard") {
        return `supply-${animation.card.id}`;
    }
    const viewerSeat = game.viewer?.seatIndex;
    return viewerSeat === null || viewerSeat === undefined ? null : `hand-${viewerSeat}-${animation.card.id}`;
};
