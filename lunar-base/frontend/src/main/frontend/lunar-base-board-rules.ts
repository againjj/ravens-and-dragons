import { cardWidth, gridSquare, connectorPositions } from "./lunar-base-constants";
import { canPlayCard } from "./lunar-base-game-logic";
import type { CardRotation, LunarBaseBoardCard, LunarBaseCard, LunarBaseColorName, LunarBasePlayer, Orientation } from "./lunar-base-types";

const cardRotations: CardRotation[] = [0, 90, 180, 270];

export const normalizeRotation = (rotation: number): CardRotation =>
    (rotation % 360 === 90 ? 90 : rotation % 360 === 180 ? 180 : rotation % 360 === 270 ? 270 : 0);

export const nextRotation = (rotation: CardRotation): CardRotation =>
    (rotation === 0 ? 90 : rotation === 90 ? 180 : rotation === 180 ? 270 : 0);

export const boardCardRectAtPoint = (point: { x: number; y: number }, rotation: CardRotation | undefined, zoom: number): DOMRect => {
    const isHorizontal = rotation === 90 || rotation === 270;
    const width = (isHorizontal ? cardWidth * 2 : cardWidth) * zoom;
    const height = (isHorizontal ? cardWidth : cardWidth * 2) * zoom;
    return new DOMRect(point.x - width / 2, point.y - height / 2, width, height);
};

export const rotationToOrientation = (rotation: CardRotation): Orientation =>
    rotation === 90 || rotation === 270 ? "horizontal" : "vertical";

export const coveredCells = (card: LunarBaseBoardCard): Array<[number, number]> =>
    rotationToOrientation(card.rotation) === "horizontal" ? [[card.x, card.y], [card.x + 1, card.y]] : [[card.x, card.y], [card.x, card.y + 1]];

export const boardBounds = (cards: LunarBaseBoardCard[]) => {
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

export const legalPlacement = (board: LunarBaseBoardCard[], card: LunarBaseCard, x: number, y: number, rotation: CardRotation): boolean => {
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

export const hasLegalPlacement = (board: LunarBaseBoardCard[], card: LunarBaseCard): boolean => {
    const bounds = boardBounds(board);
    for (const rotation of cardRotations) {
        for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
            for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
                if (legalPlacement(board, card, x, y, rotation)) return true;
            }
        }
    }
    return false;
};

export const canPlayHandCard = (card: LunarBaseCard, player: LunarBasePlayer): boolean => {
    if (card.type === "module") return canPlayCard(card, player) && hasLegalPlacement(player.board, card);
    if (card.type === "agent") return canPlayCard(card, player);
    if (card.type === "influence") return true;
    return false;
};

export const snapFromPoint = (
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

export const boardCardCenter = (
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
    const centerX = ((x - bounds.minX) * gridSquare + (isHorizontal ? cardWidth : cardWidth / 2)) * zoom;
    const centerY = ((y - bounds.minY) * gridSquare + (isHorizontal ? cardWidth / 2 : cardWidth)) * zoom;
    return { x: rect.left + centerX, y: rect.top + centerY };
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

const connectorLocalPoint = (position: string): [number, number] => {
    switch (position) {
        case "top": return [0, -1];
        case "topLeft": return [-0.5, -0.5];
        case "topRight": return [0.5, -0.5];
        case "bottomLeft": return [-0.5, 0.5];
        case "bottomRight": return [0.5, 0.5];
        case "bottom": return [0, 1];
        default: return [0, 0];
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
