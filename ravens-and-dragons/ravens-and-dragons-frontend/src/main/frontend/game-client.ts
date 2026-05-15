import type {
    CreateGameRequest,
    CreateGameResponse,
    GameCommandRequest,
    GameViewResponse,
    ServerGameSession,
} from "./game-types.js";
import {
    defaultCommandErrorMessage,
    parseErrorMessage,
    parseJson
} from "@ravensanddragons/platform-frontend/api-client";
import type { EventSourceFactory, FetchLike } from "@ravensanddragons/platform-frontend/api-client";
export {
    deleteLocalAccountRequest,
    defaultCommandErrorMessage,
    fetchAuthSession,
    fetchUsers,
    fetchLocalProfile,
    getOAuthLoginUrl,
    loginAsGuest,
    loginRequest,
    logoutRequest,
    signupRequest,
    updateLocalProfileRequest
} from "@ravensanddragons/platform-frontend/api-client";

const getGameUrl = (gameId: string): string => `/api/games/${encodeURIComponent(gameId)}`;
const getCreateGameUrl = (gameSlug: string): string => `/api/games/${encodeURIComponent(gameSlug)}`;

const isGameMessageEvent = (event: Event): event is MessageEvent<string> =>
    typeof (event as MessageEvent<string>).data === "string";

export const isSameServerGame = (
    currentGame: ServerGameSession | null,
    nextGame: ServerGameSession
): boolean =>
    currentGame !== null &&
    currentGame.version === nextGame.version &&
    currentGame.updatedAt === nextGame.updatedAt;

export const createGameSession = async (
    gameSlug: string,
    request: CreateGameRequest = {},
    fetchImpl: FetchLike = fetch
): Promise<ServerGameSession> => {
    const response = await fetchImpl(getCreateGameUrl(gameSlug), {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        const errorMessage = await parseErrorMessage(response);
        throw new Error(
            errorMessage === defaultCommandErrorMessage
                ? "Unable to create a new game right now."
                : errorMessage
        );
    }

    const result = await parseJson<CreateGameResponse>(response);
    return result.game;
};

export const fetchGameSession = async (gameId: string, fetchImpl: FetchLike = fetch): Promise<ServerGameSession> => {
    const response = await fetchImpl(getGameUrl(gameId));
    if (!response.ok) {
        throw new Error(`Failed to load game: ${response.status}`);
    }

    return parseJson<ServerGameSession>(response);
};

export const fetchGameView = async (gameId: string, fetchImpl: FetchLike = fetch): Promise<GameViewResponse> => {
    const response = await fetchImpl(`${getGameUrl(gameId)}/view`);
    if (!response.ok) {
        throw new Error(`Failed to load game view: ${response.status}`);
    }

    return parseJson<GameViewResponse>(response);
};

export const sendGameCommandRequest = async (
    currentGame: ServerGameSession,
    partialCommand: Omit<GameCommandRequest, "expectedVersion">,
    fetchImpl: FetchLike = fetch
): Promise<{ game?: ServerGameSession; errorMessage?: string; status?: number }> => {
    const command: GameCommandRequest = {
        ...partialCommand,
        expectedVersion: currentGame.version
    };

    const response = await fetchImpl(`${getGameUrl(currentGame.id)}/commands`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
    });

    if (response.ok) {
        return {
            game: await parseJson<ServerGameSession>(response)
        };
    }

    if (response.status === 409) {
        const body = await parseJson<ServerGameSession | { message?: string }>(response);
        if ("id" in body && "snapshot" in body) {
            return { game: body };
        }
        return {
            errorMessage: body.message ?? defaultCommandErrorMessage,
            status: response.status
        };
    }

    return {
        errorMessage: await parseErrorMessage(response),
        status: response.status
    };
};

export const openGameStream = (
    createEventSource: EventSourceFactory,
    gameId: string,
    onGame: (game: ServerGameSession) => void,
    onOpen: () => void,
    onError: () => void
): (() => void) => {
    const eventSource = createEventSource(`${getGameUrl(gameId)}/stream`);

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
