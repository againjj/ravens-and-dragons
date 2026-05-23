import { describe, expect, it, vi } from "vitest";
import {
    ApiRequestError,
    authSessionExpiredEventType,
    createResponseError,
    defaultCommandErrorMessage,
    fetchAuthSession,
    getOAuthLoginUrl,
    isServerUnavailableError,
    isUnauthorizedError,
    notifyAuthSessionExpired,
    parseErrorMessage
} from "../../main/frontend/api-client";

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
    ({
        ok,
        status,
        json: async () => body
    }) as Response;

describe("platform api client", () => {
    it("parses server error messages with a fallback", async () => {
        await expect(parseErrorMessage(jsonResponse({ message: "Nope" }))).resolves.toBe("Nope");
        await expect(parseErrorMessage(jsonResponse({}, false, 500))).resolves.toBe(defaultCommandErrorMessage);

        const invalidJsonResponse = {
            json: async () => {
                throw new Error("invalid json");
            }
        };
        await expect(parseErrorMessage(invalidJsonResponse)).resolves.toBe(defaultCommandErrorMessage);
    });

    it("preserves response status on request errors", async () => {
        const error = await createResponseError(jsonResponse({ message: "Denied" }, false, 403));

        expect(error).toBeInstanceOf(ApiRequestError);
        expect(error.message).toBe("Denied");
        expect(error.status).toBe(403);
    });

    it("classifies unauthorized and server unavailable failures", () => {
        expect(isUnauthorizedError(new ApiRequestError("expired", 401))).toBe(true);
        expect(isUnauthorizedError(new ApiRequestError("nope", 403))).toBe(false);
        expect(isServerUnavailableError(new Error("Failed to fetch"))).toBe(true);
        expect(isServerUnavailableError(new ApiRequestError("Denied", 403))).toBe(false);
    });

    it("dispatches auth session expiration events", () => {
        const listener = vi.fn();
        window.addEventListener(authSessionExpiredEventType, listener);

        notifyAuthSessionExpired();

        expect(listener).toHaveBeenCalledOnce();
        window.removeEventListener(authSessionExpiredEventType, listener);
    });

    it("builds OAuth login URLs with encoded provider and next values", () => {
        expect(getOAuthLoginUrl("google")).toBe("/oauth2/authorization/google");
        expect(getOAuthLoginUrl("local provider", "/g/game 1")).toBe(
            "/oauth2/authorization/local%20provider?next=%2Fg%2Fgame+1"
        );
    });

    it("loads the auth session through the supplied fetch implementation", async () => {
        const fetchImpl = vi.fn(async () =>
            jsonResponse({
                authenticated: true,
                user: { id: "u1", displayName: "Ari", authType: "local" },
                oauthProviders: ["google"]
            })
        );

        await expect(fetchAuthSession(fetchImpl as typeof fetch)).resolves.toEqual({
            authenticated: true,
            user: { id: "u1", displayName: "Ari", authType: "local" },
            oauthProviders: ["google"]
        });
        expect(fetchImpl).toHaveBeenCalledWith("/api/auth/session");
    });
});
