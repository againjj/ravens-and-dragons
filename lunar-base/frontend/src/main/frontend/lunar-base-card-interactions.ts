import type { CardMovementAnimation, CardRotation, LunarBaseCard, LunarBaseGame } from "./lunar-base-types";

export type LunarCardInteractionGesture = "click" | "drop" | "modal";

export type LunarCardInteractionSource =
    | { type: "stock" }
    | { type: "supply"; slotIndex: number; card: LunarBaseCard }
    | { type: "hand"; viewerSeat: number; card: LunarBaseCard };

export type LunarCardInteractionTarget =
    | { type: "hand" }
    | { type: "discard" }
    | { type: "board"; x: number; y: number; rotation: CardRotation; to?: { x: number; y: number } | null };

export type LunarCardInteractionDecision = {
    command: Record<string, unknown>;
    animation: Omit<CardMovementAnimation, "fromX" | "fromY">;
    clearsSelection: boolean;
};

export type LunarCardInteractionContext = {
    game: LunarBaseGame;
    viewerSeat: number | null;
    canPlayAgents: boolean;
};

const handSourceKey = (viewerSeat: number, cardId: string) => `hand-${viewerSeat}-${cardId}`;
const supplySourceKey = (cardId: string) => `supply-${cardId}`;

const stockAnnotation = (gesture: LunarCardInteractionGesture) =>
    gesture === "drop" ? "drop stock card to hand" : "click stock card to hand";

const supplyAnnotation = (gesture: LunarCardInteractionGesture, target: "hand" | "discard") => {
    if (gesture === "drop") return target === "hand" ? "drop supply card to hand" : "drop supply card to discard";
    return target === "hand" ? "click supply card to hand" : "click supply card to discard";
};

const handDiscardAnnotation = (gesture: LunarCardInteractionGesture, card: LunarBaseCard, action: "play" | "discard") => {
    const description = action === "play"
        ? "agent to play"
        : `${card.type} to discard`;
    return `${gesture === "drop" ? "drop" : "click"} hand ${description}`;
};

export const resolveLunarCardInteraction = (
    source: LunarCardInteractionSource,
    target: LunarCardInteractionTarget,
    gesture: LunarCardInteractionGesture,
    context: LunarCardInteractionContext
): LunarCardInteractionDecision | null => {
    const interactionKind = context.game.actionState.interaction?.kind ?? null;
    if (source.type === "stock") {
        if (target.type !== "hand") return null;
        if (interactionKind !== "draw") return null;
        return {
            command: { type: "drawStock" },
            animation: {
                annotation: stockAnnotation(gesture),
                card: null,
                faceDown: true,
                destination: { type: "viewerHandEnd" }
            },
            clearsSelection: true
        };
    }

    if (source.type === "supply") {
        if (target.type !== "hand" && target.type !== "discard") return null;
        if (target.type === "hand" && interactionKind !== "draft") return null;
        if (target.type === "discard" && interactionKind !== "resell") return null;
        const toDiscard = target.type === "discard";
        return {
            command: { type: toDiscard ? "resellSupply" : "draftSupply", slotIndex: source.slotIndex },
            animation: {
                annotation: supplyAnnotation(gesture, target.type),
                card: source.card,
                sourceKey: supplySourceKey(source.card.id),
                destination: toDiscard ? { type: "discard" } : { type: "handCard", cardId: source.card.id },
                hiddenDestinationKey: toDiscard ? "discard" : undefined
            },
            clearsSelection: true
        };
    }

    if (target.type === "board") {
        if (source.card.type !== "module") return null;
        if (interactionKind !== "build") return null;
        return {
            command: { type: "buildModule", cardId: source.card.id, x: target.x, y: target.y, rotation: target.rotation },
            animation: {
                annotation: gesture === "drop" ? "drop hand module to board" : "click selected module to board",
                card: source.card,
                sourceKey: handSourceKey(source.viewerSeat, source.card.id),
                rotation: target.rotation,
                destination: { type: "boardCard", cardId: source.card.id },
                toX: target.to?.x,
                toY: target.to?.y
            },
            clearsSelection: true
        };
    }

    if (target.type !== "discard") return null;
    if (interactionKind === "discard") {
        return {
            command: { type: "discardHandCard", cardId: source.card.id },
            animation: {
                annotation: handDiscardAnnotation(gesture, source.card, "discard"),
                card: source.card,
                sourceKey: handSourceKey(source.viewerSeat, source.card.id),
                destination: { type: "discard" }
            },
            clearsSelection: true
        };
    }
    if (source.card.type !== "agent" || !context.canPlayAgents) {
        return null;
    }
    return {
        command: { type: "playAgent", cardId: source.card.id },
        animation: {
            annotation: handDiscardAnnotation(gesture, source.card, "play"),
            card: source.card,
            sourceKey: handSourceKey(source.viewerSeat, source.card.id),
            destination: { type: "discard" }
        },
        clearsSelection: true
    };
};
