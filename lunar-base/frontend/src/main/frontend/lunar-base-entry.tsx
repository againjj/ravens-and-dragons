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
type ConnectorPosition = "top" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom";

interface LunarBaseCard {
    id: string;
    type: CardType;
    name?: string;
    color?: LunarBaseColorName | null;
    cardCost?: LunarBaseColorName[];
    orbs?: LunarBaseColorName[];
    connectors?: Partial<Record<ConnectorPosition, LunarBaseColorName | null>>;
    colonists?: number;
    achievements?: number[];
    flipped?: boolean;
    stationBackName?: string | null;
    stationBackOrbs?: LunarBaseColorName[];
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
    toX?: number;
    toY?: number;
    hiddenDestinationKey?: string | null;
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
const zoomSteps = [25, 50, 65, 80, 90, 100, 110, 125, 150, 200, 250, 300, 400];
const minZoomPercent = 10;
const maxZoomPercent = 1000;
const minZoom = minZoomPercent / 100;
const maxZoom = maxZoomPercent / 100;
const portalRoot = () => document.fullscreenElement ?? document.body;
const rectCenter = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const cardGap = 8;
const layoutAnimationSelector = "[data-lunar-animate]";
const cardAnimationDurationMs = 500;
const lunarBaseColors = {
    red: { rgb: "199, 53, 63", css: "rgb(199, 53, 63)", tint: "rgb(246, 225, 227)" },
    blue: { rgb: "69, 137, 198", css: "rgb(69, 137, 198)", tint: "rgb(225, 237, 247)" },
    yellow: { rgb: "242, 186, 71", css: "rgb(242, 186, 71)", tint: "rgb(253, 245, 229)" },
    gray: { rgb: "200, 200, 200", css: "rgb(200, 200, 200)", tint: "rgb(241, 241, 241)" },
    orange: { rgb: "232, 150, 65", css: "rgb(232, 150, 65)", tint: "rgb(252, 239, 226)" }
} as const;
type LunarBaseColorName = keyof typeof lunarBaseColors;
type LunarBaseResourceColorName = Exclude<LunarBaseColorName, "orange">;
const lunarBaseResourceColorNames = ["red", "blue", "yellow", "gray"] as const;
const isLunarBaseResourceColor = (color: LunarBaseColorName): color is LunarBaseResourceColorName =>
    lunarBaseResourceColorNames.includes(color as LunarBaseResourceColorName);
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

const normalizeRotation = (rotation: number): CardRotation =>
    (rotation % 360 === 90 ? 90 : rotation % 360 === 180 ? 180 : rotation % 360 === 270 ? 270 : 0);

const nextRotation = (rotation: CardRotation): CardRotation =>
    (rotation === 0 ? 90 : rotation === 90 ? 180 : rotation === 180 ? 270 : 0);

const sanitizeZoomText = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    return digits ? `${digits}${value.trim().endsWith("%") ? "%" : ""}` : "";
};

const zoomTextToPercent = (value: string): number | null => {
    const digits = value.replace(/\D/g, "");
    return digits ? Number(digits) : null;
};

const clipZoomPercent = (value: number): number =>
    Math.min(maxZoomPercent, Math.max(minZoomPercent, value));

const zoomPercentToZoom = (value: number): number =>
    clipZoomPercent(value) / 100;

const zoomToPercent = (zoom: number): number =>
    Math.round(zoom * 100);

const nextZoomStep = (zoom: number, direction: -1 | 1): number => {
    const currentPercent = zoomToPercent(zoom);
    if (direction > 0) {
        return (zoomSteps.find((step) => step > currentPercent) ?? zoomSteps[zoomSteps.length - 1]) / 100;
    }
    return ([...zoomSteps].reverse().find((step) => step < currentPercent) ?? zoomSteps[0]) / 100;
};

