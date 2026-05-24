import { createResponseError } from "@ravensanddragons/platform-frontend/api-client";
import type { GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";
import type { CreateGameResponse, GinRummyGame } from "./gin-rummy-types";
export const playRoutePattern = /^\/g\/([^/]+)$/;
export const readGameIdFromLocation = (): string | null => { const routeGameId = window.location.pathname.match(playRoutePattern)?.[1] ?? null; return routeGameId ? decodeURIComponent(routeGameId) : null; };
export const fetchGinRummyGame = async (gameId: string): Promise<GinRummyGame> => {
    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/view`);
    if (!response.ok) {
        throw await createResponseError(response, `Unable to load game "${gameId}".`);
    }
    const game = await response.json() as GinRummyGame;
    if (game.gameSlug !== "gin-rummy") {
        throw new Error(`Game "${gameId}" is not a Gin Rummy game.`);
    }
    return game;
};

export const createGinRummyGame = async (options: GameStartOptions = {}): Promise<GinRummyGame> => {
    const response = await fetch("/api/games/gin-rummy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options)
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to start Gin Rummy right now.");
    }
    const payload = await response.json() as CreateGameResponse;
    return payload.game;
};

export const sendCommand = async (game: GinRummyGame, command: Record<string, unknown>): Promise<GinRummyGame> => {
    const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, expectedVersion: game.version })
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to update Gin Rummy right now.");
    }
    return fetchGinRummyGame(game.id);
};

