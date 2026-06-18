import type { CardMovementAnimation, CardRotation, LunarBaseCard } from "./lunar-base-types";

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

const handSourceKey = (viewerSeat: number, cardId: string) => `hand-${viewerSeat}-${cardId}`;
const supplySourceKey = (cardId: string) => `supply-${cardId}`;

const stockAnnotation = (gesture: LunarCardInteractionGesture) =>
    gesture === "drop" ? "drop stock card to hand" : "click stock card to hand";

const supplyAnnotation = (gesture: LunarCardInteractionGesture, target: "hand" | "discard") => {
    if (gesture === "drop") return target === "hand" ? "drop supply card to hand" : "drop supply card to discard";
    return target === "hand" ? "click supply card to hand" : "click supply card to discard";
};

const handDiscardAnnotation = (gesture: LunarCardInteractionGesture, card: LunarBaseCard) => {
    const action = card.type === "agent" ? "agent to play" : "influence to discard";
    return `${gesture === "drop" ? "drop" : "click"} hand ${action}`;
};

export const resolveLunarCardInteraction = (
    source: LunarCardInteractionSource,
    target: LunarCardInteractionTarget,
    gesture: LunarCardInteractionGesture
): LunarCardInteractionDecision | null => {
    if (source.type === "stock") {
        if (target.type !== "hand") return null;
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
        const toDiscard = target.type === "discard";
        return {
            command: { type: toDiscard ? "discardSupply" : "takeSupply", slotIndex: source.slotIndex },
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
        return {
            command: { type: "playModule", cardId: source.card.id, x: target.x, y: target.y, rotation: target.rotation },
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
    if (source.card.type !== "agent" && source.card.type !== "influence") return null;
    return {
        command: { type: source.card.type === "agent" ? "playAgent" : "discardHandCard", cardId: source.card.id },
        animation: {
            annotation: handDiscardAnnotation(gesture, source.card),
            card: source.card,
            sourceKey: handSourceKey(source.viewerSeat, source.card.id),
            destination: { type: "discard" }
        },
        clearsSelection: true
    };
};
