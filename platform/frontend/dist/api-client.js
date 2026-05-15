export const defaultCommandErrorMessage = "Unable to apply that action right now.";

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
        throw new Error(`Failed to load auth session: ${response.status}`);
    }

    return parseJson(response);
};

export const fetchUsers = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/users");
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
    }

    return parseJson(response);
};

export const loginAsGuest = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/guest", {
        method: "POST"
    });
    if (!response.ok) {
        throw new Error(`Failed to continue as guest: ${response.status}`);
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
        throw new Error(await parseErrorMessage(response));
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
        throw new Error(await parseErrorMessage(response));
    }

    return parseJson(response);
};

export const logoutRequest = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/logout", {
        method: "POST"
    });
    if (!response.ok) {
        throw new Error(`Failed to log out: ${response.status}`);
    }
};

export const fetchLocalProfile = async (fetchImpl = fetch) => {
    const response = await fetchImpl("/api/auth/profile");
    if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
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
        throw new Error(await parseErrorMessage(response));
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
        throw new Error(await parseErrorMessage(response));
    }
};
