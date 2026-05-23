import { createResponseError } from "@ravensanddragons/platform-frontend/api-client";

export interface PlayerGameListing {
    gameId: string;
    gameSlug: string;
    gameName: string;
    isCurrentUserTurn: boolean;
}

export interface EventSourceLike {
    addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
    close(): void;
    onerror: ((event: Event) => void) | null;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export const fetchPlayerGames = async (): Promise<PlayerGameListing[]> => {
    const response = await fetch("/api/games/mine");
    if (!response.ok) {
        throw await createResponseError(response, "Unable to load your games.");
    }
    const payload = await response.json() as unknown;
    return Array.isArray(payload) ? payload as PlayerGameListing[] : [];
};

export const openPlayerGamesStream = (
    onUpdate: (games: PlayerGameListing[]) => void,
    onError: () => void = () => undefined,
    createEventSource: EventSourceFactory = (url) => new EventSource(url)
): (() => void) => {
    const stream = createEventSource("/api/games/mine/stream");
    let isClosed = false;
    const closeStream = () => {
        if (!isClosed) {
            isClosed = true;
            stream.close();
        }
    };
    stream.addEventListener("player-games", (event) => {
        const payload = JSON.parse(event.data) as unknown;
        onUpdate(Array.isArray(payload) ? payload as PlayerGameListing[] : []);
    });
    stream.onerror = () => {
        onError();
        closeStream();
    };
    return closeStream;
};
