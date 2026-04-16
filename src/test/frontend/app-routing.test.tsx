import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../../main/frontend/App.js";
import { createGameView, createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const {
    createGameSessionMock,
    fetchAuthSessionMock,
    fetchGameViewMock,
    fetchLocalProfileMock,
    loginAsGuestMock,
    logoutRequestMock,
    sendGameCommandRequestMock
} = vi.hoisted(() => ({
    createGameSessionMock: vi.fn(),
    fetchAuthSessionMock: vi.fn(),
    fetchGameViewMock: vi.fn(),
    fetchLocalProfileMock: vi.fn(),
    loginAsGuestMock: vi.fn(),
    logoutRequestMock: vi.fn(),
    sendGameCommandRequestMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    createGameSession: createGameSessionMock,
    fetchAuthSession: fetchAuthSessionMock,
    fetchGameView: fetchGameViewMock,
    fetchLocalProfile: fetchLocalProfileMock,
    getOAuthLoginUrl: (provider: string) => `/oauth2/authorization/${provider}`,
    loginAsGuest: loginAsGuestMock,
    loginRequest: vi.fn(),
    logoutRequest: logoutRequestMock,
    sendGameCommandRequest: sendGameCommandRequestMock,
    signupRequest: vi.fn(),
    openGameStream: vi.fn(),
    isSameServerGame: vi.fn()
}));

vi.mock("../../main/frontend/features/game/useGameSession.js", () => ({
    useGameSession: () => undefined
}));

vi.mock("../../main/frontend/hooks/useBoardSizing.js", () => ({
    useBoardSizing: () => undefined
}));

vi.mock("../../main/frontend/hooks/useFullscreen.js", () => ({
    useFullscreen: () => ({
        toggleFullscreen: async () => ({ message: null })
    })
}));

describe("App routing", () => {
    beforeEach(() => {
        createGameSessionMock.mockReset();
        fetchAuthSessionMock.mockReset();
        fetchGameViewMock.mockReset();
        fetchLocalProfileMock.mockReset();
        loginAsGuestMock.mockReset();
        logoutRequestMock.mockReset();
        sendGameCommandRequestMock.mockReset();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: false,
            user: null
        });
        loginAsGuestMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        logoutRequestMock.mockResolvedValue(undefined);
        fetchLocalProfileMock.mockResolvedValue({
            id: "player-dragons",
            username: "player-dragons",
            displayName: "Dragon Player"
        });
        window.history.pushState({}, "", "/");
    });

    afterEach(() => {
        window.history.pushState({}, "", "/");
    });

    test("unauthenticated users loading a game route are redirected to /login and then back after login", async () => {
        const user = userEvent.setup();
        const pushStateSpy = vi.spyOn(window.history, "pushState");
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "CFGHJMP" }));
        window.history.pushState({}, "", "/g/CFGHJMP");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/g/CFGHJMP");

        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });

        await user.click(screen.getByRole("button", { name: "Continue as Guest" }));
        expect(fetchGameViewMock).toHaveBeenCalledWith("CFGHJMP");
        expect(window.location.pathname).toBe("/g/CFGHJMP");
        expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/g/CFGHJMP");
        pushStateSpy.mockRestore();
    });

    test("logged in users loading / are redirected to /lobby", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(window.location.pathname).toBe("/lobby");
        expect(screen.getByText("Dragon Player")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Lobby" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
    });

    test("signed out users loading / are redirected to /login with a return target", async () => {
        window.history.pushState({}, "", "/");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/");
    });

    test("opening a game from /lobby updates the URL", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "QRVWXC2" }));
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        await user.type(screen.getByLabelText("Game ID"), "QRVWXC2");
        await user.click(screen.getByRole("button", { name: "Open Game" }));

        await screen.findByRole("heading", { name: "Game QRVWXC2" });
        expect(window.location.pathname).toBe("/g/QRVWXC2");
    });

    test("back to lobby returns the app to /lobby", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game MPQRVWX" });
        await user.click(screen.getByRole("button", { name: "Lobby" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/lobby");
        });
        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
    });

    test("game header shows actions in the shared order and hides profile destination buttons only on that page", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        const { container } = renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game MPQRVWX" });

        const heroActions = container.querySelector(".hero-actions");
        const labels = Array.from(heroActions?.children ?? []).map((element) => element.textContent?.trim());
        expect(labels).toEqual(["Dragon Player", "Profile", "Lobby", "Log Out", ""]);
    });

    test("loading /lobby while signed out redirects to /login with a return target", async () => {
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/lobby");
    });

    test("loading /profile while signed out redirects to /login with a return target", async () => {
        window.history.pushState({}, "", "/profile");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/profile");
    });

    test("logging out from a game route returns the app to the login screen", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game MPQRVWX" });
        await user.click(screen.getByRole("button", { name: "Log Out" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/login");
        });
        expect(window.location.search).toBe("");
    });

    test("local users can open the profile page from the header", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Profile" });
        await user.click(screen.getByRole("button", { name: "Profile" }));

        expect(window.location.pathname).toBe("/profile");
        expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
        expect(fetchLocalProfileMock).toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Lobby" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
    });

    test("guest users do not see the profile button", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    });

    test("loading /profile as a local user opens the profile page", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        window.history.pushState({}, "", "/profile");

        renderWithStore(<App />);

        expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
        expect(fetchLocalProfileMock).toHaveBeenCalled();
    });

    test("browser back from a lobby-opened game returns to /lobby", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "QRVWXC2" }));
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        await user.type(screen.getByLabelText("Game ID"), "QRVWXC2");
        await user.click(screen.getByRole("button", { name: "Open Game" }));

        await screen.findByRole("heading", { name: "Game QRVWXC2" });

        window.history.back();
        window.dispatchEvent(new PopStateEvent("popstate"));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/lobby");
        });
        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
    });

    test("browser forward after returning to the lobby reopens the game route", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "QRVWXC2" }));
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        await user.type(screen.getByLabelText("Game ID"), "QRVWXC2");
        await user.click(screen.getByRole("button", { name: "Open Game" }));
        await screen.findByRole("heading", { name: "Game QRVWXC2" });

        window.history.back();
        window.dispatchEvent(new PopStateEvent("popstate"));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/lobby");
        });

        window.history.forward();
        window.dispatchEvent(new PopStateEvent("popstate"));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/g/QRVWXC2");
        });
        expect(fetchGameViewMock).toHaveBeenLastCalledWith("QRVWXC2");
    });
});