const boardCardRectAtPoint = (point: { x: number; y: number }, rotation: CardRotation | undefined, zoom: number): DOMRect => {
    const isHorizontal = rotation === 90 || rotation === 270;
    const width = (isHorizontal ? cardWidth * 2 : cardWidth) * zoom;
    const height = (isHorizontal ? cardWidth : cardWidth * 2) * zoom;
    return new DOMRect(point.x - width / 2, point.y - height / 2, width, height);
};

const rotationToOrientation = (rotation: CardRotation): Orientation =>
    rotation === 90 || rotation === 270 ? "horizontal" : "vertical";

const isDiscardableFromHand = (card: LunarBaseCard | null | undefined): card is LunarBaseCard =>
    card?.type === "influence";

const isPlayableAgentFromHand = (card: LunarBaseCard | null | undefined): card is LunarBaseCard =>
    card?.type === "agent";

const cardTintColor = (card: LunarBaseCard | null): string | null => {
    if (!card) return null;
    if (card.type === "station" || card.type === "agent") return lunarBaseColors.gray.tint;
    if (card.type === "influence") return lunarBaseColors.orange.tint;
    return lunarBaseColors[card.color ?? "gray"].tint;
};

const cardDisplayName = (card: LunarBaseCard): string =>
    card.type === "station" && card.flipped ? card.stationBackName ?? card.name ?? card.type : card.name ?? card.type;

const cardDisplayOrbs = (card: LunarBaseCard): LunarBaseColorName[] =>
    card.type === "station" && card.flipped ? card.stationBackOrbs ?? [] : card.orbs ?? [];

const creditCost = (card: LunarBaseCard, orbs: LunarBasePlayer["orbs"]): number => {
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

const canPlayCard = (card: LunarBaseCard, player: LunarBasePlayer): boolean =>
    creditCost(card, player.orbs) <= player.credits;

const canPlayHandCard = (card: LunarBaseCard, player: LunarBasePlayer): boolean => {
    if (card.type === "module" || card.type === "agent") return canPlayCard(card, player);
    if (card.type === "influence") return true;
    return false;
};

const costRows = (cost: LunarBaseColorName[]): LunarBaseColorName[][] => {
    if (cost.length === 0) return [];
    const firstRowCount = Math.min(cost.length, cost.length <= 4 ? 2 : 3);
    const rows = [cost.slice(0, firstRowCount)];
    for (let index = firstRowCount; index < cost.length; index += 3) {
        rows.push(cost.slice(index, index + 3));
    }
    return rows;
};

const blackCircledNumbers = ["", "❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽", "❾", "❿", "⓫", "⓬", "⓭", "⓮", "⓯", "⓰", "⓱", "⓲", "⓳", "⓴"];

const achievementGlyph = (achievement: number): string =>
    blackCircledNumbers[achievement] ?? String(achievement);

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
    empty = false,
    instantRotation = false
}: {
    card: LunarBaseCard | null;
    faceDown?: boolean;
    selected?: boolean;
    rotation?: CardRotation;
    visualRotation?: number;
    empty?: boolean;
    instantRotation?: boolean;
}) => (
    <div className={[
        "lunar-card",
        faceDown ? "is-back" : "",
        selected ? "is-selected" : "",
        empty ? "is-empty" : "",
        instantRotation ? "is-rotation-instant" : ""
    ].filter(Boolean).join(" ")} style={{
        "--lunar-card-rotation": `${visualRotation}deg`,
        "--lunar-card-tint": cardTintColor(card) ?? undefined
    } as CSSProperties}>
        {faceDown || empty || !card ? null : (
            <>
                <CardCostView card={card} />
                <ConnectorsView card={card} />
                <span className="lunar-card-name">{cardDisplayName(card)}</span>
                <span className="lunar-card-type">{card.type}</span>
                <OrbsView card={card} />
                <CardDepictionsView card={card} />
            </>
        )}
    </div>
);

