import { forwardRef, type CSSProperties, type DragEvent, type MouseEvent, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CardView } from "./LunarBaseCard";
import { boardBounds, boardCardCenter, normalizeRotation, rotationToOrientation, snapFromPoint } from "./lunar-base-board-rules";
import { cardWidth, gridSquare } from "./lunar-base-constants";
import { stationOppositeSideCard } from "./lunar-base-game-logic";
import type { CardRotation, LunarBaseBoardCard, LunarBaseCard, StationFlipAnimation } from "./lunar-base-types";

const MagnifyIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="M15 15l5 5" />
    </svg>
);

const CircularArrowIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M17.3 17.3A7.5 7.5 0 1 1 17.3 6.7" />
        <path d="M18.8 8.2L13.3 9.2" />
        <path d="M18.8 8.2L17.8 2.7" />
    </svg>
);

const StationFlipCardView = ({
    animation,
    rotation
}: {
    animation: StationFlipAnimation;
    rotation: CardRotation;
}) => (
    <span className="lunar-flip-stage" style={{ "--lunar-card-rotation": `${rotation}deg` } as CSSProperties}>
        <span className="lunar-flip-face is-flip-front">
            <CardView card={animation.from} />
        </span>
        <span className="lunar-flip-face is-flip-back">
            <CardView card={animation.to} />
        </span>
    </span>
);

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

export interface DragImageMetrics {
    centerOffsetX: number;
    centerOffsetY: number;
}

export const setScaledDragImage = (event: DragEvent<HTMLElement>, zoom: number, rotation: CardRotation = 0) => {
    const sourceCard = event.currentTarget.querySelector(".lunar-card");
    const card = sourceCard?.cloneNode(true);
    if (!(sourceCard instanceof HTMLElement) || !(card instanceof HTMLElement)) {
        return;
    }
    const dragWidth = rotation === 90 || rotation === 270 ? cardWidth * 2 : cardWidth;
    const dragHeight = rotation === 90 || rotation === 270 ? cardWidth : cardWidth * 2;
    const sourceRect = sourceCard.getBoundingClientRect();
    const renderedWidth = sourceRect.width || dragWidth * zoom;
    const renderedHeight = sourceRect.height || dragHeight * zoom;
    const rawOffsetX = event.clientX - sourceRect.left;
    const rawOffsetY = event.clientY - sourceRect.top;
    const offsetX = sourceRect.width > 0 && Number.isFinite(rawOffsetX) ? clamp(rawOffsetX, 0, renderedWidth) : renderedWidth / 2;
    const offsetY = sourceRect.height > 0 && Number.isFinite(rawOffsetY) ? clamp(rawOffsetY, 0, renderedHeight) : renderedHeight / 2;
    const metrics = {
        centerOffsetX: renderedWidth / 2 - offsetX,
        centerOffsetY: renderedHeight / 2 - offsetY
    };
    const wrapper = document.createElement("div");
    wrapper.className = "lunar-drag-image";
    wrapper.style.width = `${dragWidth}px`;
    wrapper.style.height = `${dragHeight}px`;
    wrapper.style.zoom = String(zoom);

    card.classList.remove("is-selected");
    card.style.setProperty("--lunar-card-rotation", `${rotation}deg`);
    wrapper.appendChild(card);
    document.body.appendChild(wrapper);
    event.dataTransfer.setDragImage(wrapper, offsetX, offsetY);
    window.setTimeout(() => wrapper.remove(), 0);
    return metrics;
};

export interface PlayerBoardHandle {
    clearHover: () => void;
    dragOver: (event: DragEvent<HTMLElement>) => boolean;
    drop: (event: DragEvent<HTMLElement>) => boolean;
}

