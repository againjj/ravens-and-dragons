import { type CSSProperties, type DragEvent, type FocusEvent, type MouseEvent, type PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
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
import { boardCardRectAtPoint, canPlayHandCard, hasLegalPlacement, nextRotation, normalizeRotation, normalizedVisualRotation, shouldUnwindVisualRotation } from "./lunar-base-board-rules";
import { canDraftSupplyCard, resolveLunarCardInteraction, type LunarCardInteractionDecision, type LunarCardInteractionGesture, type LunarCardInteractionSource, type LunarCardInteractionTarget } from "./lunar-base-card-interactions";
import { cardAnimationDurationMs, cardGap, cardWidth, emptyLifecycle, layoutAnimationSelector, maxZoom, minZoom, playRoutePattern, portalRoot, rectCenter } from "./lunar-base-constants";
import { createDragAutoScrollState, displayPlayerOrder, dragAutoScrollDelta, stationOppositeSideCard, type DragAutoScrollState } from "./lunar-base-game-logic";
import { clipZoomPercent, nextZoomStep, sanitizeZoomText, useLunarBaseZoom, zoomPercentToZoom, zoomTextToPercent, zoomToPercent } from "./useLunarBaseZoom";
import { lunarBaseColors, type CardMovementAnimation, type CardRotation, type CardType, type DragSource, type FlyingCard, type LunarBaseActionInteraction, type LunarBaseBoardCard, type LunarBaseCard, type LunarBaseColorName, type LunarBaseGame, type SelectedCard, type StationFlipAnimation, type StationRevealState } from "./lunar-base-types";
import "./lunar-base.css";

const lunarBaseRulebookPdfUrl = "https://shop.plepic.com/wp-content/uploads/2020/09/Lunar-Base-Rulebook-v1.0.pdf";

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

const rectStyle = (rect: DOMRect): CSSProperties => ({
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
});

const scrollLocalRect = (scroller: HTMLElement | null, rect: DOMRect): DOMRect => {
    if (!scroller) return rect;
    const scrollerRect = scroller.getBoundingClientRect();
    return new DOMRect(
        rect.left - scrollerRect.left + scroller.scrollLeft,
        rect.top - scrollerRect.top + scroller.scrollTop,
        rect.width,
        rect.height
    );
};

const overlayCardStyle = (zoom: number): CSSProperties => ({
    "--lunar-card-half-width": `${(cardWidth * zoom) / 2}px`,
    "--lunar-card-half-height": `${cardWidth * zoom}px`,
    "--lunar-card-scale": zoom
} as CSSProperties);

const dragPreviewStyle = (point: { x: number; y: number }, zoom: number): CSSProperties => ({
    "--lunar-drag-preview-x": `${point.x}px`,
    "--lunar-drag-preview-y": `${point.y}px`,
    ...overlayCardStyle(zoom)
} as CSSProperties);

const dragOverlayStyle = (size: { width: number; height: number }): CSSProperties => ({
    width: size.width > 0 ? `${size.width}px` : "100%",
    height: size.height > 0 ? `${size.height}px` : "100%"
});

const scrollLocalPoint = (scroller: HTMLElement | null, point: { x: number; y: number }): { x: number; y: number } => {
    if (!scroller) return point;
    const rect = scroller.getBoundingClientRect();
    return {
        x: point.x - rect.left + scroller.scrollLeft,
        y: point.y - rect.top + scroller.scrollTop
    };
};

const selectedModuleState = (
    cardId: string,
    originRotation: CardRotation,
    source: "board" | "hand" = "hand",
    sourcePlayerIndex?: number
): SelectedCard => ({
    cardId,
    source,
    sourcePlayerIndex,
    rotation: originRotation,
    visualRotation: originRotation,
    originRotation
});

const rotateSelectedModule = (current: SelectedCard): SelectedCard => ({
    ...current,
    rotation: nextRotation(current.rotation),
    visualRotation: current.visualRotation + 90
});

const restoreScrollPosition = (scroller: HTMLElement, scroll: { left: number; top: number }) => {
    if (scroller.scrollLeft !== scroll.left) {
        scroller.scrollLeft = scroll.left;
    }
    if (scroller.scrollTop !== scroll.top) {
        scroller.scrollTop = scroll.top;
    }
};

const cardRectFromCenter = (center: { x: number; y: number }, zoom = 1): DOMRect =>
    new DOMRect(center.x - (cardWidth * zoom) / 2, center.y - (cardWidth * 2 * zoom) / 2, cardWidth * zoom, cardWidth * 2 * zoom);

const rectContainsPoint = (rect: DOMRect | null, point: { x: number; y: number }): rect is DOMRect =>
    Boolean(rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);

const flyCardStyle = (flyingCard: FlyingCard, zoom: number): CSSProperties => ({
    "--lunar-fly-from-x": `${flyingCard.fromX}px`,
    "--lunar-fly-from-y": `${flyingCard.fromY}px`,
    "--lunar-fly-to-x": `${flyingCard.toX}px`,
    "--lunar-fly-to-y": `${flyingCard.toY}px`,
    ...overlayCardStyle(zoom)
} as CSSProperties);

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
    if (animation.sourceKey !== undefined) return animation.sourceKey;
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

const boardCardsById = (cards: LunarBaseBoardCard[]): Map<string, LunarBaseBoardCard> =>
    new Map(cards.map((boardCard) => [boardCard.card.id, boardCard]));

const handCardRect = (
    game: LunarBaseGame,
    playerIndex: number,
    cardId: string,
    layoutRects: Map<string, DOMRect>,
    handAreaRects: Map<number, DOMRect>
): DOMRect | null =>
    layoutRects.get(`hand-${playerIndex}-${cardId}`) ?? handEndRect(game, playerIndex, layoutRects, handAreaRects);

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
    const previousCredits = useRef(player.credits);
    const [creditFlashKey, setCreditFlashKey] = useState(0);
    useEffect(() => {
        if (previousCredits.current === player.credits) return;
        previousCredits.current = player.credits;
        setCreditFlashKey((current) => current + 1);
    }, [player.credits]);
    const isCurrentUser = seat.userId !== null && seat.userId === currentUserId;
    const isCurrentPlayer = playerIndex === game.currentPlayerIndex;
    const endGameResult = game.endGameResult ?? null;
    const isWinningPlayer = Boolean(endGameResult?.winningPlayerIndexes.includes(playerIndex));
    const playerMarker = endGameResult
        ? isWinningPlayer
            ? endGameResult.label === "Draw" ? "Draw" : endGameResult.label
            : null
        : isCurrentPlayer ? "Current player" : null;
    return (
        <section className="panel lunar-player-panel">
            <div className="lunar-player-name">
                {seat.userId ? <strong>{seat.displayName ?? `Player ${playerIndex + 1}`}</strong> : <button type="button" onClick={() => onOpenPicker(playerIndex)}>Add Player</button>}
                {playerMarker ? <span>({playerMarker})</span> : null}
            </div>
            <p>Orbs: <OrbValue color="red" value={player.orbs.red} />, <OrbValue color="blue" value={player.orbs.blue} />, <OrbValue color="yellow" value={player.orbs.yellow} />, <OrbValue color="gray" value={player.orbs.gray} /></p>
            <p>Lunar credits: <span
                key={creditFlashKey}
                className={creditFlashKey > 0 ? "lunar-credit-value is-credit-changing" : "lunar-credit-value"}
                style={{ "--lunar-credit-flash": lunarBaseColors.yellow.css } as CSSProperties}
            >{player.credits}/20</span></p>
            <p>Colonists housed: {player.colonists}/10</p>
            <p>Scientific achievements: {player.achievements}/5</p>
            {game.config.useInfluences && (isCurrentUser || game.lifecycle === "finished") ? <p>Influences in hand: {player.influenceHandCount}/4</p> : null}
        </section>
    );
};

const lunarEndGameTitle = (game: LunarBaseGame): string => {
    const result = game.endGameResult;
    if (!result) return "Game over";
    const playerName = (playerIndex: number) => game.seats[playerIndex]?.displayName ?? `Player ${playerIndex + 1}`;
    const playerNames = result.winningPlayerIndexes.map(playerName);
    const formatNames = (names: string[]) => names.length <= 2
        ? names.join(" and ")
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    return result.label === "Draw"
        ? `Draw between ${formatNames(playerNames)}`
        : `${result.label} for ${playerNames[0]}${result.label === "Epic Victory" ? "!" : ""}`;
};

