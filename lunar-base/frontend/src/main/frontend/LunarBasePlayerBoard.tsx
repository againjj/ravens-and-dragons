import { type CSSProperties, type DragEvent, useMemo, useRef, useState } from "react";
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

export const setScaledDragImage = (event: DragEvent<HTMLElement>, zoom: number, rotation: CardRotation = 0) => {
    const card = event.currentTarget.querySelector(".lunar-card")?.cloneNode(true);
    if (!(card instanceof HTMLElement)) {
        return;
    }
    const dragWidth = rotation === 90 || rotation === 270 ? cardWidth * 2 : cardWidth;
    const dragHeight = rotation === 90 || rotation === 270 ? cardWidth : cardWidth * 2;
    const wrapper = document.createElement("div");
    wrapper.className = "lunar-drag-image";
    wrapper.style.width = `${dragWidth}px`;
    wrapper.style.height = `${dragHeight}px`;
    wrapper.style.zoom = String(zoom);

    card.classList.remove("is-selected");
    card.style.setProperty("--lunar-card-rotation", `${rotation}deg`);
    wrapper.appendChild(card);
    document.body.appendChild(wrapper);
    event.dataTransfer.setDragImage(wrapper, dragWidth * zoom / 2, dragHeight * zoom / 2);
    window.setTimeout(() => wrapper.remove(), 0);
};

export const PlayerBoard = ({
    board,
    selected,
    zoom,
    canAcceptDrag,
    canShowStationControls,
    canFlipStation,
    revealedStationCardId,
    stationFlipAnimations,
    draggedCard,
    draggedRotation,
    onRevealStation,
    onFlipStation,
    onPlaySelected,
    onClearSelected,
    onDropCard,
    hiddenAnimationDestinations
}: {
    board: LunarBaseBoardCard[];
    selected: { card: LunarBaseCard; rotation: CardRotation } | null;
    zoom: number;
    canAcceptDrag: boolean;
    canShowStationControls: boolean;
    canFlipStation: boolean;
    revealedStationCardId: string | null;
    stationFlipAnimations: Map<string, StationFlipAnimation>;
    draggedCard: LunarBaseCard | null;
    draggedRotation: CardRotation | null;
    onRevealStation: (cardId: string) => void;
    onFlipStation: (cardId: string) => void;
    onPlaySelected: (x: number, y: number, destination: { x: number; y: number } | null) => void;
    onClearSelected: () => void;
    onDropCard: (event: DragEvent<HTMLDivElement>, x: number, y: number, rotation: CardRotation, destination: { x: number; y: number } | null) => void;
    hiddenAnimationDestinations: Set<string>;
}) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const bounds = useMemo(() => boardBounds(board), [board]);
    const columns = bounds.maxX - bounds.minX + 1;
    const rows = bounds.maxY - bounds.minY + 1;
    const [hover, setHover] = useState<{ x: number; y: number; rotation: CardRotation } | null>(null);

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
                if (!canAcceptDrag) {
                    setHover(null);
                    return;
                }
                const rotation = draggedRotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation")));
                const snap = draggedCard ? snapFromPoint(board, bounds, event.clientX, event.clientY, rotation, draggedCard, ref.current, zoom) : null;
                setHover(snap ? { ...snap, rotation } : null);
                if (snap) event.preventDefault();
            }}
            onDrop={(event) => {
                if (!canAcceptDrag) {
                    setHover(null);
                    return;
                }
                const rotation = draggedRotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation")));
                const snap = draggedCard ? snapFromPoint(board, bounds, event.clientX, event.clientY, rotation, draggedCard, ref.current, zoom) : null;
                setHover(null);
                if (!snap) return;
                event.preventDefault();
                onDropCard(event, snap.x, snap.y, rotation, boardCardCenter(bounds, snap.x, snap.y, rotation, ref.current, zoom));
            }}
            onMouseLeave={() => setHover(null)}
            onDragLeave={() => setHover(null)}
        >
            {board.map((played) => {
                const isStation = played.card.type === "station";
                const isRevealedStation = revealedStationCardId === played.card.id;
                const stationFlipAnimation = stationFlipAnimations.get(played.card.id) ?? null;
                const displayedCard = isRevealedStation ? stationOppositeSideCard(played.card) : played.card;
                const stationControls = canShowStationControls && isStation;
                return (
                    <div
                        key={played.card.id}
                        data-lunar-animate={`board-${played.card.id}`}
                        data-movement="board card layout"
                        className={[
                            "lunar-board-card",
                            rotationToOrientation(played.rotation),
                            stationControls ? "has-station-controls" : "",
                            isRevealedStation ? "is-station-revealed" : "",
                            hiddenAnimationDestinations.has(`board-${played.card.id}`) ? "is-animation-destination-hidden" : ""
                        ].filter(Boolean).join(" ")}
                        style={{
                            left: (played.x - bounds.minX) * gridSquare,
                            top: (played.y - bounds.minY) * gridSquare
                        } as CSSProperties}
                    >
                        {stationFlipAnimation ? (
                            <StationFlipCardView animation={stationFlipAnimation} rotation={played.rotation} />
                        ) : (
                            <CardView card={displayedCard} rotation={played.rotation} />
                        )}
                        {stationControls ? (
                            <div className="lunar-station-controls" aria-label="Station controls">
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
                                {canFlipStation ? (
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
};