export const PlayerBoard = forwardRef<PlayerBoardHandle, {
    board: LunarBaseBoardCard[];
    selected: { card: LunarBaseCard; rotation: CardRotation } | null;
    zoom: number;
    canAcceptDrag: boolean;
    canShowStationControls: boolean;
    canFlipStation: boolean;
    canChooseMainAction: boolean;
    shouldDimUntargetableCards: boolean;
    canFlipStationCard: (cardId: string) => boolean;
    canStealBoardCard: (card: LunarBaseCard) => boolean;
    revealedStationCardId: string | null;
    stationFlipAnimations: Map<string, StationFlipAnimation>;
    draggedCard: LunarBaseCard | null;
    draggedRotation: CardRotation | null;
    dragImageMetrics: DragImageMetrics | null;
    onRevealStation: (cardId: string) => void;
    onFlipStation: (cardId: string) => void;
    onChooseMainAction: (cardId: string) => void;
    onSelectStealCard: (card: LunarBaseCard, event: MouseEvent<HTMLElement>) => void;
    onStartStealDrag: (card: LunarBaseCard, event: DragEvent<HTMLElement>) => void;
    onPlaySelected: (x: number, y: number, destination: { x: number; y: number } | null) => void;
    onClearSelected: () => void;
    onDropCard: (event: DragEvent<HTMLElement>, x: number, y: number, rotation: CardRotation, destination: { x: number; y: number } | null) => void;
    hiddenAnimationDestinations: Set<string>;
}>(function PlayerBoard({
    board,
    selected,
    zoom,
    canAcceptDrag,
    canShowStationControls,
    canFlipStation,
    canChooseMainAction,
    shouldDimUntargetableCards,
    canFlipStationCard,
    canStealBoardCard,
    revealedStationCardId,
    stationFlipAnimations,
    draggedCard,
    draggedRotation,
    dragImageMetrics,
    onRevealStation,
    onFlipStation,
    onChooseMainAction,
    onSelectStealCard,
    onStartStealDrag,
    onPlaySelected,
    onClearSelected,
    onDropCard,
    hiddenAnimationDestinations
}, forwardedRef) {
    const ref = useRef<HTMLDivElement | null>(null);
    const bounds = useMemo(() => boardBounds(board), [board]);
    const columns = bounds.maxX - bounds.minX + 1;
    const rows = bounds.maxY - bounds.minY + 1;
    const [hover, setHover] = useState<{ x: number; y: number; rotation: CardRotation } | null>(null);
    const dragCenter = (event: DragEvent<HTMLDivElement>) => {
        const dataOffsetX = Number(event.dataTransfer.getData("centerOffsetX"));
        const dataOffsetY = Number(event.dataTransfer.getData("centerOffsetY"));
        const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
        const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
        return {
            x: clientX + (dragImageMetrics?.centerOffsetX ?? (Number.isFinite(dataOffsetX) ? dataOffsetX : 0)),
            y: clientY + (dragImageMetrics?.centerOffsetY ?? (Number.isFinite(dataOffsetY) ? dataOffsetY : 0))
        };
    };
    const dragSnap = (event: DragEvent<HTMLElement>) => {
        if (!canAcceptDrag) return null;
        const rotation = draggedRotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation")));
        const center = dragCenter(event as DragEvent<HTMLDivElement>);
        const snap = draggedCard ? snapFromPoint(board, bounds, center.x, center.y, rotation, draggedCard, ref.current, zoom) : null;
        return snap ? { snap, rotation } : null;
    };
    const handleDragOver = (event: DragEvent<HTMLElement>) => {
        const result = dragSnap(event);
        setHover(result ? { ...result.snap, rotation: result.rotation } : null);
        if (result) event.preventDefault();
        return Boolean(result);
    };
    const handleDrop = (event: DragEvent<HTMLElement>) => {
        const result = dragSnap(event);
        setHover(null);
        if (!result) return false;
        event.preventDefault();
        onDropCard(event, result.snap.x, result.snap.y, result.rotation, boardCardCenter(bounds, result.snap.x, result.snap.y, result.rotation, ref.current, zoom));
        return true;
    };

    useImperativeHandle(forwardedRef, () => ({
        clearHover: () => setHover(null),
        dragOver: handleDragOver,
        drop: handleDrop
    }));

    return (
        <div
            ref={ref}
            className="lunar-board"
            style={{ width: columns * gridSquare, height: rows * gridSquare } as CSSProperties}
            onClick={(event) => {
                if (!selected) return;
                const snap = snapFromPoint(board, bounds, event.clientX, event.clientY, selected.rotation, selected.card, ref.current, zoom);
                if (snap) {
                    setHover(null);
                    onPlaySelected(snap.x, snap.y, boardCardCenter(bounds, snap.x, snap.y, selected.rotation, ref.current, zoom));
                } else {
                    setHover(null);
                    onClearSelected();
                }
            }}
            onMouseMove={(event) => {
                if (!selected) return;
                const snap = snapFromPoint(board, bounds, event.clientX, event.clientY, selected.rotation, selected.card, ref.current, zoom);
                setHover(snap ? { ...snap, rotation: selected.rotation } : null);
            }}
            onDragOver={(event) => {
                if (!handleDragOver(event)) setHover(null);
            }}
            onDrop={(event) => {
                handleDrop(event);
            }}
            onMouseLeave={() => setHover(null)}
            onDragLeave={() => setHover(null)}
        >
            {board.map((played) => {
                const isStation = played.card.type === "station";
                const isRevealedStation = revealedStationCardId === played.card.id;
                const stationFlipAnimation = stationFlipAnimations.get(played.card.id) ?? null;
                const displayedCard = isRevealedStation ? stationOppositeSideCard(played.card) : played.card;
                const hasMainAction = Boolean(displayedCard.mainActionText || (displayedCard.type === "station" && (displayedCard.flipped ? displayedCard.stationBackMainActionText : displayedCard.stationFrontMainActionText)));
                const chooseMainAction = !isRevealedStation && canChooseMainAction && hasMainAction;
                const flipTarget = !isRevealedStation && canFlipStation && isStation && canFlipStationCard(played.card.id);
                const stealTarget = !isRevealedStation && canStealBoardCard(played.card);
                const revealControls = canShowStationControls && isStation;
                const stationControls = revealControls || flipTarget;
                const cardTarget = chooseMainAction || flipTarget || stealTarget;
                const dimmedCard = shouldDimUntargetableCards && !cardTarget && !isRevealedStation;
                return (
                    <div
                        key={played.card.id}
                        data-lunar-animate={`board-${played.card.id}`}
                        data-movement="board card layout"
                        className={[
                            "lunar-board-card",
                            rotationToOrientation(played.rotation),
                            stationControls ? "has-station-controls" : "",
                            chooseMainAction ? "can-choose-main-action" : "",
                            cardTarget ? "is-card-target" : "",
                            dimmedCard ? "is-card-dimmed" : "",
                            isRevealedStation ? "is-station-revealed" : "",
                            hiddenAnimationDestinations.has(`board-${played.card.id}`) ? "is-animation-destination-hidden" : ""
                        ].filter(Boolean).join(" ")}
                        style={{
                            left: (played.x - bounds.minX) * gridSquare,
                            top: (played.y - bounds.minY) * gridSquare
                        } as CSSProperties}
                        role={chooseMainAction || stealTarget ? "button" : undefined}
                        tabIndex={chooseMainAction || stealTarget ? 0 : undefined}
                        draggable={stealTarget}
                        onClick={(event) => {
                            if (stealTarget) {
                                event.stopPropagation();
                                onSelectStealCard(played.card, event);
                                return;
                            }
                            if (!chooseMainAction) return;
                            event.stopPropagation();
                            onChooseMainAction(played.card.id);
                        }}
                        onKeyDown={(event) => {
                            if (!chooseMainAction && !stealTarget) return;
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            if (stealTarget) {
                                onSelectStealCard(played.card, event as unknown as MouseEvent<HTMLElement>);
                                return;
                            }
                            onChooseMainAction(played.card.id);
                        }}
                        onDragStart={(event) => {
                            if (!stealTarget) return;
                            onStartStealDrag(played.card, event);
                        }}
                    >
                        {stationFlipAnimation ? (
                            <StationFlipCardView animation={stationFlipAnimation} rotation={played.rotation} />
                        ) : (
                            <CardView card={displayedCard} rotation={played.rotation} actionClickable={cardTarget} />
                        )}
                        {stationControls ? (
                            <div className="lunar-station-controls" aria-label="Station controls">
                                {revealControls ? (
                                    <button
                                        type="button"
                                        className="lunar-station-control"
                                        aria-label="Reveal other station side"
                                        title="Reveal other side"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onRevealStation(played.card.id);
                                        }}
                                    >
                                        <MagnifyIcon />
                                    </button>
                                ) : null}
                                {flipTarget ? (
                                    <button
                                        type="button"
                                        className="lunar-station-control"
                                        aria-label="Flip station"
                                        title="Flip station"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onFlipStation(played.card.id);
                                        }}
                                    >
                                        <CircularArrowIcon />
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                );
            })}
            {hover ? (
                <div
                    className={["lunar-board-hover", rotationToOrientation(hover.rotation)].join(" ")}
                    style={{
                        left: (hover.x - bounds.minX) * gridSquare,
                        top: (hover.y - bounds.minY) * gridSquare,
                        "--lunar-card-rotation": `${hover.rotation}deg`
                    } as CSSProperties}
                />
            ) : null}
        </div>
    );
});
