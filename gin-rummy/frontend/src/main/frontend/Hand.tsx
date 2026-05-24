import { type DragEvent, type RefObject, useRef, useState } from "react";
import { CardView } from "./CardView";
import type { Card, DragSource, FlyDestination, Suit } from "./gin-rummy-types";
export const Hand = ({ handRef, cards, count, faceUp, position, canDiscard, canDrawToHand, canDiscardCard = () => true, activeDragSource, interactive, onDiscard, onDrawToHand, onReorder, onDragSourceChange, onDragCardChange }: {
    handRef?: RefObject<HTMLDivElement | null>;
    cards: Card[];
    count: number;
    faceUp: boolean;
    position: "top" | "bottom";
    canDiscard: boolean;
    canDrawToHand: boolean;
    canDiscardCard?: (cardId: string) => boolean;
    activeDragSource: DragSource | null;
    interactive: boolean;
    onDiscard: (cardId: string, clientX: number, clientY: number) => void;
    onDrawToHand: (source: "stock" | "discard", insertIndex: number, clientX: number, clientY: number, destination: FlyDestination | null) => void;
    onReorder: (cardIds: string[]) => void;
    onDragSourceChange: (source: DragSource | null) => void;
    onDragCardChange: (cardId: string | null) => void;
}) => {
    const visibleCards = faceUp ? cards : Array.from({ length: count }, (_, index) => ({ id: `hidden-${index}`, rank: "", suit: "spades" as Suit }));
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragSource, setDragSource] = useState<DragSource | null>(null);
    const [insertIndex, setInsertIndex] = useState<number | null>(null);
    const placeholderRef = useRef<HTMLDivElement | null>(null);
    const source = activeDragSource ?? dragSource;
    const draggedOriginalIndex = draggedId ? cards.findIndex((card) => card.id === draggedId) : -1;
    const baseCards = faceUp ? cards : visibleCards;
    const reorderBaseCards = source === "hand" && draggedId
        ? cards.filter((card) => card.id !== draggedId)
        : baseCards;
    const placeholderIndex = source === "hand" && draggedId
        ? insertIndex ?? Math.max(draggedOriginalIndex, 0)
        : (source === "stock" || source === "discard") && insertIndex !== null
            ? insertIndex
            : null;
    const layoutCards = source === "hand" && draggedId ? reorderBaseCards : baseCards;
    const draggedCard = draggedId ? cards.find((card) => card.id === draggedId) ?? null : null;
    const renderCards = placeholderIndex === null
        ? layoutCards
        : [
            ...layoutCards.slice(0, placeholderIndex),
            { id: "hand-placeholder", rank: "", suit: "spades" as Suit },
            ...layoutCards.slice(placeholderIndex)
        ];
    const renderItems = draggedCard && source === "hand" ? [...renderCards, draggedCard] : renderCards;
    const insertionIndexFromElements = (clientX: number, elements: HTMLElement[], currentIndex: number | null = null) => {
        if (elements.length === 0) return 0;
        const rects = elements.map((element) => element.getBoundingClientRect());
        if (currentIndex === 0 && clientX <= rects[0].right) return 0;
        if (currentIndex === elements.length && clientX >= rects[rects.length - 1].left) return elements.length;
        const fallbackStep = rects[0].width;
        for (const [index, rect] of rects.entries()) {
            const nextRect = rects[index + 1];
            const previousRect = rects[index - 1];
            const step = nextRect
                ? Math.abs(nextRect.left - rect.left)
                : previousRect
                    ? Math.abs(rect.left - previousRect.left)
                    : fallbackStep;
            if (clientX < rect.left + step / 2) return index;
        }
        return elements.length;
    };
    const insertIndexFromPointer = (event: DragEvent<HTMLElement>) => {
        const hand = event.currentTarget.closest(".gin-hand") as HTMLElement | null;
        const visibleCards = hand
            ? Array.from(hand.querySelectorAll<HTMLElement>(".gin-card-button:not(.gin-card-placeholder):not(.is-dragged)"))
            : [event.currentTarget];
        return insertionIndexFromElements(event.clientX, visibleCards, insertIndex);
    };
    const insertIndexFromHandPointer = (event: DragEvent<HTMLElement>) => {
        const visibleCards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".gin-card-button:not(.gin-card-placeholder):not(.is-dragged)"));
        return insertionIndexFromElements(event.clientX, visibleCards, insertIndex);
    };
    const placeholderDestination = (): FlyDestination | null => {
        const rect = placeholderRef.current?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    };
    const finishHandDrop = (event: DragEvent<HTMLElement>) => {
        const dropSource = activeDragSource ?? dragSource ?? event.dataTransfer.getData("application/x-gin-source") as DragSource;
        if ((dropSource === "stock" || dropSource === "discard") && canDrawToHand) {
            event.preventDefault();
            onDrawToHand(dropSource, placeholderIndex ?? baseCards.length, event.clientX, event.clientY, placeholderDestination());
        } else if (dropSource === "hand" && draggedId && faceUp) {
            const ids = cards.map((card) => card.id).filter((cardId) => cardId !== draggedId);
            ids.splice(Math.min(placeholderIndex ?? draggedOriginalIndex, ids.length), 0, draggedId);
            if (ids.join("|") !== cards.map((card) => card.id).join("|")) {
                onReorder(ids);
            }
        }
        setDraggedId(null);
        setDragSource(null);
        setInsertIndex(null);
        onDragSourceChange(null);
        onDragCardChange(null);
    };
    return (
        <div
            ref={handRef}
            className={`gin-hand gin-hand-${position}`}
            aria-label={`${position} hand`}
            onDragOver={(event) => {
                if (event.target !== event.currentTarget) return;
                if ((source === "stock" || source === "discard") && canDrawToHand) {
                    event.preventDefault();
                    setDragSource(source);
                    setInsertIndex((current) => current ?? insertIndexFromHandPointer(event));
                } else if (source === "hand" && draggedId && faceUp) {
                    event.preventDefault();
                    setInsertIndex((current) => current ?? insertIndexFromHandPointer(event));
                }
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setInsertIndex(source === "hand" && draggedId ? Math.max(draggedOriginalIndex, 0) : null);
                }
            }}
            onDrop={finishHandDrop}
        >
            {renderItems.map((card, index) => card.id === "hand-placeholder" ? (
                <div
                    key={card.id}
                    ref={placeholderRef}
                    className="gin-card-button gin-card-placeholder"
                    data-card-id={card.id}
                    style={{ zIndex: index + 1 }}
                    aria-hidden="true"
                />
            ) : (
                <button
                    key={card.id}
                    type="button"
                    className={`gin-card-button ${interactive ? "is-interactive" : "is-static"} ${draggedId === card.id ? "is-dragged" : ""} ${canDiscard && !canDiscardCard(card.id) ? "is-illegal" : ""}`}
                    data-card-id={card.id}
                    style={{ zIndex: position === "top" ? renderItems.length - index : index + 1 }}
                    draggable={faceUp && interactive}
                    onDragStart={(event) => {
                        if (!interactive) return;
                        event.dataTransfer.setData("text/plain", card.id);
                        event.dataTransfer.setData("application/x-gin-source", "hand");
                        const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
                        const rect = event.currentTarget.getBoundingClientRect();
                        dragImage.classList.remove("is-dragged");
                        dragImage.style.position = "fixed";
                        dragImage.style.top = "-1000px";
                        dragImage.style.left = "-1000px";
                        dragImage.style.width = `${rect.width}px`;
                        dragImage.style.height = `${rect.height}px`;
                        dragImage.style.margin = "0";
                        dragImage.style.pointerEvents = "none";
                        dragImage.style.setProperty("--gin-card-width", `${rect.width}px`);
                        dragImage.style.setProperty("--gin-card-height", `${rect.height}px`);
                        document.body.appendChild(dragImage);
                        event.dataTransfer.setDragImage(dragImage, event.clientX - rect.left, event.clientY - rect.top);
                        window.setTimeout(() => dragImage.remove(), 0);
                        window.requestAnimationFrame(() => {
                            setDraggedId(card.id);
                            setDragSource("hand");
                            setInsertIndex(cards.findIndex((candidate) => candidate.id === card.id));
                            onDragSourceChange("hand");
                            onDragCardChange(card.id);
                        });
                    }}
                    onDragOver={(event) => {
                        const source = activeDragSource ?? dragSource;
                        if ((source === "stock" || source === "discard") && canDrawToHand) {
                            event.preventDefault();
                            setDragSource(source);
                            setInsertIndex(insertIndexFromPointer(event));
                            return;
                        }
                        if (!interactive || source !== "hand") return;
                        event.preventDefault();
                        setInsertIndex(insertIndexFromPointer(event));
                    }}
                    onDragEnd={() => {
                        setDraggedId(null);
                        setDragSource(null);
                        setInsertIndex(null);
                        onDragSourceChange(null);
                        onDragCardChange(null);
                    }}
                    onDrop={(event) => {
                        if (!interactive) return;
                        const source = activeDragSource ?? dragSource ?? event.dataTransfer.getData("application/x-gin-source");
                        if (source === "hand") {
                            event.stopPropagation();
                            finishHandDrop(event);
                        }
                    }}
                    onClick={(event) => {
                        if (canDiscard && faceUp && interactive && canDiscardCard(card.id)) onDiscard(card.id, event.clientX, event.clientY);
                    }}
                >
                    {faceUp ? <CardView card={card} /> : <div className="gin-card-back" />}
                </button>
            ))}
        </div>
    );
};

