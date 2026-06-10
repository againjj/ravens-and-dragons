import { createResponseError } from "@ravensanddragons/platform-frontend/api-client";
import type { GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";
import type { CreateGameResponse, LunarBaseGame } from "./lunar-base-types";

export const fetchLunarBaseGame = async (gameId: string): Promise<LunarBaseGame> => {
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

export const createLunarBaseGame = async (options: GameStartOptions = {}): Promise<LunarBaseGame> => {
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

export const sendCommand = async (game: LunarBaseGame, command: Record<string, unknown>): Promise<LunarBaseGame> => {
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
