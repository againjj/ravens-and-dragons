import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { createAuthSession, createGameView, createSession } from "./fixtures.js";

const {
    fetchAuthSessionMock,
    loginAsGuestMock,
    loginRequestMock,
    logoutRequestMock,
    signupRequestMock,
    fetchGameViewMock
} = vi.hoisted(() => ({
    fetchAuthSessionMock: vi.fn(),
    loginAsGuestMock: vi.fn(),
    loginRequestMock: vi.fn(),
    logoutRequestMock: vi.fn(),
    signupRequestMock: vi.fn(),
    fetchGameViewMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    fetchAuthSession: fetchAuthSessionMock,
    loginAsGuest: loginAsGuestMock,
    loginRequest: loginRequestMock,
    logoutRequest: logoutRequestMock,
    signupRequest: signupRequestMock,
    fetchGameView: fetchGameViewMock
}));

import { continueAsGuest, loadAuthSession, login, logout, signup } from "../../main/frontend/features/auth/authThunks.js";

describe("authThunks", () => {
    beforeEach(() => {
        fetchAuthSessionMock.mockReset();
        loginAsGuestMock.mockReset();
        loginRequestMock.mockReset();
        logoutRequestMock.mockReset();
        signupRequestMock.mockReset();
        fetchGameViewMock.mockReset();
    });

    test("loadAuthSession stores the current user session", async () => {
        fetchAuthSessionMock.mockResolvedValue(createAuthSession());
        const store = createAppStore();

        await store.dispatch(loadAuthSession());

        expect(store.getState().auth.session.user?.displayName).toBe("Dragon Player");
    });

    test("continueAsGuest refreshes the current game view when a game is open", async () => {
        loginAsGuestMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView({ id: "game-101" }, {}, {
                currentUser: {
                    id: "guest-1",
                    displayName: "Guest 1",
                    authType: "guest"
                },
                viewerRole: "spectator"
            })
        );
        const store = createAppStore({
            game: {
                view: "game",
                currentGameId: "game-101",
                session: createSession({ id: "game-101" })
            }
        });

        await store.dispatch(continueAsGuest());

        expect(store.getState().auth.session.user?.authType).toBe("guest");
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-101");
    });

    test("login and signup update the auth session", async () => {
        loginRequestMock.mockResolvedValue(createAuthSession());
        signupRequestMock.mockResolvedValue(createAuthSession({ user: { id: "new-user", displayName: "New User", authType: "local" } }));
        const store = createAppStore();

        await store.dispatch(login({ username: "dragon", password: "password123" }));
        expect(store.getState().auth.session.user?.id).toBe("player-dragons");

        await store.dispatch(signup({ username: "new-user", password: "password123", displayName: "New User" }));
        expect(store.getState().auth.session.user?.id).toBe("new-user");
    });

    test("logout clears the auth session", async () => {
        logoutRequestMock.mockResolvedValue(undefined);
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                view: "game",
                currentGameId: "game-101",
                session: createSession({ id: "game-101" })
            }
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView({ id: "game-101" }, {}, { currentUser: null, viewerRole: "anonymous" })
        );

        await store.dispatch(logout());

        expect(store.getState().auth.session.authenticated).toBe(false);
        expect(store.getState().auth.session.user).toBeNull();
    });
});
