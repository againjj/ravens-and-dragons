export const defaultCommandErrorMessage = "Unable to apply that action right now.";
export const serverUnavailableMessage = "The server is down. Please wait and try again later.";
export const sessionExpiredMessage = "Your session expired. Please sign in again.";
export const authSessionExpiredEventType = "ravensanddragons:auth-session-expired";
export const serverUnavailableEventType = "ravensanddragons:server-unavailable";
export class ApiRequestError extends Error {
    constructor(message, status, cause) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
        this.cause = cause;
    }
}
export const isUnauthorizedError = (error) => error instanceof ApiRequestError && error.status === 401;
export const isServerUnavailableError = (error) => error instanceof Error &&
    /failed to fetch|networkerror|network request failed|load failed/i.test(error.message);
export const notifyAuthSessionExpired = () => {
    window.dispatchEvent(new CustomEvent(authSessionExpiredEventType));
};
export const notifyServerUnavailable = () => {
    window.dispatchEvent(new CustomEvent(serverUnavailableEventType));
};
export const createResponseError = async (response, fallbackMessage = defaultCommandErrorMessage) => {
    const parsedMessage = await parseErrorMessage(response);
    return new ApiRequestError(parsedMessage === defaultCommandErrorMessage ? fallbackMessage : parsedMessage, response.status);
};
export const getOAuthLoginUrl = (provider, nextPath) => {
    const baseUrl = `/oauth2/authorization/${encodeURIComponent(provider)}`;
    if (!nextPath) {
        return baseUrl;
    }
    const search = new URLSearchParams({ next: nextPath });
    return `${baseUrl}?${search.toString()}`;
};
export const parseJson = async (response) => await response.json();
export const parseErrorMessage = async (response) => {
    const error = await response.json().catch(() => null);
    return error?.message ?? defaultCommandErrorMessage;
};
export const fetchAuthSession = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/session");
    if (!response.ok) {
        throw new ApiRequestError(`Failed to load auth session: ${response.status}`, response.status);
    }
    return parseJson(response);
};
export const fetchUsers = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/users");
    if (!response.ok) {
        throw await createResponseError(response);
    }
    return parseJson(response);
};
export const loginAsGuest = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/guest", {
        method: "POST"
    });
    if (!response.ok) {
        throw new ApiRequestError(`Failed to continue as guest: ${response.status}`, response.status);
    }
    return parseJson(response);
};
export const signupRequest = async (request, fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/signup", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw await createResponseError(response);
    }
    return parseJson(response);
};
export const loginRequest = async (request, fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw await createResponseError(response);
    }
    return parseJson(response);
};
export const logoutRequest = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/logout", {
        method: "POST"
    });
    if (!response.ok) {
        throw new ApiRequestError(`Failed to log out: ${response.status}`, response.status);
    }
};
export const fetchLocalProfile = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/profile");
    if (!response.ok) {
        throw await createResponseError(response);
    }
    return parseJson(response);
};
export const updateLocalProfileRequest = async (request, fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/profile", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw await createResponseError(response);
    }
    return parseJson(response);
};
export const deleteLocalAccountRequest = async (request, fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/delete-account", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        throw await createResponseError(response);
    }
};
