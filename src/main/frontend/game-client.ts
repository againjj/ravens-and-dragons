import type { GameCommandRequest, ServerGameSession } from "./game.js";

export interface ErrorMessage {
    message?: string;
}

export interface EventSourceLike {
    addEventListener(type: string, listener: (event: Event) => void): void;
    close(): void;
    onopen: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
}

export type FetchLike = typeof fetch;
export type EventSourceFactory = (url: string) => EventSourceLike;
export const defaultCommandErrorMessage = "Unable to apply that action right now.";

const parseJson = async <T>(response: { json(): Promise<unknown> }): Promise<T> =>
    await response.json() as T;

const parseErrorMessage = async (response: { json(): Promise<unknown> }): Promise<string> => {
    const error = await response.json().catch(() => null) as ErrorMessage | null;
    return error?.message ?? defaultCommandErrorMessage;
};

const isGameMessageEvent = (event: Event): event is MessageEvent<string> =>
    typeof (event as MessageEvent<string>).data === "string";

export const isSameServerGame = (
    currentGame: ServerGameSession | null,
    nextGame: ServerGameSession
): boolean =>
    currentGame !== null &&
    currentGame.version === nextGame.version &&
    currentGame.updatedAt === nextGame.updatedAt;

export const fetchGameSession = async (fetchImpl: FetchLike = fetch): Promise<ServerGameSession> => {
    const response = await fetchImpl("/api/game");
    if (!response.ok) {
        throw new Error(`Failed to load game: ${response.status}`);
    }

    return parseJson<ServerGameSession>(response);
};

export const sendGameCommandRequest = async (
    currentGame: ServerGameSession,
    partialCommand: Omit<GameCommandRequest, "expectedVersion">,
    fetchImpl: FetchLike = fetch
): Promise<{ game?: ServerGameSession; errorMessage?: string }> => {
    const command: GameCommandRequest = {
        ...partialCommand,
        expectedVersion: currentGame.version
    };

    const response = await fetchImpl("/api/game/commands", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
    });

    if (response.ok || response.status === 409) {
        return {
            game: await parseJson<ServerGameSession>(response)
        };
    }

    return {
        errorMessage: await parseErrorMessage(response)
    };
};

export const openGameStream = (
    createEventSource: EventSourceFactory,
    onGame: (game: ServerGameSession) => void,
    onOpen: () => void,
    onError: () => void
): (() => void) => {
    const eventSource = createEventSource("/api/game/stream");

    eventSource.addEventListener("game", (event) => {
        if (!isGameMessageEvent(event)) {
            return;
        }

        onGame(JSON.parse(event.data) as ServerGameSession);
    });

    eventSource.onopen = () => {
        onOpen();
    };

    eventSource.onerror = () => {
        onError();
    };

    return () => {
        eventSource.close();
    };
};