const EndGameModal = ({ game, onClose }: { game: LunarBaseGame; onClose: () => void }) => {
    const result = game.endGameResult;
    if (!result) return null;
    const playerName = (playerIndex: number) => game.seats[playerIndex]?.displayName ?? `Player ${playerIndex + 1}`;
    const title = lunarEndGameTitle(game);
    return (
        <div className="lunar-modal-backdrop" role="presentation">
            <section className="panel lunar-modal" role="dialog" aria-modal="true" aria-label="Lunar Base game over">
                <h2>{title}</h2>
                {result.label === "Draw" ? (
                    <div className="lunar-end-game-conditions">
                        {result.playerConditions.map((condition) => (
                            <section key={condition.playerIndex}>
                                <h3>{playerName(condition.playerIndex)}:</h3>
                                <ul>
                                    {condition.conditions.map((conditionText) => <li key={conditionText}>{conditionText}</li>)}
                                </ul>
                            </section>
                        ))}
                    </div>
                ) : (
                    <ul>
                        {result.playerConditions[0]?.conditions.map((conditionText) => <li key={conditionText}>{conditionText}</li>)}
                    </ul>
                )}
                <button type="button" onClick={onClose}>Close</button>
            </section>
        </div>
    );
};

const actionPanelStatus = (game: LunarBaseGame, viewerSeat: number | null): string => {
    if (game.lifecycle === "finished") return lunarEndGameTitle(game);
    const interaction = game.actionState?.interaction ?? null;
    if (interaction) {
        const actionText = interaction.actionText ?? "Action in progress";
        if (interaction.kind === "influenceDefense") {
            const sourceActorIndex = interaction.defendedAction?.sourceActorIndex ?? interaction.defendedAction?.actorIndex ?? game.currentPlayerIndex;
            const sourceName = game.seats[sourceActorIndex]?.displayName ?? `Player ${sourceActorIndex + 1}`;
            if (interaction.actorIndex === viewerSeat) return `${sourceName} wants to:\n${actionText}`;
            const actorName = game.seats[interaction.actorIndex]?.displayName ?? `Player ${interaction.actorIndex + 1}`;
            return `Waiting for ${actorName} to respond to:\n${actionText}`;
        }
        if (interaction.actorIndex === viewerSeat) return actionText;
        const actorName = game.seats[interaction.actorIndex]?.displayName ?? `Player ${interaction.actorIndex + 1}`;
        return `Waiting for ${actorName}:\n${actionText}`;
    }
    if (viewerSeat === game.currentPlayerIndex) return "Play an agent or choose a main action";
    const currentName = game.seats[game.currentPlayerIndex]?.displayName ?? `Player ${game.currentPlayerIndex + 1}`;
    return `Waiting for ${currentName}:\nPlay an agent or choose a main action`;
};

const interactionPromptText = (interaction: LunarBaseActionInteraction | null): string | null => {
    const promptText = interaction?.interactionPrompt?.text ?? null;
    if (promptText) return promptText;
    if (interaction?.kind === "stealCredits") return "Choose opponent";
    if (interaction?.kind !== "chooseScopeTarget") return null;
    switch (interaction.action?.scope) {
        case "NEIGHBORS_OF_TARGET":
        case "TARGET":
            return "Choose a target";
        case "OPPONENT":
            return "Choose an opponent";
        default:
            return null;
    }
};

type ActiveDragState = {
    source: DragSource;
    sourceKey: string;
    cardId: string | null;
    boardPlayerIndex: number | null;
    slotIndex: number | null;
    supplyCard: LunarBaseCard | null;
    rotation: CardRotation;
    metrics: DragImageMetrics | null;
};

