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
        throw new Error("Unable to load your games.");
    }
    const payload = await response.json() as unknown;
    return Array.isArray(payload) ? payload as PlayerGameListing[] : [];
};

export const openPlayerGamesStream = (
    onUpdate: (games: PlayerGameListing[]) => void,
    createEventSource: EventSourceFactory = (url) => new EventSource(url)
): (() => void) => {
    const stream = createEventSource("/api/games/mine/stream");
    stream.addEventListener("player-games", (event) => {
        const payload = JSON.parse(event.data) as unknown;
        onUpdate(Array.isArray(payload) ? payload as PlayerGameListing[] : []);
    });
    stream.onerror = () => undefined;
    return () => {
        stream.close();
    };
};
