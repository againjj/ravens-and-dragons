import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { createAuthSession, createGameView, createSession } from "./fixtures.js";

const {
    deleteLocalAccountRequestMock,
    fetchAuthSessionMock,
    fetchLocalProfileMock,
    loginAsGuestMock,
    loginRequestMock,
    logoutRequestMock,
    signupRequestMock,
    updateLocalProfileRequestMock,
    fetchGameViewMock
} = vi.hoisted(() => ({
    deleteLocalAccountRequestMock: vi.fn(),
    fetchAuthSessionMock: vi.fn(),
    fetchLocalProfileMock: vi.fn(),
    loginAsGuestMock: vi.fn(),
    loginRequestMock: vi.fn(),
    logoutRequestMock: vi.fn(),
    signupRequestMock: vi.fn(),
    updateLocalProfileRequestMock: vi.fn(),
    fetchGameViewMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    deleteLocalAccountRequest: deleteLocalAccountRequestMock,
    fetchAuthSession: fetchAuthSessionMock,
    fetchLocalProfile: fetchLocalProfileMock,
    loginAsGuest: loginAsGuestMock,
    loginRequest: loginRequestMock,
    logoutRequest: logoutRequestMock,
    signupRequest: signupRequestMock,
    updateLocalProfileRequest: updateLocalProfileRequestMock,
    fetchGameView: fetchGameViewMock
}));

import { continueAsGuest, deleteLocalAccount, loadAuthSession, loadLocalProfile, login, logout, signup, updateLocalProfile } from "../../main/frontend/features/auth/authThunks.js";

describe("authThunks", () => {
    beforeEach(() => {
        deleteLocalAccountRequestMock.mockReset();
        fetchAuthSessionMock.mockReset();
        fetchLocalProfileMock.mockReset();
        loginAsGuestMock.mockReset();
        loginRequestMock.mockReset();
        logoutRequestMock.mockReset();
        signupRequestMock.mockReset();
        updateLocalProfileRequestMock.mockReset();
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
            },
            oauthProviders: ["google"]
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
            auth: {
                session: {
                    authenticated: false,
                    user: null,
                    oauthProviders: ["google"]
                }
            },
            game: {
                view: "game",
                currentGameId: "game-101",
                session: createSession({ id: "game-101" })
            }
        });

        await store.dispatch(continueAsGuest());

        expect(store.getState().auth.session.user?.authType).toBe("guest");
        expect(store.getState().auth.session.oauthProviders).toEqual(["google"]);
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

        await store.dispatch(logout());

        expect(store.getState().auth.session.authenticated).toBe(false);
        expect(store.getState().auth.session.user).toBeNull();
        expect(store.getState().auth.session.oauthProviders).toEqual([]);
        expect(fetchGameViewMock).not.toHaveBeenCalled();
    });

    test("logout preserves the configured oauth providers for the signed-out screen", async () => {
        logoutRequestMock.mockResolvedValue(undefined);
        const store = createAppStore({
            auth: {
                session: createAuthSession({
                    oauthProviders: ["google"]
                })
            }
        });

        await store.dispatch(logout());

        expect(store.getState().auth.session.oauthProviders).toEqual(["google"]);
    });

    test("loadLocalProfile stores the local profile details", async () => {
        fetchLocalProfileMock.mockResolvedValue({
            id: "player-dragons",
            username: "player-dragons",
            displayName: "Dragon Player"
        });
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            }
        });

        await store.dispatch(loadLocalProfile());

        expect(store.getState().auth.profile?.username).toBe("player-dragons");
        expect(store.getState().auth.profileLoadState).toBe("ready");
    });

    test("updateLocalProfile syncs the auth session and cached profile", async () => {
        updateLocalProfileRequestMock.mockResolvedValue(
            createAuthSession({
                user: {
                    id: "player-dragons",
                    displayName: "Renamed Player",
                    authType: "local"
                }
            })
        );
        const store = createAppStore({
            auth: {
                session: createAuthSession(),
                profile: {
                    id: "player-dragons",
                    username: "player-dragons",
                    displayName: "Dragon Player"
                },
                profileLoadState: "ready"
            },
            game: {
                view: "game",
                currentGameId: "game-101",
                session: createSession({ id: "game-101" })
            }
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView({ id: "game-101" }, {}, {
                currentUser: {
                    id: "player-dragons",
                    displayName: "Renamed Player",
                    authType: "local"
                }
            })
        );

        await store.dispatch(updateLocalProfile({ displayName: "Renamed Player" }));

        expect(store.getState().auth.session.user?.displayName).toBe("Renamed Player");
        expect(store.getState().auth.profile?.displayName).toBe("Renamed Player");
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-101");
    });

    test("deleteLocalAccount signs the browser out", async () => {
        deleteLocalAccountRequestMock.mockResolvedValue(undefined);
        const store = createAppStore({
            auth: {
                session: createAuthSession({
                    oauthProviders: ["google"]
                }),
                profile: {
                    id: "player-dragons",
                    username: "player-dragons",
                    displayName: "Dragon Player"
                },
                profileLoadState: "ready"
            }
        });

        await store.dispatch(deleteLocalAccount({ password: "password123" }));

        expect(store.getState().auth.session.authenticated).toBe(false);
        expect(store.getState().auth.session.oauthProviders).toEqual(["google"]);
        expect(store.getState().auth.profile).toBeNull();
    });
});