type PendingCardPressScroll = {
    scroller: HTMLDivElement;
    left: number;
    top: number;
    stop: () => void;
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
    const [dragState, setDragState] = useState<ActiveDragState | null>(null);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const [hiddenAnimationDestinations, setHiddenAnimationDestinations] = useState<Set<string>>(() => new Set());
    const [discardAnimationPlaceholder, setDiscardAnimationPlaceholder] = useState<LunarBaseCard | null>(null);
    const [instantRotationCardIds, setInstantRotationCardIds] = useState<Set<string>>(() => new Set());
    const [resettingRotationCardIds, setResettingRotationCardIds] = useState<Set<string>>(() => new Set());
    const [stationReveal, setStationReveal] = useState<StationRevealState | null>(null);
    const [stationFlipAnimations, setStationFlipAnimations] = useState<Map<string, StationFlipAnimation>>(() => new Map());
    const [dismissedEndGameVersion, setDismissedEndGameVersion] = useState<number | null>(null);
    const [dropSnapRect, setDropSnapRect] = useState<DOMRect | null>(null);
    const [dragPreviewPoint, setDragPreviewPoint] = useState<{ x: number; y: number } | null>(null);
    const [dragOverlaySize, setDragOverlaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const selectedCardRef = useRef<SelectedCard | null>(null);
    const flyKey = useRef(0);
    const tableScrollRef = useRef<HTMLDivElement | null>(null);
    const handCardRefs = useRef(new Map<string, HTMLElement>());
    const boardRefs = useRef(new Map<number, PlayerBoardHandle>());
    const discardRef = useRef<HTMLDivElement | null>(null);
    const handAreaRefs = useRef(new Map<number, HTMLElement>());
    const previousLayoutRects = useRef(new Map<string, DOMRect>());
    const previousHandAreaRects = useRef(new Map<number, DOMRect>());
    const previousGame = useRef<LunarBaseGame | null>(null);
    const dragStateRef = useRef<ActiveDragState | null>(null);
    const returningDragRef = useRef(false);
    const suppressedLayoutAnimations = useRef(new Set<string>());
    const commandAnimationPending = useRef(false);
    const locallySubmittedVersion = useRef<number | null>(null);
    const dragAutoScrollState = useRef<DragAutoScrollState | null>(null);
    const dragAutoScrollFrame = useRef<number | null>(null);
    const lastDragPoint = useRef<{ x: number; y: number } | null>(null);
    const lastDragOverPoint = useRef<{ x: number; y: number } | null>(null);
    const pendingCardPressScroll = useRef<PendingCardPressScroll | null>(null);
    const postDropScrollGuard = useRef<(() => void) | null>(null);

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

    const updateDragOverlaySize = () => {
        const scroller = tableScrollRef.current;
        if (!scroller) return;
        const width = Math.max(scroller.clientWidth, scroller.scrollWidth);
        const height = Math.max(scroller.clientHeight, scroller.scrollHeight);
        setDragOverlaySize((current) => current.width === width && current.height === height ? current : { width, height });
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

    const clearSelectedCard = useCallback((onCleared?: () => void) => {
        const selected = selectedCardRef.current;
        if (!selected) {
            onCleared?.();
            return;
        }
        const normalized: SelectedCard = { ...selected, visualRotation: normalizedVisualRotation(selected.visualRotation, selected.originRotation) };
        flushSync(() => {
            setInstantRotationCardIds((current) => new Set(current).add(selected.cardId));
            setResettingRotationCardIds((current) => new Set(current).add(selected.cardId));
            selectedCardRef.current = normalized;
            setSelectedCard(normalized);
        });
        requestAnimationFrame(() => {
            selectedCardRef.current = null;
            setSelectedCard(null);
            setInstantRotationCardIds((current) => {
                const next = new Set(current);
                next.delete(selected.cardId);
                return next;
            });
            onCleared?.();
            window.setTimeout(() => {
                setResettingRotationCardIds((current) => {
                    const next = new Set(current);
                    next.delete(selected.cardId);
                    return next;
                });
            }, cardAnimationDurationMs);
        });
    }, []);

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
        selectedCardRef.current = selectedCard;
    }, [selectedCard]);

    useEffect(() => {
        const interaction = game?.actionState?.interaction ?? null;
        const defendedStealCardId = interaction?.kind === "influenceDefense" && interaction.action?.kind === "stealModule"
            ? interaction.defendedAction?.targetCardId ?? null
            : null;
        if (!defendedStealCardId) return;
        const selected = selectedCardRef.current;
        if (selected?.source !== "board" || selected.cardId !== defendedStealCardId) return;
        clearSelectedCard();
    }, [clearSelectedCard, game?.actionState?.interaction]);

    useEffect(() => {
        if (!selectedCard || !shouldUnwindVisualRotation(selectedCard.rotation, selectedCard.originRotation)) {
            return;
        }
        const cardId = selectedCard.cardId;
        const visualRotation = selectedCard.visualRotation;
        const normalized = normalizedVisualRotation(visualRotation, selectedCard.originRotation);
        const timer = window.setTimeout(() => {
            setInstantRotationCardIds((current) => new Set(current).add(cardId));
            setSelectedCard((current) => current?.cardId === cardId && current.visualRotation === visualRotation
                ? { ...current, visualRotation: normalized }
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
        updateDragOverlaySize();
    });

    useEffect(() => {
        if (game?.lifecycle !== "finished") {
            setDismissedEndGameVersion(null);
        }
    }, [game?.lifecycle]);

    useEffect(() => () => {
        if (dragAutoScrollFrame.current !== null) {
            window.cancelAnimationFrame(dragAutoScrollFrame.current);
        }
    }, []);

    useLayoutEffect(() => {
        if (!game) return;
        updateDragOverlaySize();
        const elements = Array.from(document.querySelectorAll<HTMLElement>(layoutAnimationSelector));
        const currentRects = new Map(elements.map((element) => [element.dataset.lunarAnimate ?? "", element.getBoundingClientRect()]));
        const previousRects = previousLayoutRects.current;
        const oldGame = previousGame.current;
        if (oldGame && previousRects.size > 0) {
            const oldStock = previousRects.get("stock");
            const oldDiscard = previousRects.get("discard");
            const currentHandAreaRects = handAreaRectsFromRefs(handAreaRefs.current);
            const removedSupply = removedSupplyCards(oldGame, game);
            const skipInferredCardAnimations = locallySubmittedVersion.current === game.version;
            if (!skipInferredCardAnimations) {
                const discardedSupplyIndex = game.discardTop
                    ? removedSupply.findIndex((card) => card.id === game.discardTop?.id)
                    : -1;
                if (discardedSupplyIndex >= 0) {
                    const [discardedSupply] = removedSupply.splice(discardedSupplyIndex, 1);
                    const source = previousRects.get(`supply-${discardedSupply.id}`);
                    const discard = currentRects.get("discard");
                    if (source && discard) {
                        const from = rectCenter(source);
                        const to = rectCenter(discard);
                        animateCard({
                            annotation: "remote discard supply to discard",
                            card: discardedSupply,
                            fromX: from.x,
                            fromY: from.y,
                            destination: { type: "discard" },
                            hiddenDestinationKey: "discard"
                        }, to.x, to.y);
                        setDiscardAnimationPlaceholder(oldGame.discardTop);
                    }
                }
                game.players.forEach((player, playerIndex) => {
                    const oldPlayer = oldGame.players[playerIndex];
                    if (!oldPlayer) return;
                    const oldBoardCards = boardCardsById(oldPlayer.board);
                    player.board.forEach((boardCard) => {
                        const oldBoardCard = oldBoardCards.get(boardCard.card.id);
                        if (!oldBoardCard || boardCard.card.type !== "station" || oldBoardCard.card.type !== "station") return;
                        if (Boolean(oldBoardCard.card.flipped) !== Boolean(boardCard.card.flipped)) {
                            animateStationFlip(boardCard.card.id, oldBoardCard.card, boardCard.card);
                        }
                    });
                    const previousHandEnd = handEndRect(oldGame, playerIndex, previousRects, previousHandAreaRects.current);
                    const currentHandEnd = handEndRect(game, playerIndex, currentRects, currentHandAreaRects);
                    const addedBoardCards = newBoardCards(oldGame, game, playerIndex);
                    if (addedBoardCards.length > 0) {
                        addedBoardCards.forEach((boardCard) => {
                            const source = handCardRect(oldGame, playerIndex, boardCard.card.id, previousRects, previousHandAreaRects.current);
                            const destination = currentRects.get(`board-${boardCard.card.id}`);
                            if (!source || !destination) return;
                            const from = rectCenter(source);
                            const to = rectCenter(destination);
                            suppressedLayoutAnimations.current.add(`board-${boardCard.card.id}`);
                            animateCard({
                                annotation: "remote play module from hand to board",
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
                                annotation: "remote discard from hand to discard",
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
                                annotation: "remote take supply to hand",
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
                                annotation: "remote draw stock to hand",
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
            }
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
            if (skipInferredCardAnimations) {
                locallySubmittedVersion.current = null;
            }
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
            flushSync(() => hideAnimationDestination(sourceKey));
        }
        void sendCommand(game, command)
            .then(({ game: updated, message: commandMessage }) => {
                if (animation && animationDestination) {
                    animateCard(animation, animationDestination.x, animationDestination.y, null, () => {
                        captureLayoutSnapshot();
                        if (animation.destination.type === "boardCard") {
                            previousLayoutRects.current.set(
                                `board-${animation.destination.cardId}`,
                                boardCardRectAtPoint(animationDestination, animation.rotation, zoom)
                            );
                        }
                        locallySubmittedVersion.current = updated.version;
                        setGame(updated);
                        setMessage(commandMessage);
                        if (sourceKey?.startsWith("board-")) {
                            showAnimationDestination(sourceKey);
                        }
                        commandAnimationPending.current = false;
                        setIsSubmitting(false);
                    });
                    return;
                }
                commandAnimationPending.current = false;
                captureLayoutSnapshot();
                locallySubmittedVersion.current = updated.version;
                setGame(updated);
                setMessage(commandMessage);
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

    const runInteractionDecision = (decision: LunarCardInteractionDecision, from: { x: number; y: number }) => {
        runCommand(decision.command, {
            ...decision.animation,
            fromX: from.x,
            fromY: from.y
        });
    };

    const runResolvedInteraction = (
        source: LunarCardInteractionSource,
        target: LunarCardInteractionTarget,
        gesture: LunarCardInteractionGesture,
        from: { x: number; y: number }
    ): boolean => {
        const decision = resolveLunarCardInteraction(source, target, gesture, actionContext);
        if (!decision) return false;
        runInteractionDecision(decision, from);
        return true;
    };

    const animateCard = (
        animation: CardMovementAnimation,
        toX: number,
        toY: number,
        hiddenDestinationKey = animation.hiddenDestinationKey ?? null,
        onComplete?: () => void
    ) => {
        clearBoardHovers();
        setDropSnapRect(null);
        const from = scrollLocalPoint(tableScrollRef.current, { x: animation.fromX, y: animation.fromY });
        const to = scrollLocalPoint(tableScrollRef.current, { x: toX, y: toY });
        const next = { key: flyKey.current + 1, ...animation, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y };
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
    const interaction = game.actionState?.interaction ?? null;
    const interactionKind = interaction?.kind ?? null;
    const canUseControls = game.lifecycle === "active" && !isSubmitting;
    const isCurrentTurnViewer = viewerSeat === game.currentPlayerIndex && canUseControls;
    const isActionActor = viewerSeat !== null && interaction?.actorIndex === viewerSeat && canUseControls;
    const canChooseMainAction = isCurrentTurnViewer && game.actionState.phase === "choosingMainAction" && !game.actionState.mainActionChosen && !interaction;
    const canPlayAgents = canChooseMainAction;
    const canDrawForAction = isActionActor && interactionKind === "draw";
    const canBuildForAction = isActionActor && interactionKind === "build";
    const canDraftSupply = isActionActor && interactionKind === "draft";
    const canResellSupply = isActionActor && interactionKind === "resell";
    const canDiscardForAction = isActionActor && interactionKind === "discard";
    const canDiscardInfluenceForAction = isActionActor && interactionKind === "discardInfluence";
    const canDiscardHandCard = (card: LunarBaseCard) => canDiscardForAction || (canDiscardInfluenceForAction && card.type === "influence");
    const canFlipForAction = isActionActor && (interactionKind === "flipStation" || (interactionKind === "flipStationTo" && !(interaction?.buttons?.length)));
    const canFlipStationForPlayer = (playerIndex: number) => {
        if (!canFlipForAction) return false;
        if (interactionKind === "flipStation") {
            return interaction?.action?.flipAmountKind !== "self" || playerIndex === viewerSeat;
        }
        return playerIndex === viewerSeat;
    };
    const actionContext = { game, viewerSeat, canPlayAgents };
    const isGameFinished = game.lifecycle === "finished";
    const selectedHandCard = selectedCard ? hand.find((card) => card.id === selectedCard.cardId) ?? null : null;
    const draggingSource = dragState?.source ?? null;
    const draggingSourceKey = dragState?.sourceKey ?? null;
    const draggingCardId = dragState?.cardId ?? null;
    const draggingSupply = dragState?.slotIndex !== null && dragState?.supplyCard ? { slotIndex: dragState.slotIndex, card: dragState.supplyCard } : null;
    const draggingRotation = draggingSource === "hand" || draggingSource === "board" ? dragState?.rotation ?? null : null;
    const dragImageMetrics = dragState?.metrics ?? null;
    const draggingHandCard = draggingCardId ? hand.find((card) => card.id === draggingCardId) ?? null : null;
    const viewerPlayer = viewerSeat === null ? null : game.players[viewerSeat] ?? null;
    const stealableModuleName = isActionActor && interactionKind === "stealModule" ? interaction?.action?.moduleName ?? null : null;
    const canStealBoardCard = (playerIndex: number, boardCard: LunarBaseBoardCard) => Boolean(
        viewerSeat !== null &&
        viewerPlayer &&
        stealableModuleName &&
        playerIndex !== viewerSeat &&
        boardCard.card.type === "module" &&
        boardCard.card.name === stealableModuleName &&
        hasLegalPlacement(viewerPlayer.board, boardCard.card)
    );
    const findBoardCard = (cardId: string, playerIndex?: number | null): LunarBaseBoardCard | null => {
        const players = playerIndex === null || playerIndex === undefined
            ? game.players.map((player, index) => ({ player, index }))
            : [{ player: game.players[playerIndex], index: playerIndex }];
        for (const { player } of players) {
            const boardCard = player?.board.find((candidate) => candidate.card.id === cardId);
            if (boardCard) return boardCard;
        }
        return null;
    };
    const selectedBoardCard = selectedCard?.source === "board" ? findBoardCard(selectedCard.cardId, selectedCard.sourcePlayerIndex) : null;
    const draggingBoardCard = draggingSource === "board" && draggingCardId ? findBoardCard(draggingCardId, dragState?.boardPlayerIndex) : null;
    const selectedPlayableModule = selectedHandCard && selectedCard && viewerPlayer && selectedHandCard.type === "module" && canBuildForAction && canPlayHandCard(selectedHandCard, viewerPlayer)
        ? { card: selectedHandCard, rotation: selectedCard.rotation, visualRotation: selectedCard.visualRotation }
        : selectedBoardCard && selectedCard && viewerPlayer && selectedBoardCard.card.type === "module" && hasLegalPlacement(viewerPlayer.board, selectedBoardCard.card)
            ? { card: selectedBoardCard.card, rotation: selectedCard.rotation, visualRotation: selectedCard.visualRotation }
            : null;
    const draggedPlayableModule = draggingHandCard && viewerPlayer && draggingHandCard.type === "module" && canBuildForAction && canPlayHandCard(draggingHandCard, viewerPlayer)
        ? draggingHandCard
        : draggingBoardCard && viewerPlayer && draggingBoardCard.card.type === "module" && hasLegalPlacement(viewerPlayer.board, draggingBoardCard.card)
            ? draggingBoardCard.card
            : null;
    const seatedPlayers = game.seats.flatMap((seat) => seat.userId ? [{ id: seat.userId }] : []);
    const supplyTopRowCount = Math.ceil(game.supply.length / 2);
    const supplyRows = [game.supply.slice(0, supplyTopRowCount), game.supply.slice(supplyTopRowCount)];
    const animationHiddenClass = (key: string) => hiddenAnimationDestinations.has(key) ? "is-animation-destination-hidden" : "";
    const draggingSourceClass = (key: string) => draggingSourceKey === key ? "is-dragging-source" : "";
    const displayedStockCount = draggingSourceKey === "stock" ? Math.max(0, game.stockCount - 1) : game.stockCount;
    const canUseStockForDraw = canDrawForAction && (game.stockCount > 0 || game.discardCount > 0);
    const displayedDiscardTop = hiddenAnimationDestinations.has("discard") ? discardAnimationPlaceholder : game.discardTop;
    const dragPreview = dragPreviewPoint && draggingSource
        ? {
            card: draggingSource === "hand" ? draggingHandCard : draggingSource === "board" ? draggingBoardCard?.card ?? null : draggingSource === "supply" ? draggingSupply?.card ?? null : null,
            faceDown: draggingSource === "stock",
            rotation: draggingSource === "hand" || draggingSource === "board" ? draggingRotation ?? undefined : undefined
        }
        : null;

    const claimSeat = (seatIndex: number, playerUserId: string | null, displayName: string) => {
        runCommand({ type: "claimSeat", seatIndex, playerUserId: playerUserId ?? currentUserId, displayName });
        setActivePickerSeat(null);
    };

    const setActiveDragState = (nextDragState: ActiveDragState | null) => {
        dragStateRef.current = nextDragState;
        setDragState(nextDragState);
    };

    const clearBoardHovers = () => {
        boardRefs.current.forEach((board) => board.clearHover());
    };

    const stopDragAutoScroll = () => {
        if (dragAutoScrollFrame.current !== null) {
            window.cancelAnimationFrame(dragAutoScrollFrame.current);
            dragAutoScrollFrame.current = null;
        }
        dragAutoScrollState.current = null;
        lastDragPoint.current = null;
    };

    const clearTableSelection = () => {
        if (stationReveal?.phase === "revealed") {
            closeRevealedStation();
            return;
        }
        if (stationReveal) return;
        if (selectedCardRef.current) clearSelectedCard();
    };

    const clearDragState = () => {
        returningDragRef.current = false;
        clearBoardHovers();
        setDropSnapRect(null);
        setDragPreviewPoint(null);
        stopDragAutoScroll();
        stopPendingCardPressScroll();
        lastDragOverPoint.current = null;
        setActiveDragState(null);
    };

    const showDropSnap = (rect: DOMRect | null) => {
        setDropSnapRect(rect);
    };

    const clearDropSnap = () => {
        setDropSnapRect(null);
    };

    const viewerHandDropSnapRect = (): DOMRect | null => {
        if (viewerSeat === null) return null;
        const lastCard = hand.length > 0 ? hand[hand.length - 1] : null;
        const lastCardRect = lastCard ? handCardRefs.current.get(lastCard.id)?.getBoundingClientRect() : null;
        if (lastCardRect && lastCardRect.width > 0 && lastCardRect.height > 0) {
            return cardRectFromCenter({
                x: lastCardRect.left + lastCardRect.width / 2 + cardWidth * zoom + cardGap * zoom,
                y: lastCardRect.top + lastCardRect.height / 2
            }, zoom);
        }
        const handAreaRect = handAreaRefs.current.get(viewerSeat)?.getBoundingClientRect();
        return handAreaRect && handAreaRect.width > 0 && handAreaRect.height > 0
            ? cardRectFromCenter({ x: handAreaRect.left + (cardWidth * zoom) / 2, y: handAreaRect.top + cardWidth * zoom }, zoom)
            : null;
    };

    const viewerHandDropTarget = (center: { x: number; y: number }): { rect: DOMRect } | null => {
        if (viewerSeat === null) return null;
        const snapRect = viewerHandDropSnapRect();
        const handAreaRect = handAreaRefs.current.get(viewerSeat)?.getBoundingClientRect() ?? null;
        const boundedHandRect = handAreaRect && snapRect
            ? new DOMRect(
                handAreaRect.left,
                Math.min(handAreaRect.top, snapRect.top),
                Math.max(0, snapRect.right - handAreaRect.left),
                Math.max(handAreaRect.bottom, snapRect.bottom) - Math.min(handAreaRect.top, snapRect.top)
            )
            : null;
        if (rectContainsPoint(boundedHandRect, center) || rectContainsPoint(snapRect, center)) {
            return snapRect ? { rect: snapRect } : null;
        }
        return null;
    };

    const nonBoardDropTarget = (center: { x: number; y: number }):
        | { type: "hand"; rect: DOMRect }
        | { type: "discard"; rect: DOMRect }
        | null => {
        const activeDrag = dragStateRef.current;
        const source = activeDrag?.source ?? draggingSource;
        const activeSupply = activeDrag?.source === "supply" && activeDrag.slotIndex !== null && activeDrag.supplyCard
            ? { slotIndex: activeDrag.slotIndex, card: activeDrag.supplyCard }
            : draggingSupply;
        const activeCardId = activeDrag?.cardId ?? draggingCardId;
        const handCard = activeCardId ? hand.find((candidate) => candidate.id === activeCardId) ?? null : null;
        const interactionSource: LunarCardInteractionSource | null = source === "stock"
            ? { type: "stock" }
            : source === "supply" && activeSupply
                ? { type: "supply", slotIndex: activeSupply.slotIndex, card: activeSupply.card }
                : source === "hand" && handCard && viewerSeat !== null
                    ? { type: "hand", viewerSeat, card: handCard }
                    : null;
        if (!interactionSource) return null;
        const handTarget = viewerHandDropTarget(center);
        if (handTarget && resolveLunarCardInteraction(interactionSource, { type: "hand" }, "drop", actionContext)) {
            return { type: "hand", rect: handTarget.rect };
        }
        const discardRect = discardRef.current?.getBoundingClientRect() ?? null;
        if (rectContainsPoint(discardRect, center) && resolveLunarCardInteraction(interactionSource, { type: "discard" }, "drop", actionContext)) {
            return { type: "discard", rect: discardRect };
        }
        return null;
    };

    const dropOnNonBoardTarget = (event: DragEvent<HTMLElement>, target: { type: "hand" | "discard"; rect: DOMRect }) => {
        const activeDrag = dragStateRef.current;
        const source = activeDrag?.source ?? draggingSource;
        const activeSupply = activeDrag?.source === "supply" && activeDrag.slotIndex !== null && activeDrag.supplyCard
            ? { slotIndex: activeDrag.slotIndex, card: activeDrag.supplyCard }
            : draggingSupply;
        const activeCardId = activeDrag?.cardId ?? draggingCardId;
        const from = draggedCardCenter(event);
        const card = activeCardId ? hand.find((candidate) => candidate.id === activeCardId) ?? null : null;
        const interactionSource: LunarCardInteractionSource | null = source === "stock"
            ? { type: "stock" }
            : source === "supply" && activeSupply
                ? { type: "supply", slotIndex: activeSupply.slotIndex, card: activeSupply.card }
                : source === "hand" && card && viewerSeat !== null
                    ? { type: "hand", viewerSeat, card }
                    : null;
        if (interactionSource && runResolvedInteraction(interactionSource, { type: target.type }, "drop", from)) {
            clearDragState();
            return true;
        }
        return false;
    };

    const dragCenterFromEvent = (event: DragEvent<HTMLElement>) => {
        const dataOffsetX = Number(event.dataTransfer.getData("centerOffsetX"));
        const dataOffsetY = Number(event.dataTransfer.getData("centerOffsetY"));
        const currentMetrics = dragStateRef.current?.metrics ?? dragImageMetrics;
        const centerOffsetX = currentMetrics?.centerOffsetX ?? (Number.isFinite(dataOffsetX) ? dataOffsetX : 0);
        const centerOffsetY = currentMetrics?.centerOffsetY ?? (Number.isFinite(dataOffsetY) ? dataOffsetY : 0);
        const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
        const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
        return {
            x: clientX + centerOffsetX,
            y: clientY + centerOffsetY
        };
    };

    const cardButtonFromEventTarget = (target: EventTarget): Element | null =>
        target instanceof Element ? target.closest("[data-lunar-animate], .lunar-pile") : null;

    const stopPendingCardPressScroll = () => {
        const pending = pendingCardPressScroll.current;
        pendingCardPressScroll.current = null;
        pending?.stop();
    };

    const stopPostDropScrollGuard = () => {
        const stop = postDropScrollGuard.current;
        postDropScrollGuard.current = null;
        stop?.();
    };

    const guardTableScrollThroughDrop = () => {
        const scroller = tableScrollRef.current;
        if (!scroller) return;
        const scroll = { left: scroller.scrollLeft, top: scroller.scrollTop };
        let stopped = false;
        let frame: number | null = null;
        let timer: number | null = null;
        const restore = () => {
            if (stopped) return;
            restoreScrollPosition(scroller, scroll);
        };
        const scheduleRestore = () => {
            if (stopped) return;
            restore();
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                restore();
            });
        };
        const stop = () => {
            stopped = true;
            if (postDropScrollGuard.current === stop) {
                postDropScrollGuard.current = null;
            }
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
                frame = null;
            }
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
            scroller.removeEventListener("scroll", scheduleRestore);
        };
        stopPostDropScrollGuard();
        postDropScrollGuard.current = stop;
        scroller.addEventListener("scroll", scheduleRestore);
        restore();
        window.setTimeout(restore, 0);
        window.requestAnimationFrame(() => {
            restore();
            window.requestAnimationFrame(restore);
        });
        timer = window.setTimeout(stop, 300);
    };

    const createPendingCardPressScroll = (scroller: HTMLDivElement, scroll: { left: number; top: number }): PendingCardPressScroll => {
        let stopped = false;
        let frame: number | null = null;
        const restore = () => {
            if (stopped) return;
            restoreScrollPosition(scroller, scroll);
        };
        const scheduleRestore = () => {
            if (stopped) return;
            restore();
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                restore();
            });
        };
        const stop = () => {
            stopped = true;
            if (pendingCardPressScroll.current?.stop === stop) {
                pendingCardPressScroll.current = null;
            }
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
                frame = null;
            }
            scroller.removeEventListener("scroll", scheduleRestore);
            window.removeEventListener("pointerup", stop, true);
            window.removeEventListener("pointercancel", stop, true);
            window.removeEventListener("mouseup", stop, true);
        };
        scroller.addEventListener("scroll", scheduleRestore);
        window.addEventListener("pointerup", stop, true);
        window.addEventListener("pointercancel", stop, true);
        window.addEventListener("mouseup", stop, true);
        restore();
        window.setTimeout(restore, 0);
        window.requestAnimationFrame(() => {
            restore();
            window.requestAnimationFrame(restore);
        });
        return { scroller, ...scroll, stop };
    };

    const preserveTableScrollForPotentialCardPress = (event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
        const target = cardButtonFromEventTarget(event.target);
        if (!target || !event.currentTarget.contains(target)) return;
        const scroller = event.currentTarget;
        const initialScroll = { left: scroller.scrollLeft, top: scroller.scrollTop };
        stopPendingCardPressScroll();
        pendingCardPressScroll.current = createPendingCardPressScroll(scroller, initialScroll);
    };

    const restoreTableScrollAfterPotentialCardInteraction = (event: FocusEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
        const target = cardButtonFromEventTarget(event.target);
        const pending = pendingCardPressScroll.current;
        if (!target || !pending || pending.scroller !== event.currentTarget || !event.currentTarget.contains(target)) return;
        restoreScrollPosition(pending.scroller, pending);
    };

    const beginCardDrag = (
        event: DragEvent<HTMLElement>,
        {
            source,
            sourceKey,
            cardId,
            boardPlayerIndex,
            slotIndex,
            supplyCard,
            rotation = 0
        }: {
            source: DragSource;
            sourceKey: string;
            cardId?: string;
            boardPlayerIndex?: number;
            slotIndex?: number;
            supplyCard?: LunarBaseCard;
            rotation?: CardRotation;
        }
    ) => {
        stopPendingCardPressScroll();
        updateDragOverlaySize();
        const scroller = tableScrollRef.current;
        const initialScroll = scroller
            ? { left: scroller.scrollLeft, top: scroller.scrollTop }
            : null;
        const restoreInitialScroll = () => {
            if (!scroller || !initialScroll) return;
            restoreScrollPosition(scroller, initialScroll);
        };
        const restoreInitialScrollIfDragHasNotMoved = () => {
            if (dragStateRef.current?.sourceKey !== sourceKey || lastDragOverPoint.current) return;
            restoreInitialScroll();
        };
        lastDragOverPoint.current = null;
        const metrics = setScaledDragImage(event, zoom, rotation) ?? null;
        restoreInitialScroll();
        if (scroller) {
            const rect = scroller.getBoundingClientRect();
            dragAutoScrollState.current = createDragAutoScrollState(
                {
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    scrollLeft: scroller.scrollLeft,
                    scrollTop: scroller.scrollTop,
                    scrollWidth: scroller.scrollWidth,
                    scrollHeight: scroller.scrollHeight,
                    clientWidth: scroller.clientWidth,
                    clientHeight: scroller.clientHeight
                },
                event.clientX,
                event.clientY,
                cardWidth
            );
            lastDragPoint.current = { x: event.clientX, y: event.clientY };
        }
        setActiveDragState({
            source,
            sourceKey,
            cardId: cardId ?? null,
            boardPlayerIndex: boardPlayerIndex ?? null,
            slotIndex: slotIndex ?? null,
            supplyCard: source === "supply" ? supplyCard ?? null : null,
            rotation,
            metrics
        });
        window.setTimeout(restoreInitialScrollIfDragHasNotMoved, 0);
        window.requestAnimationFrame(restoreInitialScrollIfDragHasNotMoved);
        setDragPreviewPoint(scrollLocalPoint(tableScrollRef.current, dragCenterFromEvent(event)));
        event.dataTransfer.setData("source", source);
        event.dataTransfer.setData("centerOffsetX", String(metrics?.centerOffsetX ?? 0));
        event.dataTransfer.setData("centerOffsetY", String(metrics?.centerOffsetY ?? 0));
        if (cardId) event.dataTransfer.setData("cardId", cardId);
        if (slotIndex !== undefined) event.dataTransfer.setData("slotIndex", String(slotIndex));
        event.dataTransfer.setData("rotation", String(rotation));
        event.dataTransfer.effectAllowed = "move";
    };

    const draggedCardCenter = (event: DragEvent<HTMLElement>) => dragCenterFromEvent(event);

    const updateDragPreview = (event: DragEvent<HTMLElement>) => {
        updateDragOverlaySize();
        setDragPreviewPoint(scrollLocalPoint(tableScrollRef.current, draggedCardCenter(event)));
    };

    const handleTableDragLeave = (event: DragEvent<HTMLElement>) => {
        const scroller = tableScrollRef.current;
        if (!scroller) return;
        const rect = scroller.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const clientRight = rect.left + (scroller.clientWidth > 0 ? scroller.clientWidth : rect.width);
        const clientBottom = rect.top + (scroller.clientHeight > 0 ? scroller.clientHeight : rect.height);
        const inClientArea = event.clientX >= rect.left
            && event.clientX <= clientRight
            && event.clientY >= rect.top
            && event.clientY <= clientBottom;
        if (!inClientArea) {
            clearDropSnap();
        }
    };

    const trackedDraggedCardCenter = (event: DragEvent<HTMLElement>) => {
        const point = lastDragOverPoint.current;
        if (!point) return draggedCardCenter(event);
        const currentMetrics = dragStateRef.current?.metrics ?? dragImageMetrics;
        const dataOffsetX = Number(event.dataTransfer.getData("centerOffsetX"));
        const dataOffsetY = Number(event.dataTransfer.getData("centerOffsetY"));
        const centerOffsetX = currentMetrics?.centerOffsetX ?? (Number.isFinite(dataOffsetX) ? dataOffsetX : 0);
        const centerOffsetY = currentMetrics?.centerOffsetY ?? (Number.isFinite(dataOffsetY) ? dataOffsetY : 0);
        return {
            x: point.x + centerOffsetX,
            y: point.y + centerOffsetY
        };
    };

    const runDragAutoScroll = () => {
        dragAutoScrollFrame.current = null;
        const scroller = tableScrollRef.current;
        const state = dragAutoScrollState.current;
        const point = lastDragPoint.current;
        if (!scroller || !state || !point || (!dragStateRef.current && !draggingSource)) return;
        const rect = scroller.getBoundingClientRect();
        const delta = dragAutoScrollDelta(
            state,
            {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                scrollLeft: scroller.scrollLeft,
                scrollTop: scroller.scrollTop,
                scrollWidth: scroller.scrollWidth,
                scrollHeight: scroller.scrollHeight,
                clientWidth: scroller.clientWidth,
                clientHeight: scroller.clientHeight
            },
            point.x,
            point.y,
            cardWidth,
            8
        );
        if (delta.dx !== 0 || delta.dy !== 0) {
            scroller.scrollBy(delta.dx, delta.dy);
            dragAutoScrollFrame.current = window.requestAnimationFrame(runDragAutoScroll);
        }
    };

    const updateDragAutoScroll = (event: DragEvent<HTMLElement>) => {
        if (!dragStateRef.current && !draggingSource) return;
        lastDragPoint.current = { x: event.clientX, y: event.clientY };
        lastDragOverPoint.current = { x: event.clientX, y: event.clientY };
        updateDragPreview(event);
        if (dragAutoScrollFrame.current === null) {
            dragAutoScrollFrame.current = window.requestAnimationFrame(runDragAutoScroll);
        }
    };

    const routeViewerBoardDragOver = (event: DragEvent<HTMLElement>) => {
        if (viewerSeat === null || (draggingSource !== "hand" && draggingSource !== "board") || !draggedPlayableModule) return false;
        return boardRefs.current.get(viewerSeat)?.dragOver(event) ?? false;
    };

    const routeViewerBoardDrop = (event: DragEvent<HTMLElement>) => {
        if (viewerSeat === null || (draggingSource !== "hand" && draggingSource !== "board") || !draggedPlayableModule) return false;
        return boardRefs.current.get(viewerSeat)?.drop(event) ?? false;
    };

    const handleDragEnd = (event: DragEvent<HTMLElement>) => {
        if (returningDragRef.current) return;
        if (dragStateRef.current) {
            guardTableScrollThroughDrop();
            returnDraggedCard(event);
            return;
        }
        clearDragState();
    };

    const returnDraggedCard = (event: DragEvent<HTMLElement>) => {
        if (returningDragRef.current) return;
        const activeDrag = dragStateRef.current;
        const source = activeDrag?.source ?? event.dataTransfer.getData("source");
        if (!source) return;

        const cardId = activeDrag?.cardId ?? event.dataTransfer.getData("cardId");
        const handCard = cardId ? hand.find((candidate) => candidate.id === cardId) ?? null : null;
        const boardPlayerIndex = activeDrag?.boardPlayerIndex;
        const boardCard = cardId ? findBoardCard(cardId, boardPlayerIndex) : null;
        const slotIndex = activeDrag?.slotIndex ?? Number(event.dataTransfer.getData("slotIndex"));
        const supplyCard = activeDrag?.supplyCard ?? (Number.isFinite(slotIndex) ? game.supply[slotIndex] ?? null : null);
        const returnDetails = source === "hand" && handCard && viewerSeat !== null
            ? {
                annotation: "return hand card to hand",
                card: handCard,
                faceDown: false,
                rotation: activeDrag?.rotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation"))),
                destination: animatedElementRect(`hand-${viewerSeat}-${handCard.id}`),
                hiddenDestinationKey: `hand-${viewerSeat}-${handCard.id}`
            }
            : source === "board" && boardCard
                ? {
                    annotation: "return stolen module to board",
                    card: boardCard.card,
                    faceDown: false,
                    rotation: activeDrag?.rotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation"))),
                    destination: animatedElementRect(`board-${boardCard.card.id}`),
                    hiddenDestinationKey: `board-${boardCard.card.id}`
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
        const from = trackedDraggedCardCenter(event);
        returningDragRef.current = true;
        setActiveDragState(null);
        animateCard(
            {
                annotation: returnDetails.annotation,
                card: returnDetails.card,
                faceDown: returnDetails.faceDown,
                rotation: returnDetails.rotation,
                fromX: from.x,
                fromY: from.y,
                destination: source === "board" && returnDetails.card
                    ? { type: "boardCard", cardId: returnDetails.card.id }
                    : returnDetails.card
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
        if (!viewerPlayer) return;
        const canClickCard = (card.type === "agent" && canPlayAgents && canPlayHandCard(card, viewerPlayer)) ||
            (card.type === "module" && canBuildForAction && canPlayHandCard(card, viewerPlayer)) ||
            canDiscardHandCard(card);
        if (!canClickCard) return;
        const from = rectCenter(event.currentTarget.getBoundingClientRect());
        if (selectedCard && selectedCard.cardId !== card.id) {
            clearSelectedCard(() => performHandCardClickAction(card, from));
            return;
        }
        performHandCardClickAction(card, from);
    };

    const performHandCardClickAction = (card: LunarBaseCard, from: { x: number; y: number }) => {
        if (viewerSeat === null) return;
        if (canDiscardHandCard(card) || card.type !== "module") {
            runResolvedInteraction({ type: "hand", viewerSeat, card }, { type: "discard" }, "click", from);
            return;
        }
        if (canBuildForAction) {
            setSelectedCard((current) => {
                if (current?.cardId !== card.id) return selectedModuleState(card.id, 0);
                return rotateSelectedModule(current);
            });
        }
    };

    const clickStealableBoardCard = (playerIndex: number, boardCard: LunarBaseBoardCard, event: MouseEvent<HTMLElement>) => {
        if (!canStealBoardCard(playerIndex, boardCard)) return;
        const from = rectCenter(event.currentTarget.getBoundingClientRect());
        if (selectedCard && selectedCard.cardId !== boardCard.card.id) {
            clearSelectedCard(() => performStealableBoardCardClickAction(playerIndex, boardCard, from));
            return;
        }
        performStealableBoardCardClickAction(playerIndex, boardCard, from);
    };

    const performStealableBoardCardClickAction = (playerIndex: number, boardCard: LunarBaseBoardCard, _from: { x: number; y: number }) => {
        setSelectedCard((current) => {
            if (current?.cardId !== boardCard.card.id || current.source !== "board") {
                return selectedModuleState(boardCard.card.id, boardCard.rotation, "board", playerIndex);
            }
            return rotateSelectedModule(current);
        });
    };

    const moveHandCard = (
        card: LunarBaseCard,
        from: { x: number; y: number },
        destination: { type: "discard" } | { type: "boardCard"; cardId: string; x: number; y: number; rotation: CardRotation; to?: { x: number; y: number } | null },
        annotation: string
    ) => {
        if (viewerSeat === null) return;
        const target: LunarCardInteractionTarget = destination.type === "boardCard"
            ? { type: "board", x: destination.x, y: destination.y, rotation: destination.rotation, to: destination.to }
            : { type: "discard" };
        const decision = resolveLunarCardInteraction({ type: "hand", viewerSeat, card }, target, annotation.startsWith("drop") ? "drop" : "click", actionContext);
        if (!decision) return;
        runInteractionDecision({
            ...decision,
            animation: {
                ...decision.animation,
                annotation
            }
        }, from);
    };

    const moveBoardCard = (
        playerIndex: number,
        boardCard: LunarBaseBoardCard,
        from: { x: number; y: number },
        destination: { type: "boardCard"; cardId: string; x: number; y: number; rotation: CardRotation; to?: { x: number; y: number } | null },
        annotation: string
    ) => {
        const decision = resolveLunarCardInteraction(
            { type: "board", playerIndex, card: boardCard.card },
            { type: "board", x: destination.x, y: destination.y, rotation: destination.rotation, to: destination.to },
            annotation.startsWith("drop") ? "drop" : "click",
            actionContext
        );
        if (!decision) return;
        runInteractionDecision({
            ...decision,
            animation: {
                ...decision.animation,
                annotation
            }
        }, from);
    };

    const moveSupplyCard = (
        slotIndex: number,
        card: LunarBaseCard,
        from: { x: number; y: number },
        destination: "hand" | "discard",
        annotation: string
    ) => {
        const decision = resolveLunarCardInteraction(
            { type: "supply", slotIndex, card },
            { type: destination },
            annotation.startsWith("drop") ? "drop" : "click",
            actionContext
        );
        if (!decision) return;
        runInteractionDecision({
            ...decision,
            animation: {
                ...decision.animation,
                annotation
            }
        }, from);
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
        clearSelectedCard();
        animateStationFlip(cardId, from, to, onComplete);
    };

    const flipStation = (playerIndex: number, cardId: string) => {
        if (!canFlipForAction) return;
        if (!canFlipStationForPlayer(playerIndex)) return;
        if (stationReveal || stationFlipAnimations.has(cardId)) return;
        const station = game.players[playerIndex]?.board.find((boardCard) => boardCard.card.id === cardId)?.card;
        if (!station) return;
        const nextStation = stationOppositeSideCard(station);
        beginStationSideChange(cardId, station, nextStation);
        updateLocalStation(cardId, nextStation);
        runCommand({ type: "flipStation", playerIndex, cardId });
    };

    const revealStation = (cardId: string) => {
        if (stationReveal?.phase === "revealed") {
            closeRevealedStation();
            return;
        }
        if (stationReveal || stationFlipAnimations.has(cardId)) return;
        const station = viewerPlayer?.board.find((boardCard) => boardCard.card.id === cardId)?.card;
        if (!station) {
            clearSelectedCard();
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
        const station = game.players.flatMap((player) => player.board).find((boardCard) => boardCard.card.id === cardId)?.card;
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
    const showEndGameModal = isGameFinished && Boolean(game.endGameResult) && dismissedEndGameVersion !== game.version;
    const actionSourceCardName = !isGameFinished && game.actionState.phase === "resolvingAction" ? game.actionState.sourceCardName ?? null : null;
    const buttonPrompt = interactionPromptText(interaction);
    const runActionPanelButton = (value: string) => {
        if (!interaction) return;
        if (interaction.kind === "chooseOne") {
            runCommand({ type: "chooseActionOption", optionIndex: Number(value) });
            return;
        }
        if (value === "discardInfluence") {
            runCommand({ type: "startInfluenceNegation" });
            return;
        }
        if (value === "skip" || value === "done") {
            runCommand({ type: "finishInteraction" });
            return;
        }
        if (interaction.kind === "stealCredits" || interaction.kind === "chooseOpponent" || interaction.kind === "chooseScopeTarget") {
            runCommand({ type: "choosePlayer", playerIndex: Number(value) });
            return;
        }
    };

    return (
        <section className="game-page lunar-page">
            <div className="lunar-game-ports">
                <section className="panel lunar-action-panel" aria-label="Action panel">
                    <div className="lunar-action-text">
                        {actionSourceCardName ? (
                            <strong className="lunar-action-source-card">{actionSourceCardName}</strong>
                        ) : null}
                        {actionPanelStatus(game, viewerSeat).split("\n").map((line, index) => (
                            <span key={index} className="lunar-action-text-line">{line}</span>
                        ))}
                    </div>
                    <div className="lunar-action-interaction">
                        {isActionActor && interaction?.buttons?.length ? (
                            <div className="lunar-action-buttons">
                                {buttonPrompt ? <span className="lunar-action-button-prompt">{buttonPrompt}</span> : null}
                                {interaction.buttons.map((button) => (
                                    <button
                                        key={button.value}
                                        type="button"
                                        onClick={() => runActionPanelButton(button.value)}
                                    >
                                        {button.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </section>
                <section
                    className="lunar-table-port"
                    aria-label="Lunar Base table"
                    onClickCapture={(event) => {
                        if (!revealDimmerVisible) return;
                        event.stopPropagation();
                        closeRevealedStation();
                    }}
                >
                    {revealDimmerVisible ? (
                        <button
                            type="button"
                            className="lunar-reveal-dimmer"
                            aria-label="Hide revealed station side"
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
                    <div
                        className="lunar-table-scroll"
                        ref={tableScrollRef}
                        onPointerDownCapture={preserveTableScrollForPotentialCardPress}
                        onMouseDownCapture={preserveTableScrollForPotentialCardPress}
                        onFocusCapture={restoreTableScrollAfterPotentialCardInteraction}
                        onClickCapture={restoreTableScrollAfterPotentialCardInteraction}
                        onClick={clearTableSelection}
                        onDragOver={(event) => {
                            if (event.defaultPrevented) {
                                if (
                                    (draggingSource === "hand" || draggingSource === "board") &&
                                    draggedPlayableModule &&
                                    event.target instanceof Element &&
                                    event.target.closest(".lunar-board")
                                ) {
                                    clearDropSnap();
                                }
                                if (dragStateRef.current || draggingSource) updateDragAutoScroll(event);
                                return;
                            }
                            if (routeViewerBoardDragOver(event)) {
                                clearDropSnap();
                                updateDragAutoScroll(event);
                                return;
                            }
                            if (dragStateRef.current || draggingSource) {
                                updateDragAutoScroll(event);
                                const target = nonBoardDropTarget(draggedCardCenter(event));
                                showDropSnap(target?.rect ?? null);
                                event.preventDefault();
                            }
                        }}
                        onDrop={(event) => {
                            guardTableScrollThroughDrop();
                            stopDragAutoScroll();
                            if (event.defaultPrevented) return;
                            if (routeViewerBoardDrop(event)) {
                                clearDragState();
                                return;
                            }
                            const target = nonBoardDropTarget(draggedCardCenter(event));
                            if (target) {
                                event.preventDefault();
                                if (dropOnNonBoardTarget(event, target)) return;
                            }
                            returnDraggedCard(event);
                        }}
                        onDragLeave={handleTableDragLeave}
                    >
                        <div className="lunar-play-area">
                            <div className="lunar-drag-overlay" style={dragOverlayStyle(dragOverlaySize)}>
                                {dropSnapRect ? (
                                    <div className="lunar-drop-snap" aria-hidden="true" style={rectStyle(scrollLocalRect(tableScrollRef.current, dropSnapRect))} />
                                ) : null}
                                {dragPreview && dragPreviewPoint ? (
                                    <div className="lunar-drag-preview" aria-hidden="true" style={dragPreviewStyle(dragPreviewPoint, zoom)}>
                                        <CardView card={dragPreview.card} faceDown={dragPreview.faceDown} rotation={dragPreview.rotation} />
                                    </div>
                                ) : null}
                                {flyingCards.map((flyingCard) => (
                                    <div
                                        key={flyingCard.key}
                                        className="lunar-flying-card"
                                        data-movement={flyingCard.annotation}
                                        aria-label={flyingCard.annotation}
                                        style={flyCardStyle(flyingCard, zoom)}
                                    >
                                        <CardView card={flyingCard.card} faceDown={flyingCard.faceDown} rotation={flyingCard.rotation} />
                                    </div>
                                ))}
                            </div>
                            <div className="lunar-table-content">
                                <div
                                    className="lunar-table-surface"
                                    style={{ "--lunar-zoom": zoom } as CSSProperties}
                                >
                            <section className="lunar-supply" aria-label="Supply">
                                {supplyRows.map((row, rowIndex) => (
                                    <div key={rowIndex} className="lunar-supply-row">
                                        {row.map((card, columnIndex) => {
                                            const slotIndex = rowIndex === 0 ? columnIndex : supplyTopRowCount + columnIndex;
                                            const canInteractWithSupplyCard = Boolean(card) && (
                                                (canDraftSupply && card ? canDraftSupplyCard(game, card) : false) ||
                                                (canResellSupply && card?.type !== "influence")
                                            );
                                            return (
                                                <div
                                                    key={`${card?.id ?? "empty"}-${slotIndex}`}
                                                    role={canInteractWithSupplyCard ? "button" : undefined}
                                                    tabIndex={canInteractWithSupplyCard ? -1 : undefined}
                                                    aria-disabled={!canInteractWithSupplyCard}
                                                    data-lunar-animate={card ? `supply-${card.id}` : undefined}
                                                    data-movement={card ? "supply card layout" : undefined}
                                                    className={[
                                                        "lunar-supply-slot",
                                                        card ? animationHiddenClass(`supply-${card.id}`) : "",
                                                        card ? draggingSourceClass(`supply-${card.id}`) : ""
                                                    ].filter(Boolean).join(" ")}
                                                    draggable={canInteractWithSupplyCard}
                                                    onClick={(event) => {
                                                        if (!canInteractWithSupplyCard || !card) return;
                                                        if (selectedCard) {
                                                            clearSelectedCard();
                                                            return;
                                                        }
                                                        const from = rectCenter(event.currentTarget.getBoundingClientRect());
                                                        moveSupplyCard(slotIndex, card, from, canResellSupply ? "discard" : "hand", canResellSupply ? "click supply card to discard" : "click supply card to hand");
                                                    }}
                                                    onDragStart={(event) => {
                                                        if (!canInteractWithSupplyCard || !card) return;
                                                        beginCardDrag(event, {
                                                            source: "supply",
                                                            sourceKey: `supply-${card.id}`,
                                                            slotIndex,
                                                            supplyCard: card
                                                        });
                                                    }}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    {card ? (
                                                        <CardView
                                                            card={card}
                                                            actionBadgeTargetable={canInteractWithSupplyCard}
                                                        />
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </section>
                            <section className="lunar-piles">
                                <div
                                    role="button"
                                    tabIndex={canUseStockForDraw ? -1 : undefined}
                                    className="lunar-pile"
                                    data-lunar-animate="stock"
                                    data-movement="stock pile layout"
                                    aria-label={`Stock, ${game.stockCount} cards`}
                                    aria-disabled={!canUseStockForDraw}
                                    draggable={canUseStockForDraw}
                                    onClick={(event) => {
                                        if (!canUseStockForDraw) return;
                                        if (selectedCard) {
                                            clearSelectedCard();
                                            return;
                                        }
                                        const from = rectCenter(event.currentTarget.getBoundingClientRect());
                                        runResolvedInteraction({ type: "stock" }, { type: "hand" }, "click", from);
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
                                </div>
                                <div
                                    ref={discardRef}
                                    className="lunar-pile"
                                    role="button"
                                    tabIndex={-1}
                                        aria-label={game.discardTop ? `Discard pile, ${game.discardCount} cards` : "Empty discard pile"}
                                        onClick={() => {
                                            if (selectedCard) clearSelectedCard();
                                        }}
                                        onKeyDown={(event) => {
                                            if ((event.key === "Enter" || event.key === " ") && selectedCard) {
                                                event.preventDefault();
                                                clearSelectedCard();
                                            }
                                    }}
                                    onDragLeave={clearDropSnap}
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
                                    const revealedHand = isGameFinished || interaction?.kind === "viewHand" ? game.viewer?.revealedHands?.[playerIndex] ?? null : null;
                                    const cards = isViewer ? hand : revealedHand ?? Array.from({ length: game.players[playerIndex].handCount }, (_, index) => ({ id: `back-${playerIndex}-${index}`, type: "module" as CardType }));
                                    return (
                                        <section
                                            key={playerIndex}
                                            className="lunar-player-area"
                                            onDragOver={(event) => {
                                                if (!isViewer || (draggingSource !== "hand" && draggingSource !== "board") || !draggedPlayableModule) return;
                                                boardRefs.current.get(playerIndex)?.dragOver(event);
                                            }}
                                            onDrop={(event) => {
                                                if (!isViewer || (draggingSource !== "hand" && draggingSource !== "board") || !draggedPlayableModule) return;
                                                if (boardRefs.current.get(playerIndex)?.drop(event)) {
                                                    clearDropSnap();
                                                    clearDragState();
                                                    event.stopPropagation();
                                                }
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
                                                onClick={() => clearSelectedCard()}
                                                onDragLeave={clearDropSnap}
                                            >
                                                {cards.length === 0 ? <span className="lunar-empty-hand">Empty hand</span> : cards.map((card) => {
                                                    const isRevealedOpponentCard = !isViewer && Boolean(revealedHand);
                                                    const playableHandCard = Boolean(isViewer && viewerPlayer && (
                                                        (card.type === "agent" && canPlayAgents && canPlayHandCard(card, viewerPlayer)) ||
                                                        (card.type === "module" && canBuildForAction && canPlayHandCard(card, viewerPlayer)) ||
                                                        canDiscardHandCard(card)
                                                    ));
                                                    const rotationResettingHandCard = resettingRotationCardIds.has(card.id);
                                                    const selectedHandCard = selectedCard?.cardId === card.id ? selectedCard : null;
                                                    return (
                                                        <div
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
                                                            role={isViewer ? "button" : undefined}
                                                            tabIndex={isViewer && playableHandCard ? -1 : undefined}
                                                            aria-disabled={!isViewer || !playableHandCard}
                                                            className={[
                                                                "lunar-hand-card",
                                                                draggingCardId === card.id ? "is-dragging" : "",
                                                                selectedHandCard ? "is-selected" : "",
                                                                rotationResettingHandCard ? "is-rotation-resetting" : "",
                                                                animationHiddenClass(`hand-${playerIndex}-${card.id}`)
                                                            ].filter(Boolean).join(" ")}
                                                            draggable={playableHandCard}
                                                            onClick={(event) => {
                                                                if (!(event.target instanceof Element) || !event.target.closest(".lunar-card")) return;
                                                                if (!isViewer || !playableHandCard) return;
                                                                event.stopPropagation();
                                                                clickHandCard(card, event);
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
                                                                card={isViewer || isRevealedOpponentCard ? card : null}
                                                                faceDown={!isViewer && !isRevealedOpponentCard}
                                                                selected={Boolean(selectedHandCard)}
                                                                rotation={selectedHandCard ? selectedHandCard.rotation : 0}
                                                                visualRotation={selectedHandCard ? selectedHandCard.visualRotation : 0}
                                                                instantRotation={instantRotationCardIds.has(card.id)}
                                                                actionBadgeTargetable={isViewer && playableHandCard}
                                                            />
                                                        </div>
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
                                                sourceSelection={selectedCard?.source === "board" && selectedCard.sourcePlayerIndex === playerIndex
                                                    ? {
                                                        cardId: selectedCard.cardId,
                                                        rotation: selectedCard.rotation,
                                                        visualRotation: selectedCard.visualRotation,
                                                        instantRotation: instantRotationCardIds.has(selectedCard.cardId)
                                                    }
                                                    : null}
                                                zoom={zoom}
                                                canAcceptDrag={Boolean(isViewer && (draggingSource === "hand" || draggingSource === "board") && draggedPlayableModule)}
                                                canShowStationControls={(isViewer || isGameFinished) && !stationReveal}
                                                canFlipStation={canFlipStationForPlayer(playerIndex)}
                                                revealedStationCardId={revealedStationCardId}
                                                stationFlipAnimations={stationFlipAnimations}
                                                draggedCard={isViewer ? draggedPlayableModule : null}
                                                draggedRotation={draggingRotation}
                                                dragImageMetrics={dragImageMetrics}
                                                onRevealStation={revealStation}
                                                onFlipStation={(cardId) => flipStation(playerIndex, cardId)}
                                                canChooseMainAction={(card) => Boolean(isViewer && canChooseMainAction && (
                                                    card.type === "station" ||
                                                    (card.type === "module" && card.mainActionText)
                                                ))}
                                                canStealCard={(boardCard) => canStealBoardCard(playerIndex, boardCard)}
                                                draggingSourceKey={draggingSourceKey}
                                                onChooseMainAction={(cardId) => runCommand({ type: "chooseMainAction", cardId })}
                                                onStealCardClick={(boardCard, event) => clickStealableBoardCard(playerIndex, boardCard, event)}
                                                onStealCardDragStart={(boardCard, event) => {
                                                    const rotation = selectedCard?.source === "board" && selectedCard.cardId === boardCard.card.id
                                                        ? selectedCard.rotation
                                                        : boardCard.rotation;
                                                    beginCardDrag(event, {
                                                        source: "board",
                                                        sourceKey: `board-${boardCard.card.id}`,
                                                        cardId: boardCard.card.id,
                                                        boardPlayerIndex: playerIndex,
                                                        rotation
                                                    });
                                                }}
                                                onStealCardDragEnd={handleDragEnd}
                                                onPlaySelected={(x, y, destination) => {
                                                    if (selectedCard?.source === "board" && selectedBoardCard) {
                                                        const fromElement = animatedElementRect(`board-${selectedBoardCard.card.id}`);
                                                        const from = fromElement ? rectCenter(fromElement) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                                                        moveBoardCard(
                                                            selectedCard.sourcePlayerIndex ?? playerIndex,
                                                            selectedBoardCard,
                                                            from,
                                                            { type: "boardCard", cardId: selectedBoardCard.card.id, x, y, rotation: selectedCard.rotation, to: destination },
                                                            "click selected stolen module to board"
                                                        );
                                                    } else if (selectedHandCard && selectedCard) {
                                                        const fromElement = handCardRefs.current.get(selectedHandCard.id);
                                                        const from = fromElement ? rectCenter(fromElement.getBoundingClientRect()) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                                                        moveHandCard(
                                                            selectedHandCard,
                                                            from,
                                                            { type: "boardCard", cardId: selectedHandCard.id, x, y, rotation: selectedCard.rotation, to: destination },
                                                            "click selected module to board"
                                                        );
                                                    }
                                                }}
                                                onClearSelected={clearSelectedCard}
                                                onDropCard={(event, x, y, rotation, destination) => {
                                                    if (!isViewer) return;
                                                    const cardId = event.dataTransfer.getData("cardId");
                                                    if (draggingSource === "board") {
                                                        const boardCard = findBoardCard(cardId, dragStateRef.current?.boardPlayerIndex);
                                                        if (boardCard?.card.type === "module") {
                                                            const from = draggedCardCenter(event);
                                                            moveBoardCard(
                                                                dragStateRef.current?.boardPlayerIndex ?? playerIndex,
                                                                boardCard,
                                                                from,
                                                                { type: "boardCard", cardId, x, y, rotation, to: destination },
                                                                "drop stolen module to board"
                                                            );
                                                        }
                                                    } else {
                                                        const card = hand.find((candidate) => candidate.id === cardId);
                                                        if (card?.type === "module") {
                                                            const from = draggedCardCenter(event);
                                                            moveHandCard(
                                                                card,
                                                                from,
                                                                { type: "boardCard", cardId, x, y, rotation, to: destination },
                                                                "drop hand module to board"
                                                            );
                                                        }
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
                        </div>
                        <iframe
                            className="lunar-rulebook-viewer"
                            title="Lunar Base rulebook"
                            src={lunarBaseRulebookPdfUrl}
                        />
                    </div>
                </section>
                <aside className="lunar-player-port" aria-label="Players">
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
                            players={players}
                            bots={[]}
                            seatedPlayers={seatedPlayers}
                            currentUserId={currentUserId}
                            canCurrentUserTakeSecondSeat={false}
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
            {showEndGameModal ? createPortal(
                <EndGameModal game={game} onClose={() => setDismissedEndGameVersion(game.version)} />,
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
