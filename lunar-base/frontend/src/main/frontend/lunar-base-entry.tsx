import { type CSSProperties, type DragEvent, type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    fetchAuthSession,
    fetchUsers,
    isServerUnavailableError,
    isUnauthorizedError,
    notifyAuthSessionExpired,
    notifyServerUnavailable,
    serverUnavailableMessage,
    sessionExpiredMessage
} from "@ravensanddragons/platform-frontend/api-client";
import type { AuthUserSummary } from "@ravensanddragons/platform-frontend/auth-types";
import { buildGameCreatePath, type GameEntry, type GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";
import { PlayerPicker } from "@ravensanddragons/platform-frontend/player-picker";
import { CardView } from "./LunarBaseCard";
import { PlayerBoard, setScaledDragImage, type DragImageMetrics, type PlayerBoardHandle } from "./LunarBasePlayerBoard";
import { createLunarBaseGame, fetchLunarBaseGame, sendCommand } from "./lunar-base-api";
import { boardCardRectAtPoint, canPlayHandCard, nextRotation, normalizeRotation } from "./lunar-base-board-rules";
import { cardAnimationDurationMs, cardGap, cardWidth, emptyLifecycle, layoutAnimationSelector, maxZoom, minZoom, playRoutePattern, portalRoot, rectCenter } from "./lunar-base-constants";
import { displayPlayerOrder, isDiscardableFromHand, isPlayableAgentFromHand, stationOppositeSideCard } from "./lunar-base-game-logic";
import { clipZoomPercent, nextZoomStep, sanitizeZoomText, useLunarBaseZoom, zoomPercentToZoom, zoomTextToPercent, zoomToPercent } from "./useLunarBaseZoom";
import { lunarBaseColors, type CardMovementAnimation, type CardRotation, type CardType, type DragSource, type FlyingCard, type LunarBaseBoardCard, type LunarBaseCard, type LunarBaseColorName, type LunarBaseGame, type SelectedCard, type StationFlipAnimation, type StationRevealState } from "./lunar-base-types";
import "./lunar-base.css";
const handEndCardKey = (game: LunarBaseGame, playerIndex: number): string | null => {
    if (game.viewer?.seatIndex === playerIndex) {
        const hand = game.viewer.hand;
        const card = hand.length > 0 ? hand[hand.length - 1] : null;
        return card ? `hand-${playerIndex}-${card.id}` : null;
    }
    const handCount = game.players[playerIndex]?.handCount ?? 0;
    return handCount > 0 ? `hand-${playerIndex}-back-${playerIndex}-${handCount - 1}` : null;
};

const handEndRect = (
    game: LunarBaseGame,
    playerIndex: number,
    layoutRects: Map<string, DOMRect>,
    handAreaRects: Map<number, DOMRect>
): DOMRect | null => {
    const cardKey = handEndCardKey(game, playerIndex);
    return (cardKey ? layoutRects.get(cardKey) ?? null : null) ?? handAreaRects.get(playerIndex) ?? null;
};

const handAreaRectsFromRefs = (refs: Map<number, HTMLElement>): Map<number, DOMRect> =>
    new Map(Array.from(refs.entries()).map(([playerIndex, element]) => [playerIndex, element.getBoundingClientRect()]));

const animatedElementRect = (key: string): DOMRect | null => {
    const element = Array.from(document.querySelectorAll<HTMLElement>("[data-lunar-animate]"))
        .find((candidate) => candidate.dataset.lunarAnimate === key);
    return element?.getBoundingClientRect() ?? null;
};

const viewerHandDestinationPoint = (
    game: LunarBaseGame,
    handCardRefs: Map<string, HTMLElement>,
    handAreaRefs: Map<number, HTMLElement>
): { x: number; y: number } | null => {
    const viewerSeat = game.viewer?.seatIndex;
    if (viewerSeat === null || viewerSeat === undefined) return null;
    const hand = game.viewer?.hand ?? [];
    const lastCard = hand.length > 0 ? hand[hand.length - 1] : null;
    const lastCardRect = lastCard ? handCardRefs.get(lastCard.id)?.getBoundingClientRect() : null;
    if (lastCardRect) {
        return { x: lastCardRect.left + lastCardRect.width / 2 + cardWidth + cardGap, y: lastCardRect.top + lastCardRect.height / 2 };
    }
    const handAreaRect = handAreaRefs.get(viewerSeat)?.getBoundingClientRect();
    return handAreaRect ? { x: handAreaRect.left + cardWidth / 2, y: handAreaRect.top + cardWidth } : null;
};

const animationSourceKey = (animation: CardMovementAnimation, game: LunarBaseGame): string | null => {
    if (!animation.card) return null;
    if (animation.destination.type === "handCard") {
        return `supply-${animation.card.id}`;
    }
    const viewerSeat = game.viewer?.seatIndex;
    return viewerSeat === null || viewerSeat === undefined ? null : `hand-${viewerSeat}-${animation.card.id}`;
};

const removedSupplyCards = (previous: LunarBaseGame, current: LunarBaseGame): LunarBaseCard[] => {
    const currentIds = new Set(current.supply.filter((card): card is LunarBaseCard => Boolean(card)).map((card) => card.id));
    return previous.supply.filter((card): card is LunarBaseCard => {
        if (!card) return false;
        return !currentIds.has(card.id);
    });
};

const newBoardCards = (previous: LunarBaseGame, current: LunarBaseGame, playerIndex: number): LunarBaseBoardCard[] => {
    const previousCards = new Set(previous.players[playerIndex]?.board.map((card) => card.card.id) ?? []);
    return current.players[playerIndex]?.board.filter((card) => !previousCards.has(card.card.id)) ?? [];
};

const readGameIdFromLocation = (): string | null => {
    const routeGameId = window.location.pathname.match(playRoutePattern)?.[1] ?? null;
    return routeGameId ? decodeURIComponent(routeGameId) : null;
};

const CreateLunarBaseScreen = ({ onStartGame }: { gameName: string; onStartGame: (options?: GameStartOptions | boolean) => void }) => {
    const [playerCount, setPlayerCount] = useState(2);
    const [useInfluences, setUseInfluences] = useState(false);
    const [publiclyListed, setPubliclyListed] = useState(true);

    return (
        <section className="panel lunar-create-panel">
            <div className="page-header-copy">
                <h2>Create Lunar Base</h2>
            </div>
            <div className="lunar-create-options">
                <label className="control-row lunar-create-row">
                    <span className="control-label">Player count</span>
                    <input
                        className="text-input"
                        type="number"
                        min="2"
                        max="6"
                        value={playerCount}
                        onChange={(event) => setPlayerCount(Math.min(6, Math.max(2, Number(event.target.value))))}
                    />
                </label>
                <label className="checkbox-row">
                    <input type="checkbox" checked={useInfluences} onChange={(event) => setUseInfluences(event.target.checked)} />
                    <span>Use Influences</span>
                </label>
                <label className="checkbox-row">
                    <input type="checkbox" checked={publiclyListed} onChange={(event) => setPubliclyListed(event.target.checked)} />
                    <span>Publicly list game</span>
                </label>
            </div>
            <button type="button" onClick={() => onStartGame({ publiclyListed, playerCount, useInfluences })}>Start</button>
        </section>
    );
};

const OrbValue = ({ color, value }: { color: Exclude<LunarBaseColorName, "orange">; value: number }) => (
    <span className="lunar-orb-value">
        {value} <span className="lunar-orb-swatch" style={{ "--lunar-orb-color": lunarBaseColors[color].css } as CSSProperties} aria-label={color} />
    </span>
);

const PlayerPanel = ({
    game,
    playerIndex,
    currentUserId,
    onOpenPicker
}: {
    game: LunarBaseGame;
    playerIndex: number;
    currentUserId: string | null;
    onOpenPicker: (seatIndex: number) => void;
}) => {
    const seat = game.seats[playerIndex];
    const player = game.players[playerIndex];
    const isCurrentUser = seat.userId !== null && seat.userId === currentUserId;
    const isCurrentPlayer = playerIndex === game.currentPlayerIndex;
    return (
        <section className="panel lunar-player-panel">
            <div className="lunar-player-name">
                {seat.userId ? <strong>{seat.displayName ?? `Player ${playerIndex + 1}`}</strong> : <button type="button" onClick={() => onOpenPicker(playerIndex)}>Add Player</button>}
                {isCurrentPlayer ? <span>(Current player)</span> : null}
            </div>
            <p>Orbs: <OrbValue color="red" value={player.orbs.red} />, <OrbValue color="blue" value={player.orbs.blue} />, <OrbValue color="yellow" value={player.orbs.yellow} />, <OrbValue color="gray" value={player.orbs.gray} /></p>
            <p>Lunar credits: {player.credits}/20</p>
            <p>Colonists housed: {player.colonists}/10</p>
            <p>Scientific achievements: {player.achievements}/5</p>
            {isCurrentUser ? <p>Influences in hand: {player.influenceHandCount}/4</p> : null}
        </section>
    );
};

const LunarBasePlayScreen = () => {
    const gameId = useMemo(readGameIdFromLocation, []);
    const [game, setGame] = useState<LunarBaseGame | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
    const [players, setPlayers] = useState<AuthUserSummary[]>([]);
    const [activePickerSeat, setActivePickerSeat] = useState<number | null>(null);
    const { zoom, setZoom, zoomText, setZoomText } = useLunarBaseZoom();
    const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
    const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
    const [draggingSupply, setDraggingSupply] = useState<{ slotIndex: number; card: LunarBaseCard } | null>(null);
    const [draggingSource, setDraggingSource] = useState<DragSource | null>(null);
    const [draggingRotation, setDraggingRotation] = useState<CardRotation | null>(null);
    const [draggingSourceKey, setDraggingSourceKey] = useState<string | null>(null);
    const [dragImageMetrics, setDragImageMetrics] = useState<DragImageMetrics | null>(null);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const [hiddenAnimationDestinations, setHiddenAnimationDestinations] = useState<Set<string>>(() => new Set());
    const [discardAnimationPlaceholder, setDiscardAnimationPlaceholder] = useState<LunarBaseCard | null>(null);
    const [instantRotationCardIds, setInstantRotationCardIds] = useState<Set<string>>(() => new Set());
    const [stationReveal, setStationReveal] = useState<StationRevealState | null>(null);
    const [stationFlipAnimations, setStationFlipAnimations] = useState<Map<string, StationFlipAnimation>>(() => new Map());
    const flyKey = useRef(0);
    const tableScrollRef = useRef<HTMLDivElement | null>(null);
    const handCardRefs = useRef(new Map<string, HTMLElement>());
    const boardRefs = useRef(new Map<number, PlayerBoardHandle>());
    const discardRef = useRef<HTMLDivElement | null>(null);
    const handAreaRefs = useRef(new Map<number, HTMLElement>());
    const previousLayoutRects = useRef(new Map<string, DOMRect>());
    const previousHandAreaRects = useRef(new Map<number, DOMRect>());
    const previousGame = useRef<LunarBaseGame | null>(null);
    const dragImageMetricsRef = useRef<DragImageMetrics | null>(null);
    const returningDragRef = useRef(false);
    const suppressedLayoutAnimations = useRef(new Set<string>());
    const commandAnimationPending = useRef(false);

    const setZoomPreservingCenter = (nextZoom: number) => {
        const scroller = tableScrollRef.current;
        const previousZoom = zoom;
        const clippedZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
        if (!scroller || clippedZoom === previousZoom) {
            setZoom(clippedZoom);
            setZoomText(`${zoomToPercent(clippedZoom)}%`);
            return;
        }

        const centerX = (scroller.scrollLeft + scroller.clientWidth / 2) / previousZoom;
        const centerY = (scroller.scrollTop + scroller.clientHeight / 2) / previousZoom;
        setZoom(clippedZoom);
        setZoomText(`${zoomToPercent(clippedZoom)}%`);
        requestAnimationFrame(() => {
            scroller.scrollLeft = centerX * clippedZoom - scroller.clientWidth / 2;
            scroller.scrollTop = centerY * clippedZoom - scroller.clientHeight / 2;
            previousLayoutRects.current = new Map(
                Array.from(document.querySelectorAll<HTMLElement>(layoutAnimationSelector)).map((element) => [element.dataset.lunarAnimate ?? "", element.getBoundingClientRect()])
            );
            previousHandAreaRects.current = handAreaRectsFromRefs(handAreaRefs.current);
        });
    };

    const finishZoomInput = () => {
        const percent = zoomTextToPercent(zoomText);
        const nextPercent = percent === null ? zoomToPercent(zoom) : clipZoomPercent(percent);
        setZoomPreservingCenter(nextPercent / 100);
    };

    const captureLayoutSnapshot = () => {
        previousLayoutRects.current = new Map(
            Array.from(document.querySelectorAll<HTMLElement>(layoutAnimationSelector)).map((element) => [element.dataset.lunarAnimate ?? "", element.getBoundingClientRect()])
        );
        previousHandAreaRects.current = handAreaRectsFromRefs(handAreaRefs.current);
    };

    const hideAnimationDestination = (key: string | null, discardPlaceholder?: LunarBaseCard | null) => {
        if (!key) return;
        setHiddenAnimationDestinations((current) => new Set(current).add(key));
        if (key === "discard" && discardPlaceholder !== undefined) {
            setDiscardAnimationPlaceholder(discardPlaceholder);
        }
    };

    const showAnimationDestination = (key: string | null) => {
        if (!key) return;
        setHiddenAnimationDestinations((current) => {
            const nextHidden = new Set(current);
            nextHidden.delete(key);
            return nextHidden;
        });
        if (key === "discard") {
            setDiscardAnimationPlaceholder(null);
        }
    };

    const loadGame = useCallback(() => {
        if (!gameId) {
            setMessage("Game ID is missing.");
            return;
        }
        if (commandAnimationPending.current) {
            return;
        }
        void fetchLunarBaseGame(gameId)
            .then((loadedGame) => {
                captureLayoutSnapshot();
                setGame(loadedGame);
                setMessage(null);
            })
            .catch((error: unknown) => handleAsyncError(error, setMessage, "Unable to load Lunar Base."));
    }, [gameId]);

    useEffect(() => {
        loadGame();
    }, [loadGame]);

    useEffect(() => {
        void fetchAuthSession().then((session) => setCurrentUser(session.user)).catch(() => setCurrentUser(null));
    }, []);

    useEffect(() => {
        if (activePickerSeat !== null) {
            void fetchUsers().then(setPlayers).catch(() => setPlayers([]));
        }
    }, [activePickerSeat]);

    useEffect(() => {
        if (!gameId) return;
        const stream = new EventSource(`/api/games/${encodeURIComponent(gameId)}/stream`);
        stream.addEventListener("game", () => loadGame());
        stream.onerror = () => {
            notifyServerUnavailable();
            stream.close();
        };
        return () => stream.close();
    }, [gameId, loadGame]);

    useEffect(() => {
        if (!selectedCard || selectedCard.visualRotation === 0 || selectedCard.visualRotation % 360 !== 0) {
            return;
        }
        const cardId = selectedCard.cardId;
        const visualRotation = selectedCard.visualRotation;
        const timer = window.setTimeout(() => {
            setInstantRotationCardIds((current) => new Set(current).add(cardId));
            setSelectedCard((current) => current?.cardId === cardId && current.visualRotation === visualRotation
                ? { ...current, visualRotation: 0 }
                : current);
            requestAnimationFrame(() => {
                setInstantRotationCardIds((current) => {
                    const next = new Set(current);
                    next.delete(cardId);
                    return next;
                });
            });
        }, cardAnimationDurationMs);
        return () => window.clearTimeout(timer);
    }, [selectedCard]);

    useEffect(() => {
        if (!game || !stationReveal) return;
        const stillPresent = game.players.some((player) => player.board.some((boardCard) => boardCard.card.id === stationReveal.cardId));
        if (!stillPresent) setStationReveal(null);
    }, [game, stationReveal]);

    useLayoutEffect(() => {
        if (!game) return;
        const elements = Array.from(document.querySelectorAll<HTMLElement>(layoutAnimationSelector));
        const currentRects = new Map(elements.map((element) => [element.dataset.lunarAnimate ?? "", element.getBoundingClientRect()]));
        const previousRects = previousLayoutRects.current;
        const oldGame = previousGame.current;
        if (oldGame && previousRects.size > 0) {
            const oldStock = previousRects.get("stock");
            const oldDiscard = previousRects.get("discard");
            const currentHandAreaRects = handAreaRectsFromRefs(handAreaRefs.current);
            const removedSupply = removedSupplyCards(oldGame, game);
            const viewerSeatForGame = game.viewer?.seatIndex ?? null;
            game.players.forEach((player, playerIndex) => {
                if (playerIndex === viewerSeatForGame) return;
                const oldPlayer = oldGame.players[playerIndex];
                if (!oldPlayer) return;
                const previousHandEnd = handEndRect(oldGame, playerIndex, previousRects, previousHandAreaRects.current);
                const currentHandEnd = handEndRect(game, playerIndex, currentRects, currentHandAreaRects);
                const addedBoardCards = newBoardCards(oldGame, game, playerIndex);
                if (addedBoardCards.length > 0 && previousHandEnd) {
                    addedBoardCards.forEach((boardCard) => {
                        const destination = currentRects.get(`board-${boardCard.card.id}`);
                        if (!destination) return;
                        const from = rectCenter(previousHandEnd);
                        const to = rectCenter(destination);
                        suppressedLayoutAnimations.current.add(`board-${boardCard.card.id}`);
                        animateCard({
                            annotation: "opponent play module from hand end to board",
                            card: boardCard.card,
                            rotation: boardCard.rotation,
                            fromX: from.x,
                            fromY: from.y,
                            destination: { type: "boardCard", cardId: boardCard.card.id },
                            hiddenDestinationKey: `board-${boardCard.card.id}`
                        }, to.x, to.y);
                    });
                    return;
                }
                if (player.handCount < oldPlayer.handCount && game.discardTop && previousHandEnd) {
                    const discard = currentRects.get("discard");
                    if (discard) {
                        const from = rectCenter(previousHandEnd);
                        const to = rectCenter(discard);
                        animateCard({
                            annotation: "opponent discard from hand end to discard",
                            card: game.discardTop,
                            fromX: from.x,
                            fromY: from.y,
                            destination: { type: "discard" },
                            hiddenDestinationKey: "discard"
                        }, to.x, to.y);
                        setDiscardAnimationPlaceholder(oldGame.discardTop);
                    }
                    return;
                }
                if (player.handCount > oldPlayer.handCount && currentHandEnd) {
                    const to = rectCenter(currentHandEnd);
                    const supplyCard = removedSupply.shift();
                    if (supplyCard) {
                        const source = previousRects.get(`supply-${supplyCard.id}`);
                        if (!source) return;
                        const from = rectCenter(source);
                        animateCard({
                            annotation: "opponent take supply to hand end",
                            card: supplyCard,
                            fromX: from.x,
                            fromY: from.y,
                            destination: { type: "viewerHandEnd" },
                            hiddenDestinationKey: handEndCardKey(game, playerIndex)
                        }, to.x, to.y);
                        return;
                    }
                    if (oldStock) {
                        const from = rectCenter(oldStock);
                        animateCard({
                            annotation: "opponent draw stock to hand end",
                            card: null,
                            faceDown: true,
                            fromX: from.x,
                            fromY: from.y,
                            destination: { type: "viewerHandEnd" },
                            hiddenDestinationKey: handEndCardKey(game, playerIndex)
                        }, to.x, to.y);
                    }
                }
            });
            elements.forEach((element) => {
                const key = element.dataset.lunarAnimate;
                const current = key ? currentRects.get(key) : null;
                if (!key || !current) return;
                if (suppressedLayoutAnimations.current.has(key)) return;
                const previous = previousRects.get(key);
                const dealFromStock = !previous && key.startsWith("supply-") ? oldStock : null;
                const shuffleFromDiscard = key === "stock" && oldGame.discardCount > 0 && game.discardCount === 0 && game.stockCount > oldGame.stockCount ? oldDiscard : null;
                const origin = previous ?? dealFromStock ?? shuffleFromDiscard;
                if (!origin) return;
                const dx = origin.left + origin.width / 2 - (current.left + current.width / 2);
                const dy = origin.top + origin.height / 2 - (current.top + current.height / 2);
                if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
                element.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)` },
                        { transform: "translate(0, 0)" }
                    ],
                    { duration: 500, easing: "ease" }
                );
            });
            suppressedLayoutAnimations.current.clear();
        }
        previousGame.current = game;
    }, [game]);

    const currentAnimationDestinationPoint = (animation: CardMovementAnimation): { x: number; y: number } | null => {
        if (animation.toX !== undefined && animation.toY !== undefined) {
            return { x: animation.toX, y: animation.toY };
        }
        if (!game) return null;
        if (animation.destination.type === "discard") {
            const rect = discardRef.current?.getBoundingClientRect();
            return rect ? rectCenter(rect) : null;
        }
        if (animation.destination.type === "viewerHandEnd" || animation.destination.type === "handCard") {
            return viewerHandDestinationPoint(game, handCardRefs.current, handAreaRefs.current);
        }
        return null;
    };

    const runCommand = (command: Record<string, unknown>, animation?: CardMovementAnimation) => {
        if (!game || isSubmitting) return;
        setIsSubmitting(true);
        const animationDestination = animation ? currentAnimationDestinationPoint(animation) : null;
        const sourceKey = animation && animationDestination ? animationSourceKey(animation, game) : null;
        if (animation) {
            commandAnimationPending.current = true;
            hideAnimationDestination(sourceKey);
        }
        void sendCommand(game, command)
            .then((updated) => {
                if (animation && animationDestination) {
                    animateCard(animation, animationDestination.x, animationDestination.y, null, () => {
                        showAnimationDestination(sourceKey);
                        captureLayoutSnapshot();
                        if (animation.destination.type === "boardCard") {
                            previousLayoutRects.current.set(
                                `board-${animation.destination.cardId}`,
                                boardCardRectAtPoint(animationDestination, animation.rotation, zoom)
                            );
                        }
                        setGame(updated);
                        setMessage(updated.message);
                        commandAnimationPending.current = false;
                        setIsSubmitting(false);
                    });
                    return;
                }
                commandAnimationPending.current = false;
                captureLayoutSnapshot();
                setGame(updated);
                setMessage(updated.message);
                setIsSubmitting(false);
            })
            .catch((error: unknown) => {
                commandAnimationPending.current = false;
                showAnimationDestination(sourceKey);
                handleAsyncError(error, setMessage, "Unable to update Lunar Base.");
            })
            .finally(() => {
                if (!commandAnimationPending.current) {
                    setIsSubmitting(false);
                }
            });
    };

    const animateCard = (
        animation: CardMovementAnimation,
        toX: number,
        toY: number,
        hiddenDestinationKey = animation.hiddenDestinationKey ?? null,
        onComplete?: () => void
    ) => {
        const next = { key: flyKey.current + 1, ...animation, toX, toY };
        flyKey.current = next.key;
        hideAnimationDestination(hiddenDestinationKey);
        setFlyingCards((current) => [...current, next]);
        window.setTimeout(() => {
            setFlyingCards((current) => current.filter((card) => card.key !== next.key));
            showAnimationDestination(hiddenDestinationKey);
            onComplete?.();
        }, cardAnimationDurationMs);
    };

    if (!game) {
        return <section className="game-page lunar-page"><p>{message ?? "Loading Lunar Base..."}</p></section>;
    }

    const viewerSeat = game.viewer?.seatIndex ?? null;
    const hand = game.viewer?.hand ?? [];
    const currentUserId = currentUser?.id ?? game.viewer?.userId ?? null;
    const playerOrder = displayPlayerOrder(game, viewerSeat);
    const canAct = viewerSeat === game.currentPlayerIndex && game.lifecycle === "active" && !isSubmitting;
    const selectedHandCard = selectedCard ? hand.find((card) => card.id === selectedCard.cardId) ?? null : null;
    const draggingHandCard = draggingCardId ? hand.find((card) => card.id === draggingCardId) ?? null : null;
    const viewerPlayer = viewerSeat === null ? null : game.players[viewerSeat] ?? null;
    const selectedPlayableModule = selectedHandCard && selectedCard && viewerPlayer && selectedHandCard.type === "module" && canPlayHandCard(selectedHandCard, viewerPlayer)
        ? { card: selectedHandCard, rotation: selectedCard.rotation }
        : null;
    const draggedPlayableModule = draggingHandCard && viewerPlayer && draggingHandCard.type === "module" && canPlayHandCard(draggingHandCard, viewerPlayer)
        ? draggingHandCard
        : null;
    const seatedUserIds = new Set(game.seats.map((seat) => seat.userId).filter((userId): userId is string => userId !== null));
    const supplyTopRowCount = Math.ceil(game.supply.length / 2);
    const supplyRows = [game.supply.slice(0, supplyTopRowCount), game.supply.slice(supplyTopRowCount)];
    const animationHiddenClass = (key: string) => hiddenAnimationDestinations.has(key) ? "is-animation-destination-hidden" : "";
    const draggingSourceClass = (key: string) => draggingSourceKey === key ? "is-dragging-source" : "";
    const displayedStockCount = draggingSourceKey === "stock" ? Math.max(0, game.stockCount - 1) : game.stockCount;
    const displayedDiscardTop = hiddenAnimationDestinations.has("discard") ? discardAnimationPlaceholder : game.discardTop;

    const claimSeat = (seatIndex: number, playerUserId: string | null, displayName: string) => {
        runCommand({ type: "claimSeat", seatIndex, playerUserId: playerUserId ?? currentUserId, displayName });
        setActivePickerSeat(null);
    };

    const clearDragState = () => {
        returningDragRef.current = false;
        setDraggingCardId(null);
        setDraggingSupply(null);
        setDraggingSource(null);
        setDraggingRotation(null);
        setDraggingSourceKey(null);
        setDragImageMetrics(null);
        dragImageMetricsRef.current = null;
    };

    const dragCenterFromEvent = (event: DragEvent<HTMLElement>) => {
        const dataOffsetX = Number(event.dataTransfer.getData("centerOffsetX"));
        const dataOffsetY = Number(event.dataTransfer.getData("centerOffsetY"));
        const currentMetrics = dragImageMetricsRef.current ?? dragImageMetrics;
        const centerOffsetX = currentMetrics?.centerOffsetX ?? (Number.isFinite(dataOffsetX) ? dataOffsetX : 0);
        const centerOffsetY = currentMetrics?.centerOffsetY ?? (Number.isFinite(dataOffsetY) ? dataOffsetY : 0);
        const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
        const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
        return {
            x: clientX + centerOffsetX,
            y: clientY + centerOffsetY
        };
    };

    const beginCardDrag = (
        event: DragEvent<HTMLElement>,
        {
            source,
            sourceKey,
            cardId,
            slotIndex,
            supplyCard,
            rotation = 0
        }: {
            source: DragSource;
            sourceKey: string;
            cardId?: string;
            slotIndex?: number;
            supplyCard?: LunarBaseCard;
            rotation?: CardRotation;
        }
    ) => {
        const metrics = setScaledDragImage(event, zoom, rotation) ?? null;
        dragImageMetricsRef.current = metrics;
        setDraggingSource(source);
        setDraggingSourceKey(sourceKey);
        setDraggingRotation(source === "hand" ? rotation : null);
        setDragImageMetrics(metrics);
        setDraggingCardId(cardId ?? null);
        setDraggingSupply(source === "supply" && slotIndex !== undefined && supplyCard ? { slotIndex, card: supplyCard } : null);
        event.dataTransfer.setData("source", source);
        event.dataTransfer.setData("centerOffsetX", String(metrics?.centerOffsetX ?? 0));
        event.dataTransfer.setData("centerOffsetY", String(metrics?.centerOffsetY ?? 0));
        if (cardId) event.dataTransfer.setData("cardId", cardId);
        if (slotIndex !== undefined) event.dataTransfer.setData("slotIndex", String(slotIndex));
        event.dataTransfer.setData("rotation", String(rotation));
        event.dataTransfer.effectAllowed = "move";
    };

    const draggedCardCenter = (event: DragEvent<HTMLElement>) => dragCenterFromEvent(event);

    const handleDragEnd = () => {
        if (returningDragRef.current) return;
        clearDragState();
    };

    const returnDraggedCard = (event: DragEvent<HTMLElement>) => {
        const source = draggingSource ?? event.dataTransfer.getData("source");
        if (!source) return;

        const cardId = draggingCardId ?? event.dataTransfer.getData("cardId");
        const slotIndex = Number(event.dataTransfer.getData("slotIndex"));
        const supplyCard = draggingSupply?.card ?? (Number.isFinite(slotIndex) ? game.supply[slotIndex] ?? null : null);
        const returnDetails = source === "hand" && draggingHandCard && viewerSeat !== null
            ? {
                annotation: "return hand card to hand",
                card: draggingHandCard,
                faceDown: false,
                rotation: draggingRotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation"))),
                destination: handCardRefs.current.get(draggingHandCard.id)?.getBoundingClientRect() ?? null,
                hiddenDestinationKey: `hand-${viewerSeat}-${draggingHandCard.id}`
            }
            : source === "supply" && supplyCard
                ? {
                    annotation: "return supply card to supply",
                    card: supplyCard,
                    faceDown: false,
                    rotation: 0 as CardRotation,
                    destination: animatedElementRect(`supply-${supplyCard.id}`),
                    hiddenDestinationKey: `supply-${supplyCard.id}`
                }
                : source === "stock"
                    ? {
                        annotation: "return stock card to stock",
                        card: null,
                        faceDown: true,
                        rotation: 0 as CardRotation,
                        destination: animatedElementRect("stock"),
                        hiddenDestinationKey: null
                    }
                    : null;
        if (!returnDetails) return;
        const destination = returnDetails.destination;
        if (!destination) {
            clearDragState();
            return;
        }
        event.preventDefault();
        const to = rectCenter(destination);
        const from = draggedCardCenter(event);
        returningDragRef.current = true;
        animateCard(
            {
                annotation: returnDetails.annotation,
                card: returnDetails.card,
                faceDown: returnDetails.faceDown,
                rotation: returnDetails.rotation,
                fromX: from.x,
                fromY: from.y,
                destination: returnDetails.card
                    ? { type: "handCard", cardId: returnDetails.card.id }
                    : { type: "viewerHandEnd" }
            },
            to.x,
            to.y,
            returnDetails.hiddenDestinationKey,
            clearDragState
        );
    };

    const clickHandCard = (card: LunarBaseCard, event: MouseEvent<HTMLElement>) => {
        if (!canAct) return;
        if (!viewerPlayer || !canPlayHandCard(card, viewerPlayer)) return;
        if (selectedCard && selectedCard.cardId !== card.id) {
            setSelectedCard(null);
            return;
        }
        if (card.type === "module") {
            setSelectedCard((current) => current?.cardId === card.id
                ? { cardId: card.id, rotation: nextRotation(current.rotation), visualRotation: current.visualRotation + 90 }
                : { cardId: card.id, rotation: 0, visualRotation: 0 });
            return;
        }
        const from = rectCenter(event.currentTarget.getBoundingClientRect());
        runCommand(
            { type: card.type === "agent" ? "playAgent" : "discardHandCard", cardId: card.id },
            { annotation: card.type === "agent" ? "click hand agent to play" : "click hand influence to discard", card, fromX: from.x, fromY: from.y, destination: { type: "discard" } }
        );
    };

    const animateStationFlip = (cardId: string, from: LunarBaseCard, to: LunarBaseCard, onComplete?: () => void) => {
        setStationFlipAnimations((current) => new Map(current).set(cardId, { from, to }));
        window.setTimeout(() => {
            setStationFlipAnimations((current) => {
                const next = new Map(current);
                next.delete(cardId);
                return next;
            });
            onComplete?.();
        }, cardAnimationDurationMs);
    };

    const updateLocalStation = (cardId: string, card: LunarBaseCard) => {
        captureLayoutSnapshot();
        setGame((current) => {
            if (!current) return current;
            return {
                ...current,
                players: current.players.map((player) => ({
                    ...player,
                    board: player.board.map((boardCard) => boardCard.card.id === cardId ? { ...boardCard, card } : boardCard)
                }))
            };
        });
    };

    const beginStationSideChange = (cardId: string, from: LunarBaseCard, to: LunarBaseCard, onComplete?: () => void) => {
        setSelectedCard(null);
        animateStationFlip(cardId, from, to, onComplete);
    };

    const flipStation = (cardId: string) => {
        if (!canAct) return;
        if (stationReveal || stationFlipAnimations.has(cardId)) return;
        const station = viewerPlayer?.board.find((boardCard) => boardCard.card.id === cardId)?.card;
        if (!station) return;
        const nextStation = stationOppositeSideCard(station);
        beginStationSideChange(cardId, station, nextStation);
        updateLocalStation(cardId, nextStation);
        runCommand({ type: "flipStation" });
    };

    const revealStation = (cardId: string) => {
        if (stationReveal?.phase === "revealed") {
            closeRevealedStation();
            return;
        }
        if (stationReveal || stationFlipAnimations.has(cardId)) return;
        const station = viewerPlayer?.board.find((boardCard) => boardCard.card.id === cardId)?.card;
        if (!station) {
            setSelectedCard(null);
            return;
        }
        setStationReveal({ cardId, phase: "revealing" });
        beginStationSideChange(cardId, station, stationOppositeSideCard(station), () => {
            setStationReveal((current) => current?.cardId === cardId && current.phase === "revealing"
                ? { cardId, phase: "revealed" }
                : current);
        });
    };

    const closeRevealedStation = () => {
        if (stationReveal?.phase !== "revealed") return;
        const cardId = stationReveal.cardId;
        const station = viewerPlayer?.board.find((boardCard) => boardCard.card.id === cardId)?.card;
        setStationReveal({ cardId, phase: "hiding" });
        if (station) {
            beginStationSideChange(cardId, stationOppositeSideCard(station), station, () => {
                setStationReveal((current) => current?.cardId === cardId && current.phase === "hiding" ? null : current);
            });
            return;
        }
        setStationReveal(null);
    };

    const revealedStationCardId = stationReveal && stationReveal.phase !== "hiding" ? stationReveal.cardId : null;
    const revealDimmerVisible = stationReveal?.phase === "revealing" || stationReveal?.phase === "revealed";

    return (
        <section className="game-page lunar-page">
            <div className="lunar-game-ports">
                <section className="lunar-table-port" aria-label="Lunar Base table">
                    {revealDimmerVisible ? (
                        <button
                            type="button"
                            className="lunar-reveal-dimmer"
                            aria-label="Hide revealed station side"
                            onClick={closeRevealedStation}
                        />
                    ) : null}
                    <div className="lunar-zoom-control">
                        <button type="button" aria-label="Zoom out" onClick={() => setZoomPreservingCenter(nextZoomStep(zoom, -1))}>-</button>
                        <input
                            aria-label="Zoom"
                            inputMode="numeric"
                            value={zoomText}
                            onChange={(event) => {
                                const nextText = sanitizeZoomText(event.target.value);
                                setZoomText(nextText);
                                const percent = zoomTextToPercent(nextText);
                                if (percent !== null) {
                                    setZoomPreservingCenter(zoomPercentToZoom(percent));
                                    setZoomText(nextText);
                                }
                            }}
                            onBlur={finishZoomInput}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                }
                            }}
                        />
                        <button type="button" aria-label="Zoom in" onClick={() => setZoomPreservingCenter(nextZoomStep(zoom, 1))}>+</button>
                    </div>
                    <div className="lunar-table-scroll" ref={tableScrollRef}>
                        <div
                            className="lunar-table-surface"
                            style={{ "--lunar-zoom": zoom } as CSSProperties}
                            onClick={() => {
                                if (stationReveal?.phase === "revealed") {
                                    closeRevealedStation();
                                    return;
                                }
                                if (stationReveal) return;
                                if (selectedCard) setSelectedCard(null);
                            }}
                            onDragOver={(event) => {
                                if (draggingSource) {
                                    event.preventDefault();
                                }
                            }}
                            onDrop={(event) => {
                                if (event.defaultPrevented) return;
                                returnDraggedCard(event);
                            }}
                        >
                            <section className="lunar-supply" aria-label="Supply">
                                {supplyRows.map((row, rowIndex) => (
                                    <div key={rowIndex} className="lunar-supply-row">
                                        {row.map((card, columnIndex) => {
                                            const slotIndex = rowIndex === 0 ? columnIndex : supplyTopRowCount + columnIndex;
                                            return (
                                                <button
                                                    key={`${card?.id ?? "empty"}-${slotIndex}`}
                                                    type="button"
                                                    data-lunar-animate={card ? `supply-${card.id}` : undefined}
                                                    data-movement={card ? "supply card layout" : undefined}
                                                    className={[
                                                        "lunar-supply-slot",
                                                        card ? animationHiddenClass(`supply-${card.id}`) : "",
                                                        card ? draggingSourceClass(`supply-${card.id}`) : ""
                                                    ].filter(Boolean).join(" ")}
                                                    disabled={!canAct || !card}
                                                    draggable={canAct && Boolean(card)}
                                                    onClick={(event) => {
                                                        if (selectedCard) {
                                                            setSelectedCard(null);
                                                            return;
                                                        }
                                                        if (card) {
                                                            const from = rectCenter(event.currentTarget.getBoundingClientRect());
                                                            runCommand(
                                                                { type: "takeSupply", slotIndex },
                                                                {
                                                                    annotation: "click supply card to hand",
                                                                    card,
                                                                    fromX: from.x,
                                                                    fromY: from.y,
                                                                    destination: { type: "handCard", cardId: card.id }
                                                                }
                                                            );
                                                        }
                                                    }}
                                                    onDragStart={(event) => {
                                                        if (!card) return;
                                                        beginCardDrag(event, {
                                                            source: "supply",
                                                            sourceKey: `supply-${card.id}`,
                                                            slotIndex,
                                                            supplyCard: card
                                                        });
                                                    }}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    {card ? <CardView card={card} /> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </section>
                            <section className="lunar-piles">
                                <button
                                    type="button"
                                    className="lunar-pile"
                                    data-lunar-animate="stock"
                                    data-movement="stock pile layout"
                                    aria-label={`Stock, ${game.stockCount} cards`}
                                    disabled={!canAct || game.stockCount === 0}
                                    draggable={canAct && game.stockCount > 0}
                                    onClick={(event) => {
                                        if (selectedCard) {
                                            setSelectedCard(null);
                                            return;
                                        }
                                        const from = rectCenter(event.currentTarget.getBoundingClientRect());
                                        runCommand(
                                            { type: "drawStock" },
                                            {
                                                annotation: "click stock card to hand",
                                                card: null,
                                                faceDown: true,
                                                fromX: from.x,
                                                fromY: from.y,
                                                destination: { type: "viewerHandEnd" }
                                            }
                                        );
                                    }}
                                    onDragStart={(event) => {
                                        beginCardDrag(event, {
                                            source: "stock",
                                            sourceKey: "stock"
                                        });
                                    }}
                                    onDragEnd={handleDragEnd}
                                >
                                    <CardView card={null} faceDown={displayedStockCount > 0} empty={displayedStockCount === 0} />
                                </button>
                                <div
                                    ref={discardRef}
                                    className="lunar-pile"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={game.discardTop ? `Discard pile, ${game.discardCount} cards` : "Empty discard pile"}
                                    onClick={() => {
                                        if (selectedCard) setSelectedCard(null);
                                    }}
                                    onKeyDown={(event) => {
                                        if ((event.key === "Enter" || event.key === " ") && selectedCard) {
                                            event.preventDefault();
                                            setSelectedCard(null);
                                        }
                                    }}
                                    onDragOver={(event) => {
                                        const card = hand.find((candidate) => candidate.id === draggingCardId);
                                        if (draggingSource === "hand" && (isDiscardableFromHand(card) || isPlayableAgentFromHand(card))) {
                                            event.preventDefault();
                                        }
                                    }}
                                    onDrop={(event) => {
                                        const card = hand.find((candidate) => candidate.id === draggingCardId);
                                        if (draggingSource !== "hand" || (!isDiscardableFromHand(card) && !isPlayableAgentFromHand(card))) {
                                            return;
                                        }
                                        event.preventDefault();
                                        const from = draggedCardCenter(event);
                                        runCommand(
                                            { type: card.type === "agent" ? "playAgent" : "discardHandCard", cardId: card.id },
                                            {
                                                annotation: card.type === "agent" ? "drop hand agent to play" : "drop hand influence to discard",
                                                card,
                                                fromX: from.x,
                                                fromY: from.y,
                                                destination: { type: "discard" }
                                            }
                                        );
                                        clearDragState();
                                    }}
                                >
                                    <span
                                        data-lunar-animate="discard"
                                        data-movement="discard pile layout"
                                    >
                                        <CardView card={displayedDiscardTop} empty={!displayedDiscardTop} />
                                    </span>
                                </div>
                            </section>
                            <section className="lunar-areas">
                                {playerOrder.map((playerIndex) => {
                                    const isViewer = playerIndex === viewerSeat;
                                    const cards = isViewer ? hand : Array.from({ length: game.players[playerIndex].handCount }, (_, index) => ({ id: `back-${playerIndex}-${index}`, type: "module" as CardType }));
                                    return (
                                        <section
                                            key={playerIndex}
                                            className="lunar-player-area"
                                            onDragOver={(event) => {
                                                if (!isViewer || draggingSource !== "hand" || !draggedPlayableModule) return;
                                                boardRefs.current.get(playerIndex)?.dragOver(event);
                                            }}
                                            onDrop={(event) => {
                                                if (!isViewer || draggingSource !== "hand" || !draggedPlayableModule) return;
                                                boardRefs.current.get(playerIndex)?.drop(event);
                                            }}
                                            onDragLeave={() => {
                                                if (isViewer) boardRefs.current.get(playerIndex)?.clearHover();
                                            }}
                                        >
                                            <h2>{game.seats[playerIndex].displayName ?? `Player ${playerIndex + 1}`}</h2>
                                            <div
                                                ref={(element) => {
                                                    if (element) {
                                                        handAreaRefs.current.set(playerIndex, element);
                                                    } else {
                                                        handAreaRefs.current.delete(playerIndex);
                                                    }
                                                }}
                                                data-movement={isViewer ? "viewer hand area layout" : "opponent hand area layout"}
                                                className="lunar-hand"
                                                onClick={() => setSelectedCard(null)}
                                                onDragOver={(event) => {
                                                    if (draggingSource === "stock" || draggingSource === "supply") event.preventDefault();
                                                }}
                                                onDrop={(event) => {
                                                    if (isViewer && draggingSource === "stock") {
                                                        event.preventDefault();
                                                        const from = draggedCardCenter(event);
                                                        runCommand(
                                                            { type: "drawStock" },
                                                            {
                                                                annotation: "drop stock card to hand",
                                                                card: null,
                                                                faceDown: true,
                                                                fromX: from.x,
                                                                fromY: from.y,
                                                                destination: { type: "viewerHandEnd" }
                                                            }
                                                        );
                                                        clearDragState();
                                                        return;
                                                    }
                                                    if (isViewer && draggingSource === "supply" && draggingSupply) {
                                                        event.preventDefault();
                                                        const from = draggedCardCenter(event);
                                                        runCommand(
                                                            { type: "takeSupply", slotIndex: draggingSupply.slotIndex },
                                                            {
                                                                annotation: "drop supply card to hand",
                                                                card: draggingSupply.card,
                                                                fromX: from.x,
                                                                fromY: from.y,
                                                                destination: { type: "handCard", cardId: draggingSupply.card.id }
                                                            }
                                                        );
                                                        clearDragState();
                                                    }
                                                }}
                                            >
                                                {cards.length === 0 ? <span className="lunar-empty-hand">Empty hand</span> : cards.map((card) => {
                                                    const playableHandCard = Boolean(isViewer && canAct && viewerPlayer && canPlayHandCard(card, viewerPlayer));
                                                    const unplayableHandCard = Boolean(isViewer && canAct && !playableHandCard);
                                                    return (
                                                        <button
                                                            key={card.id}
                                                            data-lunar-animate={`hand-${playerIndex}-${card.id}`}
                                                            data-movement={isViewer ? "viewer hand card layout" : "opponent hand card layout"}
                                                            ref={(element) => {
                                                                if (element) {
                                                                    handCardRefs.current.set(card.id, element);
                                                                } else {
                                                                    handCardRefs.current.delete(card.id);
                                                                }
                                                            }}
                                                            type="button"
                                                            className={[
                                                                draggingCardId === card.id ? "is-dragging" : "",
                                                                selectedCard?.cardId === card.id ? "is-selected" : "",
                                                                unplayableHandCard ? "is-unplayable" : "",
                                                                animationHiddenClass(`hand-${playerIndex}-${card.id}`)
                                                            ].filter(Boolean).join(" ")}
                                                            disabled={!isViewer || !canAct || !playableHandCard}
                                                            draggable={playableHandCard}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (isViewer) clickHandCard(card, event);
                                                            }}
                                                            onDragStart={(event) => {
                                                                if (!isViewer || !playableHandCard) return;
                                                                const rotation = selectedCard?.cardId === card.id ? selectedCard.rotation : 0;
                                                                beginCardDrag(event, {
                                                                    source: "hand",
                                                                    sourceKey: `hand-${playerIndex}-${card.id}`,
                                                                    cardId: card.id,
                                                                    rotation
                                                                });
                                                            }}
                                                            onDragEnd={handleDragEnd}
                                                        >
                                                            <CardView
                                                                card={isViewer ? card : null}
                                                                faceDown={!isViewer}
                                                                selected={selectedCard?.cardId === card.id}
                                                                rotation={selectedCard?.cardId === card.id ? selectedCard.rotation : 0}
                                                                visualRotation={selectedCard?.cardId === card.id ? selectedCard.visualRotation : 0}
                                                                instantRotation={instantRotationCardIds.has(card.id)}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <PlayerBoard
                                                ref={(handle) => {
                                                    if (handle) {
                                                        boardRefs.current.set(playerIndex, handle);
                                                    } else {
                                                        boardRefs.current.delete(playerIndex);
                                                    }
                                                }}
                                                board={game.players[playerIndex].board}
                                                selected={isViewer ? selectedPlayableModule : null}
                                                zoom={zoom}
                                                canAcceptDrag={Boolean(isViewer && draggingSource === "hand" && draggedPlayableModule)}
                                                canShowStationControls={isViewer && viewerSeat !== null && !stationReveal}
                                                canFlipStation={isViewer && canAct}
                                                revealedStationCardId={isViewer ? revealedStationCardId : null}
                                                stationFlipAnimations={stationFlipAnimations}
                                                draggedCard={isViewer ? draggedPlayableModule : null}
                                                draggedRotation={draggingRotation}
                                                dragImageMetrics={dragImageMetrics}
                                                onRevealStation={revealStation}
                                                onFlipStation={flipStation}
                                                onPlaySelected={(x, y, destination) => {
                                                    if (selectedHandCard && selectedCard) {
                                                        const fromElement = handCardRefs.current.get(selectedHandCard.id);
                                                        const from = fromElement ? rectCenter(fromElement.getBoundingClientRect()) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                                                        runCommand({
                                                            type: "playModule",
                                                            cardId: selectedHandCard.id,
                                                            x,
                                                            y,
                                                            rotation: selectedCard.rotation
                                                        }, {
                                                            annotation: "click selected module to board",
                                                            card: selectedHandCard,
                                                            rotation: selectedCard.rotation,
                                                            fromX: from.x,
                                                            fromY: from.y,
                                                            destination: { type: "boardCard", cardId: selectedHandCard.id },
                                                            toX: destination?.x,
                                                            toY: destination?.y
                                                        });
                                                        setSelectedCard(null);
                                                    }
                                                }}
                                                onClearSelected={() => setSelectedCard(null)}
                                                onDropCard={(event, x, y, rotation, destination) => {
                                                    if (!isViewer) return;
                                                    const cardId = event.dataTransfer.getData("cardId");
                                                    const card = hand.find((candidate) => candidate.id === cardId);
                                                    if (card?.type === "module") {
                                                        const from = draggedCardCenter(event);
                                                        runCommand(
                                                            { type: "playModule", cardId, x, y, rotation },
                                                            {
                                                                annotation: "drop hand module to board",
                                                                card,
                                                                rotation,
                                                                fromX: from.x,
                                                                fromY: from.y,
                                                                destination: { type: "boardCard", cardId },
                                                                toX: destination?.x,
                                                                toY: destination?.y
                                                            }
                                                        );
                                                        setSelectedCard(null);
                                                    }
                                                    clearDragState();
                                                }}
                                                hiddenAnimationDestinations={hiddenAnimationDestinations}
                                            />
                                        </section>
                                    );
                                })}
                            </section>
                        </div>
                    </div>
                </section>
                <aside className="lunar-player-port" aria-label="Players">
                    <div className="lunar-player-actions">
                        <button
                            type="button"
                            disabled={!canAct}
                            onClick={() => {
                                if (selectedCard) {
                                    setSelectedCard(null);
                                    return;
                                }
                                runCommand({ type: "passTurn" });
                            }}
                        >
                            Pass Turn
                        </button>
                        <button
                            type="button"
                            disabled={isSubmitting || game.lifecycle === "finished"}
                            onClick={() => {
                                if (selectedCard) {
                                    setSelectedCard(null);
                                    return;
                                }
                                runCommand({ type: "endGame" });
                            }}
                        >
                            End Game
                        </button>
                    </div>
                    {playerOrder.map((playerIndex) => (
                        <PlayerPanel
                            key={playerIndex}
                            game={game}
                            playerIndex={playerIndex}
                            currentUserId={currentUserId}
                            onOpenPicker={setActivePickerSeat}
                        />
                    ))}
                </aside>
            </div>
            {activePickerSeat !== null ? createPortal(
                <div className="seat-player-picker-backdrop" role="presentation">
                    <section className="panel seat-player-picker-modal" role="dialog" aria-modal="true" aria-label="Lunar Base player picker">
                        <PlayerPicker
                            players={players.filter((player) => !seatedUserIds.has(player.id))}
                            bots={[]}
                            addMyselfDisabled={!currentUserId || seatedUserIds.has(currentUserId)}
                            onAddMyself={() => claimSeat(activePickerSeat, currentUserId, currentUser?.displayName ?? "Player")}
                            onAddPlayer={(playerUserId) => {
                                const player = players.find((candidate) => candidate.id === playerUserId);
                                claimSeat(activePickerSeat, playerUserId, player?.displayName ?? "Player");
                            }}
                            onAddBot={() => {}}
                            onCancel={() => setActivePickerSeat(null)}
                        />
                    </section>
                </div>,
                portalRoot()
            ) : null}
            {flyingCards.length > 0 ? createPortal(
                <>
                    {flyingCards.map((flyingCard) => (
                        <div
                            key={flyingCard.key}
                            className="lunar-flying-card"
                            data-movement={flyingCard.annotation}
                            aria-label={flyingCard.annotation}
                            style={{
                                "--lunar-fly-from-x": `${flyingCard.fromX}px`,
                                "--lunar-fly-from-y": `${flyingCard.fromY}px`,
                                "--lunar-fly-to-x": `${flyingCard.toX}px`,
                                "--lunar-fly-to-y": `${flyingCard.toY}px`
                            } as CSSProperties}
                        >
                            <CardView card={flyingCard.card} faceDown={flyingCard.faceDown} rotation={flyingCard.rotation} />
                        </div>
                    ))}
                </>,
                portalRoot()
            ) : null}
        </section>
    );
};

const handleAsyncError = (error: unknown, setMessage: (message: string) => void, fallback: string) => {
    if (isUnauthorizedError(error)) {
        notifyAuthSessionExpired();
        setMessage(sessionExpiredMessage);
    } else if (isServerUnavailableError(error)) {
        notifyServerUnavailable();
        setMessage(serverUnavailableMessage);
    } else {
        setMessage(error instanceof Error ? error.message : fallback);
    }
};

export const lunarBaseGameEntry: GameEntry = {
    identity: { slug: "lunar-base", displayName: "Lunar Base" },
    routes: {
        createPath: buildGameCreatePath("lunar-base"),
        buildPlayPath: (gameId) => "/g/" + encodeURIComponent(gameId.trim()),
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: { CreateScreen: CreateLunarBaseScreen, PlayScreen: LunarBasePlayScreen },
    lifecycle: {
        useSession: emptyLifecycle,
        startGame: async (_dispatch, _gameSlug, options) => {
            const game = await createLunarBaseGame(options);
            return game.id;
        },
        openGame: emptyLifecycle,
        returnToLobby: emptyLifecycle,
        enterCreateMode: emptyLifecycle,
        clearCreateMode: emptyLifecycle
    }
};
