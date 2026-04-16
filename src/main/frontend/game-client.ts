import type {
    AuthSessionResponse,
    ClaimSideRequest,
    CreateGameRequest,
    CreateGameResponse,
    DeleteAccountRequest,
    GameCommandRequest,
    GameViewResponse,
    LocalProfileResponse,
    LoginRequest,
    ServerGameSession,
    SignupRequest,
    UpdateProfileRequest
} from "./game-types.js";

export interface ErrorMessage {
    message?: string;
}

export interface ApiResult<T> {
    data?: T;
    errorMessage?: string;
    status?: number;
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
const getGameUrl = (gameId: string): string => `/api/games/${encodeURIComponent(gameId)}`;
export const getOAuthLoginUrl = (provider: string, nextPath?: string): string => {
    const baseUrl = `/oauth2/authorization/${encodeURIComponent(provider)}`;
    if (!nextPath) {
        return baseUrl;
    }
    const search = new URLSearchParams({ next: nextPath });
    return `${baseUrl}?${search.toString()}`;
};

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

export const createGameSession = async (
    request: CreateGameRequest = {},
    fetchImpl: FetchLike = fetch
): Promise<ServerGameSession> => {
    const response = await fetchImpl("/api/games", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw new Error(`Failed to create game: ${response.status}`);
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

export const fetchAuthSession = async (fetchImpl: FetchLike = fetch): Promise<AuthSessionResponse> => {
    const response = await fetchImpl("/api/auth/session");
    if (!response.ok) {
        throw new Error(`Failed to load auth session: ${response.status}`);
    }

    return parseJson<AuthSessionResponse>(response);
};

export const loginAsGuest = async (fetchImpl: FetchLike = fetch): Promise<AuthSessionResponse> => {
    const response = await fetchImpl("/api/auth/guest", {
        method: "POST"
    });
    if (!response.ok) {
        throw new Error(`Failed to continue as guest: ${response.status}`);
    }

    return parseJson<AuthSessionResponse>(response);
};

export const signupRequest = async (
    request: SignupRequest,
    fetchImpl: FetchLike = fetch
): Promise<AuthSessionResponse> => {
    const response = await fetchImpl("/api/auth/signup", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }

    return parseJson<AuthSessionResponse>(response);
};

export const loginRequest = async (
    request: LoginRequest,
    fetchImpl: FetchLike = fetch
): Promise<AuthSessionResponse> => {
    const response = await fetchImpl("/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }

    return parseJson<AuthSessionResponse>(response);
};

export const logoutRequest = async (fetchImpl: FetchLike = fetch): Promise<void> => {
    const response = await fetchImpl("/api/auth/logout", {
        method: "POST"
    });
    if (!response.ok) {
        throw new Error(`Failed to log out: ${response.status}`);
    }
};

export const fetchLocalProfile = async (fetchImpl: FetchLike = fetch): Promise<LocalProfileResponse> => {
    const response = await fetchImpl("/api/auth/profile");
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }

    return parseJson<LocalProfileResponse>(response);
};

export const updateLocalProfileRequest = async (
    request: UpdateProfileRequest,
    fetchImpl: FetchLike = fetch
): Promise<AuthSessionResponse> => {
    const response = await fetchImpl("/api/auth/profile", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }

    return parseJson<AuthSessionResponse>(response);
};

export const deleteLocalAccountRequest = async (
    request: DeleteAccountRequest,
    fetchImpl: FetchLike = fetch
): Promise<void> => {
    const response = await fetchImpl("/api/auth/delete-account", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }
};

export const claimGameSide = async (
    gameId: string,
    request: ClaimSideRequest,
    fetchImpl: FetchLike = fetch
): Promise<ApiResult<ServerGameSession>> => {
    const response = await fetchImpl(`${getGameUrl(gameId)}/claim-side`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (response.ok) {
        return {
            data: await parseJson<ServerGameSession>(response)
        };
    }

    return {
        errorMessage: await parseErrorMessage(response),
        status: response.status
    };
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

    if (response.ok || response.status === 409) {
        return {
            game: await parseJson<ServerGameSession>(response)
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
