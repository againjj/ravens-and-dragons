import { type CSSProperties, type DragEvent, type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    createResponseError,
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
import "./lunar-base.css";

type CardType = "station" | "module" | "agent" | "influence";
type Orientation = "vertical" | "horizontal";
type CardRotation = 0 | 90 | 180 | 270;

interface LunarBaseCard {
    id: string;
    number: number;
    type: CardType;
}

interface LunarBaseSeat {
    userId: string | null;
    displayName: string | null;
}

interface LunarBaseBoardCard {
    card: LunarBaseCard;
    x: number;
    y: number;
    rotation: CardRotation;
}

interface LunarBasePlayer {
    orbs: { red: number; blue: number; yellow: number; gray: number };
    credits: number;
    colonists: number;
    achievements: number;
    handCount: number;
    influenceHandCount: number;
    board: LunarBaseBoardCard[];
}

interface LunarBaseGame {
    id: string;
    gameSlug: "lunar-base";
    version: number;
    lifecycle: "active" | "finished";
    config: { playerCount: number; useInfluences: boolean };
    seats: LunarBaseSeat[];
    currentPlayerIndex: number;
    players: LunarBasePlayer[];
    supply: Array<LunarBaseCard | null>;
    stockCount: number;
    discardTop: LunarBaseCard | null;
    discardCount: number;
    message: string | null;
    viewer?: {
        userId: string | null;
        seatIndex: number | null;
        hand: LunarBaseCard[];
    };
}

interface CreateGameResponse {
    game: LunarBaseGame;
}

interface FlyingCard {
    key: number;
    annotation: string;
    card: LunarBaseCard | null;
    faceDown?: boolean;
    rotation?: CardRotation;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

type DragSource = "hand" | "stock";
type AnimationDestination =
    | { type: "viewerHandEnd" }
    | { type: "handCard"; cardId: string }
    | { type: "discard" }
    | { type: "boardCard"; cardId: string };
interface CardMovementAnimation {
    annotation: string;
    card: LunarBaseCard | null;
    faceDown?: boolean;
    rotation?: CardRotation;
    fromX: number;
    fromY: number;
    destination: AnimationDestination;
}
interface SelectedCard {
    cardId: string;
    rotation: CardRotation;
    visualRotation: number;
}

const playRoutePattern = /^\/g\/([^/]+)$/;
const emptyLifecycle = () => undefined;
const cardWidth = 84;
const gridSquare = cardWidth;
const minZoom = 0.45;
const maxZoom = 1.4;
const portalRoot = () => document.fullscreenElement ?? document.body;
const rectCenter = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const layoutAnimationSelector = "[data-lunar-animate]";

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

const normalizeRotation = (rotation: number): CardRotation =>
    (rotation % 360 === 90 ? 90 : rotation % 360 === 180 ? 180 : rotation % 360 === 270 ? 270 : 0);

const nextRotation = (rotation: CardRotation): CardRotation =>
    (rotation === 0 ? 90 : rotation === 90 ? 180 : rotation === 180 ? 270 : 0);

const rotationToOrientation = (rotation: CardRotation): Orientation =>
    rotation === 90 || rotation === 270 ? "horizontal" : "vertical";

const isDiscardableFromHand = (card: LunarBaseCard | null | undefined): card is LunarBaseCard =>
    card?.type === "agent" || card?.type === "influence";

const readGameIdFromLocation = (): string | null => {
    const routeGameId = window.location.pathname.match(playRoutePattern)?.[1] ?? null;
    return routeGameId ? decodeURIComponent(routeGameId) : null;
};

const fetchLunarBaseGame = async (gameId: string): Promise<LunarBaseGame> => {
    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/view`);
    if (!response.ok) {
        throw await createResponseError(response, `Unable to load game "${gameId}".`);
    }
    const game = await response.json() as LunarBaseGame;
    if (game.gameSlug !== "lunar-base") {
        throw new Error(`Game "${gameId}" is not a Lunar Base game.`);
    }
    return game;
};

const createLunarBaseGame = async (options: GameStartOptions = {}): Promise<LunarBaseGame> => {
    const response = await fetch("/api/games/lunar-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publiclyListed: options.publiclyListed ?? true,
            playerCount: options.playerCount ?? 2,
            useInfluences: options.useInfluences ?? false
        })
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to start Lunar Base right now.");
    }
    const payload = await response.json() as CreateGameResponse;
    return payload.game;
};

const sendCommand = async (game: LunarBaseGame, command: Record<string, unknown>): Promise<LunarBaseGame> => {
    const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, expectedVersion: game.version })
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to update Lunar Base right now.");
    }
    return fetchLunarBaseGame(game.id);
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

const CardView = ({
    card,
    faceDown = false,
    selected = false,
    rotation = 0,
    visualRotation = rotation,
    empty = false
}: {
    card: LunarBaseCard | null;
    faceDown?: boolean;
    selected?: boolean;
    rotation?: CardRotation;
    visualRotation?: number;
    empty?: boolean;
}) => (
    <div className={[
        "lunar-card",
        faceDown ? "is-back" : "",
        selected ? "is-selected" : "",
        empty ? "is-empty" : ""
    ].filter(Boolean).join(" ")} style={{ "--lunar-card-rotation": `${visualRotation}deg` } as CSSProperties}>
        {faceDown || empty || !card ? null : (
            <>
                <span className="lunar-card-number">{card.number}</span>
                <span className="lunar-card-type">{card.type}</span>
            </>
        )}
    </div>
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
            <p>Orbs: red {player.orbs.red}, blue {player.orbs.blue}, yellow {player.orbs.yellow}, gray {player.orbs.gray}</p>
            <p>Credits: {player.credits}/20</p>
            <p>Colonists: {player.colonists}/10</p>
            <p>Achievements: {player.achievements}/5</p>
            {isCurrentUser ? <p>Influences in hand: {player.influenceHandCount}/4</p> : null}
        </section>
    );
};

const coveredCells = (card: LunarBaseBoardCard): Array<[number, number]> =>
    rotationToOrientation(card.rotation) === "horizontal" ? [[card.x, card.y], [card.x + 1, card.y]] : [[card.x, card.y], [card.x, card.y + 1]];

const boardBounds = (cards: LunarBaseBoardCard[]) => {
    const cells = cards.flatMap(coveredCells);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    return {
        minX: Math.min(...xs, 0) - 1,
        maxX: Math.max(...xs, 1) + 1,
        minY: Math.min(...ys, 0) - 1,
        maxY: Math.max(...ys, 1) + 1
    };
};

const legalPlacement = (board: LunarBaseBoardCard[], x: number, y: number, orientation: Orientation): boolean => {
    const occupied = new Set(board.flatMap(coveredCells).map(([cx, cy]) => `${cx}:${cy}`));
    const cells = orientation === "horizontal" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    if (cells.some(([cx, cy]) => occupied.has(`${cx}:${cy}`))) {
        return false;
    }
    return cells.some(([cx, cy]) => [
        `${cx - 1}:${cy}`,
        `${cx + 1}:${cy}`,
        `${cx}:${cy - 1}`,
        `${cx}:${cy + 1}`
    ].some((key) => occupied.has(key)));
};

const snapFromPoint = (
    board: LunarBaseBoardCard[],
    bounds: ReturnType<typeof boardBounds>,
    clientX: number,
    clientY: number,
    orientation: Orientation,
    element: HTMLElement | null,
    zoom: number
) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const localX = (clientX - rect.left) / zoom;
    const localY = (clientY - rect.top) / zoom;
    const gridX = Math.floor(localX / gridSquare) + bounds.minX;
    const gridY = Math.floor(localY / gridSquare) + bounds.minY;
    const inCellX = localX % gridSquare;
    const inCellY = localY % gridSquare;
    const candidates = orientation === "vertical"
        ? [{ x: gridX, y: gridY - 1 }, { x: gridX, y: gridY }]
        : [{ x: gridX - 1, y: gridY }, { x: gridX, y: gridY }];
    const legalCandidates = candidates.filter((candidate) => legalPlacement(board, candidate.x, candidate.y, orientation));
    if (legalCandidates.length === 1) {
        return legalCandidates[0];
    }
    if (legalCandidates.length === 2) {
        return orientation === "vertical"
            ? legalCandidates[inCellY < gridSquare / 2 ? 0 : 1]
            : legalCandidates[inCellX < gridSquare / 2 ? 0 : 1];
    }
    return null;
};

const setScaledDragImage = (event: DragEvent<HTMLElement>, zoom: number, rotation: CardRotation = 0) => {
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

const PlayerBoard = ({
    board,
    selected,
    zoom,
    canAcceptDrag,
    draggedRotation,
    onPlaySelected,
    onClearSelected,
    onDropCard,
    onBoardCardRef
}: {
    board: LunarBaseBoardCard[];
    selected: { rotation: CardRotation } | null;
    zoom: number;
    canAcceptDrag: boolean;
    draggedRotation: CardRotation | null;
    onPlaySelected: (x: number, y: number) => void;
    onClearSelected: () => void;
    onDropCard: (event: DragEvent<HTMLDivElement>, x: number, y: number, rotation: CardRotation) => void;
    onBoardCardRef: (cardId: string, element: HTMLElement | null) => void;
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
                const snap = snapFromPoint(board, bounds, event.clientX, event.clientY, rotationToOrientation(selected.rotation), ref.current, zoom);
                if (snap) {
                    setHover(null);
                    onPlaySelected(snap.x, snap.y);
                } else {
                    setHover(null);
                    onClearSelected();
                }
            }}
            onMouseMove={(event) => {
                if (!selected) return;
                const orientation = rotationToOrientation(selected.rotation);
                const snap = snapFromPoint(board, bounds, event.clientX, event.clientY, orientation, ref.current, zoom);
                setHover(snap ? { ...snap, rotation: selected.rotation } : null);
            }}
            onDragOver={(event) => {
                if (!canAcceptDrag) {
                    setHover(null);
                    return;
                }
                const rotation = draggedRotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation")));
                const orientation = rotationToOrientation(rotation);
                const snap = snapFromPoint(board, bounds, event.clientX, event.clientY, orientation, ref.current, zoom);
                setHover(snap ? { ...snap, rotation } : null);
                if (snap) event.preventDefault();
            }}
            onDrop={(event) => {
                if (!canAcceptDrag) {
                    setHover(null);
                    return;
                }
                const rotation = draggedRotation ?? normalizeRotation(Number(event.dataTransfer.getData("rotation")));
                const orientation = rotationToOrientation(rotation);
                const snap = snapFromPoint(board, bounds, event.clientX, event.clientY, orientation, ref.current, zoom);
                setHover(null);
                if (!snap) return;
                event.preventDefault();
                onDropCard(event, snap.x, snap.y, rotation);
            }}
            onMouseLeave={() => setHover(null)}
            onDragLeave={() => setHover(null)}
        >
            {board.map((played) => (
                <div
                    key={played.card.id}
                    data-lunar-animate={`board-${played.card.id}`}
                    data-movement="board card layout"
                    ref={(element) => onBoardCardRef(played.card.id, element)}
                    className={["lunar-board-card", rotationToOrientation(played.rotation)].join(" ")}
                    style={{
                        left: (played.x - bounds.minX) * gridSquare,
                        top: (played.y - bounds.minY) * gridSquare
                    } as CSSProperties}
                >
                    <CardView card={played.card} rotation={played.rotation} />
                </div>
            ))}
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

const LunarBasePlayScreen = () => {
    const gameId = useMemo(readGameIdFromLocation, []);
    const [game, setGame] = useState<LunarBaseGame | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
    const [players, setPlayers] = useState<AuthUserSummary[]>([]);
    const [activePickerSeat, setActivePickerSeat] = useState<number | null>(null);
    const [zoom, setZoom] = useState(() => Math.min(1, Math.max(minZoom, window.innerWidth / (cardWidth * 10 + 48))));
    const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
    const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
    const [draggingSource, setDraggingSource] = useState<DragSource | null>(null);
    const [draggingRotation, setDraggingRotation] = useState<CardRotation | null>(null);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const flyKey = useRef(0);
    const handCardRefs = useRef(new Map<string, HTMLElement>());
    const boardCardRefs = useRef(new Map<string, HTMLElement>());
    const discardRef = useRef<HTMLDivElement | null>(null);
    const handAreaRefs = useRef(new Map<number, HTMLElement>());
    const previousLayoutRects = useRef(new Map<string, DOMRect>());
    const previousHandAreaRects = useRef(new Map<number, DOMRect>());
    const previousGame = useRef<LunarBaseGame | null>(null);
    const suppressedLayoutAnimations = useRef(new Set<string>());

    const captureLayoutSnapshot = () => {
        previousLayoutRects.current = new Map(
            Array.from(document.querySelectorAll<HTMLElement>(layoutAnimationSelector)).map((element) => [element.dataset.lunarAnimate ?? "", element.getBoundingClientRect()])
        );
        previousHandAreaRects.current = handAreaRectsFromRefs(handAreaRefs.current);
    };

    const loadGame = useCallback(() => {
        if (!gameId) {
            setMessage("Game ID is missing.");
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
                            destination: { type: "boardCard", cardId: boardCard.card.id }
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
                            destination: { type: "discard" }
                        }, to.x, to.y);
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
                            destination: { type: "viewerHandEnd" }
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
                            destination: { type: "viewerHandEnd" }
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
    }, [game, zoom]);

    const destinationElement = (destination: AnimationDestination, currentGame: LunarBaseGame): HTMLElement | null => {
        if (destination.type === "discard") {
            return discardRef.current;
        }
        if (destination.type === "boardCard") {
            return boardCardRefs.current.get(destination.cardId) ?? null;
        }
        if (destination.type === "handCard") {
            return handCardRefs.current.get(destination.cardId) ?? null;
        }
        const hand = currentGame.viewer?.hand ?? [];
        const lastHandCard = hand.length > 0 ? hand[hand.length - 1] : null;
        return lastHandCard ? handCardRefs.current.get(lastHandCard.id) ?? null : null;
    };

    const runCommand = (command: Record<string, unknown>, animation?: CardMovementAnimation) => {
        if (!game || isSubmitting) return;
        setIsSubmitting(true);
        if (animation?.destination.type === "boardCard") {
            suppressedLayoutAnimations.current.add(`board-${animation.destination.cardId}`);
        }
        void sendCommand(game, command)
            .then((updated) => {
                captureLayoutSnapshot();
                setGame(updated);
                setMessage(updated.message);
                if (animation) {
                    window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(() => {
                            const destination = destinationElement(animation.destination, updated)?.getBoundingClientRect();
                            if (destination) {
                                const to = rectCenter(destination);
                                animateCard(animation, to.x, to.y);
                            }
                        });
                    });
                }
            })
            .catch((error: unknown) => handleAsyncError(error, setMessage, "Unable to update Lunar Base."))
            .finally(() => setIsSubmitting(false));
    };

    const animateCard = (animation: CardMovementAnimation, toX: number, toY: number) => {
        const next = { key: flyKey.current + 1, ...animation, toX, toY };
        flyKey.current = next.key;
        setFlyingCards((current) => [...current, next]);
        window.setTimeout(() => setFlyingCards((current) => current.filter((card) => card.key !== next.key)), 500);
    };

    if (!game) {
        return <section className="game-page lunar-page"><p>{message ?? "Loading Lunar Base..."}</p></section>;
    }

    const viewerSeat = game.viewer?.seatIndex ?? null;
    const hand = game.viewer?.hand ?? [];
    const currentUserId = currentUser?.id ?? game.viewer?.userId ?? null;
    const currentPlayerOrder = [game.currentPlayerIndex, ...game.players.map((_, index) => index).filter((index) => index !== game.currentPlayerIndex)];
    const canAct = viewerSeat === game.currentPlayerIndex && game.lifecycle === "active" && !isSubmitting;
    const selectedHandCard = selectedCard ? hand.find((card) => card.id === selectedCard.cardId) ?? null : null;
    const draggingHandCard = draggingCardId ? hand.find((card) => card.id === draggingCardId) ?? null : null;
    const supplyTopRowCount = Math.ceil(game.supply.length / 2);
    const supplyRows = [game.supply.slice(0, supplyTopRowCount), game.supply.slice(supplyTopRowCount)];

    const claimSeat = (seatIndex: number, playerUserId: string | null, displayName: string) => {
        runCommand({ type: "claimSeat", seatIndex, playerUserId: playerUserId ?? currentUserId, displayName });
        setActivePickerSeat(null);
    };

    const clickHandCard = (card: LunarBaseCard, event: MouseEvent<HTMLElement>) => {
        if (!canAct) return;
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
            { type: "discardHandCard", cardId: card.id },
            { annotation: "click hand agent/influence to discard", card, fromX: from.x, fromY: from.y, destination: { type: "discard" } }
        );
    };

    return (
        <section className="game-page lunar-page">
            <div className="lunar-game-ports">
                <section className="lunar-table-port" aria-label="Lunar Base table">
                    <div className="lunar-zoom-control">
                        <button type="button" onClick={() => setZoom((value) => Math.max(minZoom, value - 0.1))}>-</button>
                        <span>{Math.round(zoom * 100)}%</span>
                        <button type="button" onClick={() => setZoom((value) => Math.min(maxZoom, value + 0.1))}>+</button>
                    </div>
                    <div className="lunar-table-scroll">
                        <div
                            className="lunar-table-surface"
                            style={{ "--lunar-zoom": zoom } as CSSProperties}
                            onClick={() => {
                                if (selectedCard) setSelectedCard(null);
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
                                                    className="lunar-supply-slot"
                                                    disabled={!canAct || !card}
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
                                                >
                                                    {card ? (
                                                        <span data-lunar-animate={`supply-${card.id}`} data-movement="supply card layout">
                                                            <CardView card={card} />
                                                        </span>
                                                    ) : null}
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
                                        setDraggingSource("stock");
                                        setDraggingRotation(null);
                                        setScaledDragImage(event, zoom);
                                        event.dataTransfer.setData("source", "stock");
                                        event.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => {
                                        setDraggingSource(null);
                                        setDraggingRotation(null);
                                    }}
                                >
                                    <span data-lunar-animate="stock" data-movement="stock pile layout">
                                        <CardView card={null} faceDown />
                                    </span>
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
                                        if (draggingSource === "hand" && isDiscardableFromHand(card)) {
                                            event.preventDefault();
                                        }
                                    }}
                                    onDrop={(event) => {
                                        const card = hand.find((candidate) => candidate.id === draggingCardId);
                                        if (draggingSource !== "hand" || !isDiscardableFromHand(card)) {
                                            return;
                                        }
                                        event.preventDefault();
                                        runCommand(
                                            { type: "discardHandCard", cardId: card.id },
                                            {
                                                annotation: "drop hand agent/influence to discard",
                                                card,
                                                fromX: event.clientX,
                                                fromY: event.clientY,
                                                destination: { type: "discard" }
                                            }
                                        );
                                        setDraggingCardId(null);
                                        setDraggingSource(null);
                                        setDraggingRotation(null);
                                    }}
                                >
                                    <span data-lunar-animate="discard" data-movement="discard pile layout">
                                        <CardView card={game.discardTop} empty={!game.discardTop} />
                                    </span>
                                </div>
                            </section>
                            <section className="lunar-areas">
                                {currentPlayerOrder.map((playerIndex) => {
                                    const isViewer = playerIndex === viewerSeat;
                                    const cards = isViewer ? hand : Array.from({ length: game.players[playerIndex].handCount }, (_, index) => ({ id: `back-${playerIndex}-${index}`, number: 0, type: "module" as CardType }));
                                    return (
                                        <section key={playerIndex} className="lunar-player-area">
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
                                                    if (draggingSource === "stock") event.preventDefault();
                                                }}
                                                onDrop={(event) => {
                                                    if (isViewer && draggingSource === "stock") {
                                                        event.preventDefault();
                                                        runCommand(
                                                            { type: "drawStock" },
                                                            {
                                                                annotation: "drop stock card to hand",
                                                                card: null,
                                                                faceDown: true,
                                                                fromX: event.clientX,
                                                                fromY: event.clientY,
                                                                destination: { type: "viewerHandEnd" }
                                                            }
                                                        );
                                                        setDraggingSource(null);
                                                        setDraggingRotation(null);
                                                    }
                                                }}
                                            >
                                                {cards.length === 0 ? <span className="lunar-empty-hand">Empty hand</span> : cards.map((card) => (
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
                                                            selectedCard?.cardId === card.id ? "is-selected" : ""
                                                        ].filter(Boolean).join(" ")}
                                                        disabled={!isViewer || !canAct}
                                                        draggable={isViewer && canAct}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            if (isViewer) clickHandCard(card, event);
                                                        }}
                                                        onDragStart={(event) => {
                                                            if (!isViewer) return;
                                                            setDraggingCardId(card.id);
                                                            setDraggingSource("hand");
                                                            const rotation = selectedCard?.cardId === card.id ? selectedCard.rotation : 0;
                                                            setDraggingRotation(rotation);
                                                            setScaledDragImage(event, zoom, rotation);
                                                            event.dataTransfer.setData("source", "hand");
                                                            event.dataTransfer.setData("cardId", card.id);
                                                            event.dataTransfer.setData("rotation", String(rotation));
                                                            event.dataTransfer.effectAllowed = "move";
                                                        }}
                                                        onDragEnd={() => {
                                                            setDraggingCardId(null);
                                                            setDraggingSource(null);
                                                            setDraggingRotation(null);
                                                        }}
                                                    >
                                                        <CardView
                                                            card={isViewer ? card : null}
                                                            faceDown={!isViewer}
                                                            selected={selectedCard?.cardId === card.id}
                                                            rotation={selectedCard?.cardId === card.id ? selectedCard.rotation : 0}
                                                            visualRotation={selectedCard?.cardId === card.id ? selectedCard.visualRotation : 0}
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                            <PlayerBoard
                                                board={game.players[playerIndex].board}
                                                selected={isViewer && selectedHandCard && selectedCard ? {
                                                    rotation: selectedCard.rotation
                                                } : null}
                                                zoom={zoom}
                                                canAcceptDrag={Boolean(isViewer && draggingSource === "hand" && draggingHandCard?.type === "module")}
                                                draggedRotation={draggingRotation}
                                                onBoardCardRef={(cardId, element) => {
                                                    if (element) {
                                                        boardCardRefs.current.set(cardId, element);
                                                    } else {
                                                        boardCardRefs.current.delete(cardId);
                                                    }
                                                }}
                                                onPlaySelected={(x, y) => {
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
                                                            destination: { type: "boardCard", cardId: selectedHandCard.id }
                                                        });
                                                        setSelectedCard(null);
                                                    }
                                                }}
                                                onClearSelected={() => setSelectedCard(null)}
                                                onDropCard={(event, x, y, rotation) => {
                                                    if (!isViewer) return;
                                                    const cardId = event.dataTransfer.getData("cardId");
                                                    const card = hand.find((candidate) => candidate.id === cardId);
                                                    if (card?.type === "module") {
                                                        runCommand(
                                                            { type: "playModule", cardId, x, y, rotation },
                                                            {
                                                                annotation: "drop hand module to board",
                                                                card,
                                                                rotation,
                                                                fromX: event.clientX,
                                                                fromY: event.clientY,
                                                                destination: { type: "boardCard", cardId }
                                                            }
                                                        );
                                                        setSelectedCard(null);
                                                    }
                                                    setDraggingCardId(null);
                                                    setDraggingSource(null);
                                                    setDraggingRotation(null);
                                                }}
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
                    {currentPlayerOrder.map((playerIndex) => (
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
                            players={players.filter((player) => player.id !== currentUserId)}
                            bots={[]}
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