const CardCostView = ({ card }: { card: LunarBaseCard }) => {
    const cost = (card.cardCost ?? []).filter((color) => color in lunarBaseColors);
    const rows = costRows(cost);
    if (rows.length === 0) return null;
    return (
        <span className="lunar-card-cost" aria-label={`Cost: ${cost.join(", ")}`}>
            {rows.map((row, rowIndex) => (
                <span key={rowIndex} className="lunar-card-cost-row">
                    {row.map((color, index) => (
                        <span
                            key={`${color}-${rowIndex}-${index}`}
                            className="lunar-card-cost-pip"
                            style={{ "--lunar-card-cost-color": lunarBaseColors[color].css } as CSSProperties}
                            aria-hidden="true"
                        />
                    ))}
                </span>
            ))}
        </span>
    );
};

const connectorPositions: ConnectorPosition[] = ["top", "topLeft", "topRight", "bottomLeft", "bottomRight", "bottom"];

const ConnectorsView = ({ card }: { card: LunarBaseCard }) => (
    <>
        {connectorPositions.map((position) => {
            const color = card.connectors?.[position];
            if (!color || !(color in lunarBaseColors)) return null;
            return (
                <span
                    key={position}
                    className={`lunar-connector ${position}`}
                    style={{ "--lunar-connector-color": lunarBaseColors[color].css } as CSSProperties}
                    aria-hidden="true"
                />
            );
        })}
    </>
);

const OrbsView = ({ card }: { card: LunarBaseCard }) => {
    const orbs = cardDisplayOrbs(card).filter((color) => color in lunarBaseColors);
    if (orbs.length === 0) return null;
    return (
        <span className="lunar-card-orbs" aria-label={`Orbs: ${orbs.join(", ")}`}>
            {orbs.map((color, index) => (
                <span
                    key={`${color}-${index}`}
                    className="lunar-card-orb"
                    style={{ "--lunar-card-orb-color": lunarBaseColors[color].css } as CSSProperties}
                    aria-hidden="true"
                />
            ))}
        </span>
    );
};

const CardDepictionsView = ({ card }: { card: LunarBaseCard }) => {
    const colonists = Math.max(0, card.colonists ?? 0);
    const achievements = card.achievements ?? [];
    if (colonists === 0 && achievements.length === 0) return null;
    return (
        <span
            className="lunar-card-depictions"
            aria-label={[
                colonists > 0 ? `${colonists} colonist${colonists === 1 ? "" : "s"}` : null,
                achievements.length > 0 ? `achievements ${achievements.join(", ")}` : null
            ].filter(Boolean).join("; ")}
        >
            {colonists > 0 ? (
                <span className="lunar-card-colonists" style={{ "--lunar-card-depiction-color": lunarBaseColors.blue.css } as CSSProperties}>
                    {Array.from({ length: colonists }, () => "🧑‍🚀").join("")}
                </span>
            ) : null}
            {achievements.length > 0 ? (
                <span className="lunar-card-achievements" style={{ "--lunar-card-depiction-color": lunarBaseColors.red.css } as CSSProperties}>
                    {achievements.map(achievementGlyph).join("")}
                </span>
            ) : null}
        </span>
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

const legalPlacement = (board: LunarBaseBoardCard[], card: LunarBaseCard, x: number, y: number, rotation: CardRotation): boolean => {
    const orientation = rotationToOrientation(rotation);
    const occupied = new Set(board.flatMap(coveredCells).map(([cx, cy]) => `${cx}:${cy}`));
    const cells = orientation === "horizontal" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    if (cells.some(([cx, cy]) => occupied.has(`${cx}:${cy}`))) {
        return false;
    }
    const touches = cells.some(([cx, cy]) => [
        `${cx - 1}:${cy}`,
        `${cx + 1}:${cy}`,
        `${cx}:${cy - 1}`,
        `${cx}:${cy + 1}`
    ].some((key) => occupied.has(key)));
    if (!touches) return false;
    return connectorsMatch({ card, x, y, rotation }, board);
};

const connectorsMatch = (candidate: LunarBaseBoardCard, board: LunarBaseBoardCard[]): boolean => {
    const candidateCells = new Set(coveredCells(candidate).map(([x, y]) => `${x}:${y}`));
    const candidateOrbs = connectorSlots(candidate);
    let hasMatchingConnectorPair = false;
    const allTouchedEdgesMatch = board.every((existing) => {
        const existingCells = new Set(coveredCells(existing).map(([x, y]) => `${x}:${y}`));
        const existingOrbs = connectorSlots(existing);
        return Array.from(candidateCells).every((cellKey) => {
            const [x, y] = cellKey.split(":").map(Number);
            return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].every(([nx, ny]) => {
                if (!existingCells.has(`${nx}:${ny}`)) return true;
                const slot = sharedOrbSlot([x, y], [nx, ny]);
                const candidateColor = candidateOrbs.get(slot);
                const existingColor = existingOrbs.get(slot);
                if (candidateColor && existingColor && orbColorsMatch(candidateColor, existingColor)) {
                    hasMatchingConnectorPair = true;
                }
                return orbColorsMatch(candidateColor, existingColor);
            });
        });
    });
    return allTouchedEdgesMatch && hasMatchingConnectorPair;
};

const orbColorsMatch = (first: LunarBaseColorName | undefined, second: LunarBaseColorName | undefined): boolean => {
    if (!first || !second) return first === second;
    if (first === "gray" || second === "gray") return true;
    return first === second;
};

const sharedOrbSlot = ([x, y]: [number, number], [nx, ny]: [number, number]): string => {
    if (nx === x + 1) return `${(x + 1) * 2}:${y * 2 + 1}`;
    if (nx === x - 1) return `${x * 2}:${y * 2 + 1}`;
    if (ny === y + 1) return `${x * 2 + 1}:${(y + 1) * 2}`;
    return `${x * 2 + 1}:${y * 2}`;
};

const connectorLocalPoint = (position: ConnectorPosition): [number, number] => {
    switch (position) {
        case "top": return [0, -1];
        case "topLeft": return [-0.5, -0.5];
        case "topRight": return [0.5, -0.5];
        case "bottomLeft": return [-0.5, 0.5];
        case "bottomRight": return [0.5, 0.5];
        case "bottom": return [0, 1];
    }
};

const rotatePoint = ([x, y]: [number, number], rotation: CardRotation): [number, number] => {
    if (rotation === 90) return [-y, x];
    if (rotation === 180) return [-x, -y];
    if (rotation === 270) return [y, -x];
    return [x, y];
};

const connectorSlots = (boardCard: LunarBaseBoardCard): Map<string, LunarBaseColorName> => {
    const horizontal = rotationToOrientation(boardCard.rotation) === "horizontal";
    const centerX = boardCard.x + (horizontal ? 1 : 0.5);
    const centerY = boardCard.y + (horizontal ? 0.5 : 1);
    const slots = new Map<string, LunarBaseColorName>();
    connectorPositions.forEach((position) => {
        const color = boardCard.card.connectors?.[position];
        if (!color) return;
        const [localX, localY] = rotatePoint(connectorLocalPoint(position), boardCard.rotation);
        slots.set(`${Math.round((centerX + localX) * 2)}:${Math.round((centerY + localY) * 2)}`, color);
    });
    return slots;
};

const snapFromPoint = (
    board: LunarBaseBoardCard[],
    bounds: ReturnType<typeof boardBounds>,
    clientX: number,
    clientY: number,
    rotation: CardRotation,
    card: LunarBaseCard,
    element: HTMLElement | null,
    zoom: number
) => {
    if (!element) return null;
    const orientation = rotationToOrientation(rotation);
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
    const legalCandidates = candidates.filter((candidate) => legalPlacement(board, card, candidate.x, candidate.y, rotation));
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

const boardCardCenter = (
    bounds: ReturnType<typeof boardBounds>,
    x: number,
    y: number,
    rotation: CardRotation,
    element: HTMLElement | null,
    zoom: number
): { x: number; y: number } | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const isHorizontal = rotationToOrientation(rotation) === "horizontal";
    const centerX = (x - bounds.minX + (isHorizontal ? 1 : 0.5)) * gridSquare * zoom;
    const centerY = (y - bounds.minY + (isHorizontal ? 0.5 : 1)) * gridSquare * zoom;
    return { x: rect.left + centerX, y: rect.top + centerY };
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
    draggedCard,
    draggedRotation,
    onPlaySelected,
    onClearSelected,
    onDropCard,
    onBoardCardRef,
    hiddenAnimationDestinations
}: {
    board: LunarBaseBoardCard[];
    selected: { card: LunarBaseCard; rotation: CardRotation } | null;
    zoom: number;
    canAcceptDrag: boolean;
    draggedCard: LunarBaseCard | null;
    draggedRotation: CardRotation | null;
    onPlaySelected: (x: number, y: number, destination: { x: number; y: number } | null) => void;
    onClearSelected: () => void;
    onDropCard: (event: DragEvent<HTMLDivElement>, x: number, y: number, rotation: CardRotation, destination: { x: number; y: number } | null) => void;
    onBoardCardRef: (cardId: string, element: HTMLElement | null) => void;
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
            {board.map((played) => (
                <div
                    key={played.card.id}
                    data-lunar-animate={`board-${played.card.id}`}
                    data-movement="board card layout"
                    ref={(element) => onBoardCardRef(played.card.id, element)}
                    className={[
                        "lunar-board-card",
                        rotationToOrientation(played.rotation),
                        hiddenAnimationDestinations.has(`board-${played.card.id}`) ? "is-animation-destination-hidden" : ""
                    ].filter(Boolean).join(" ")}
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
    const [zoomText, setZoomText] = useState(() => `${zoomToPercent(Math.min(1, Math.max(minZoom, window.innerWidth / (cardWidth * 10 + 48))))}%`);
    const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
    const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
    const [draggingSource, setDraggingSource] = useState<DragSource | null>(null);
    const [draggingRotation, setDraggingRotation] = useState<CardRotation | null>(null);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const [hiddenAnimationDestinations, setHiddenAnimationDestinations] = useState<Set<string>>(() => new Set());
    const [discardAnimationPlaceholder, setDiscardAnimationPlaceholder] = useState<LunarBaseCard | null>(null);
    const [instantRotationCardIds, setInstantRotationCardIds] = useState<Set<string>>(() => new Set());
    const flyKey = useRef(0);
    const tableScrollRef = useRef<HTMLDivElement | null>(null);
    const handCardRefs = useRef(new Map<string, HTMLElement>());
    const boardCardRefs = useRef(new Map<string, HTMLElement>());
    const discardRef = useRef<HTMLDivElement | null>(null);
    const handAreaRefs = useRef(new Map<number, HTMLElement>());
    const previousLayoutRects = useRef(new Map<string, DOMRect>());
    const previousHandAreaRects = useRef(new Map<number, DOMRect>());
    const previousGame = useRef<LunarBaseGame | null>(null);
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
    const currentPlayerOrder = [game.currentPlayerIndex, ...game.players.map((_, index) => index).filter((index) => index !== game.currentPlayerIndex)];
    const canAct = viewerSeat === game.currentPlayerIndex && game.lifecycle === "active" && !isSubmitting;
    const selectedHandCard = selectedCard ? hand.find((card) => card.id === selectedCard.cardId) ?? null : null;
    const draggingHandCard = draggingCardId ? hand.find((card) => card.id === draggingCardId) ?? null : null;
    const viewerPlayer = viewerSeat === null ? null : game.players[viewerSeat] ?? null;
    const selectedPlayableModule = selectedHandCard && selectedCard && viewerPlayer && selectedHandCard.type === "module" && canPlayCard(selectedHandCard, viewerPlayer)
        ? { card: selectedHandCard, rotation: selectedCard.rotation }
        : null;
    const draggedPlayableModule = draggingHandCard && viewerPlayer && draggingHandCard.type === "module" && canPlayCard(draggingHandCard, viewerPlayer)
        ? draggingHandCard
        : null;
    const supplyTopRowCount = Math.ceil(game.supply.length / 2);
    const supplyRows = [game.supply.slice(0, supplyTopRowCount), game.supply.slice(supplyTopRowCount)];
    const animationHiddenClass = (key: string) => hiddenAnimationDestinations.has(key) ? "is-animation-destination-hidden" : "";
    const displayedDiscardTop = hiddenAnimationDestinations.has("discard") ? discardAnimationPlaceholder : game.discardTop;

    const claimSeat = (seatIndex: number, playerUserId: string | null, displayName: string) => {
        runCommand({ type: "claimSeat", seatIndex, playerUserId: playerUserId ?? currentUserId, displayName });
        setActivePickerSeat(null);
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

    return (
        <section className="game-page lunar-page">
            <div className="lunar-game-ports">
                <section className="lunar-table-port" aria-label="Lunar Base table">
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
                                                        <span
                                                            data-lunar-animate={`supply-${card.id}`}
                                                            data-movement="supply card layout"
                                                            className={animationHiddenClass(`supply-${card.id}`)}
                                                        >
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
                                        <CardView card={null} faceDown={game.stockCount > 0} empty={game.stockCount === 0} />
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
                                        runCommand(
                                            { type: card.type === "agent" ? "playAgent" : "discardHandCard", cardId: card.id },
                                            {
                                                annotation: card.type === "agent" ? "drop hand agent to play" : "drop hand influence to discard",
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
                                    <span
                                        data-lunar-animate="discard"
                                        data-movement="discard pile layout"
                                    >
                                        <CardView card={displayedDiscardTop} empty={!displayedDiscardTop} />
                                    </span>
                                </div>
                            </section>
                            <section className="lunar-areas">
                                {currentPlayerOrder.map((playerIndex) => {
                                    const isViewer = playerIndex === viewerSeat;
                                    const cards = isViewer ? hand : Array.from({ length: game.players[playerIndex].handCount }, (_, index) => ({ id: `back-${playerIndex}-${index}`, type: "module" as CardType }));
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
                                                                instantRotation={instantRotationCardIds.has(card.id)}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <PlayerBoard
                                                board={game.players[playerIndex].board}
                                                selected={isViewer ? selectedPlayableModule : null}
                                                zoom={zoom}
                                                canAcceptDrag={Boolean(isViewer && draggingSource === "hand" && draggedPlayableModule)}
                                                draggedCard={isViewer ? draggedPlayableModule : null}
                                                draggedRotation={draggingRotation}
                                                onBoardCardRef={(cardId, element) => {
                                                    if (element) {
                                                        boardCardRefs.current.set(cardId, element);
                                                    } else {
                                                        boardCardRefs.current.delete(cardId);
                                                    }
                                                }}
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
                                                        runCommand(
                                                            { type: "playModule", cardId, x, y, rotation },
                                                            {
                                                                annotation: "drop hand module to board",
                                                                card,
                                                                rotation,
                                                                fromX: event.clientX,
                                                                fromY: event.clientY,
                                                                destination: { type: "boardCard", cardId },
                                                                toX: destination?.x,
                                                                toY: destination?.y
                                                            }
                                                        );
                                                        setSelectedCard(null);
                                                    }
                                                    setDraggingCardId(null);
                                                    setDraggingSource(null);
                                                    setDraggingRotation(null);
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
