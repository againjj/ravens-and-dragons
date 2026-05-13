import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../../main/frontend/App.js";
import type { AppDispatch } from "../../main/frontend/app/store.js";
import { createGameView } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";
import type { GameEntry } from "@ravensanddragons/platform-frontend/game-entry";

const {
    fetchAuthSessionMock,
    createGameSessionMock,
    fetchGameViewMock,
    fetchGameMetadataMock,
    fetchLocalProfileMock,
    loginAsGuestMock,
    logoutRequestMock,
    sendGameCommandRequestMock
} = vi.hoisted(() => ({
    fetchAuthSessionMock: vi.fn(),
    createGameSessionMock: vi.fn(),
    fetchGameViewMock: vi.fn(),
    fetchGameMetadataMock: vi.fn(),
    fetchLocalProfileMock: vi.fn(),
    loginAsGuestMock: vi.fn(),
    logoutRequestMock: vi.fn(),
    sendGameCommandRequestMock: vi.fn()
}));

vi.mock("../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/game-client.js", () => ({
    createGameSession: createGameSessionMock,
    fetchGameView: fetchGameViewMock,
    sendGameCommandRequest: sendGameCommandRequestMock,
    openGameStream: vi.fn(),
    isSameServerGame: vi.fn()
}));

vi.mock("@ravensanddragons/platform-frontend/api-client", () => ({
    fetchAuthSession: fetchAuthSessionMock,
    fetchLocalProfile: fetchLocalProfileMock,
    getOAuthLoginUrl: (provider: string) => `/oauth2/authorization/${provider}`,
    loginAsGuest: loginAsGuestMock,
    loginRequest: vi.fn(),
    logoutRequest: logoutRequestMock,
    signupRequest: vi.fn()
}));

vi.mock("../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game/useGameSession.js", () => ({
    useGameSession: () => undefined
}));

vi.mock("../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/hooks/useBoardSizing.js", () => ({
    useBoardSizing: () => undefined
}));

vi.mock("@ravensanddragons/platform-frontend/hooks/useFullscreen", () => ({
    useFullscreen: () => ({
        toggleFullscreen: async () => ({ message: null })
    })
}));

const makeTestGameEntry = (
    slug: string,
    displayName: string,
    useSession: () => void
): GameEntry<AppDispatch> => ({
    identity: {
        slug,
        displayName
    },
    routes: {
        createPath: `/${slug}/create`,
        buildPlayPath: (gameId) => `/g/${encodeURIComponent(gameId)}`,
        matchPlayPath: () => null
    },
    components: {
        CreateScreen: ({ gameName }) => (
            <section>
                <h1>{gameName}</h1>
            </section>
        ),
        PlayScreen: () => (
            <section>
                <h1>{displayName} game</h1>
            </section>
        )
    },
    lifecycle: {
        useSession,
        startGame: async () => null,
        openGame: () => undefined,
        returnToLobby: () => undefined,
        enterCreateMode: () => undefined,
        clearCreateMode: () => undefined
    }
});

describe("App routing", () => {
    beforeEach(() => {
        fetchAuthSessionMock.mockReset();
        createGameSessionMock.mockReset();
        fetchGameViewMock.mockReset();
        fetchGameMetadataMock.mockReset();
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
        fetchGameMetadataMock.mockResolvedValue({
            ok: true,
            json: async () => ({ gameSlug: "ravens-and-dragons" })
        });
        vi.stubGlobal("fetch", fetchGameMetadataMock);
        window.history.pushState({}, "", "/");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
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

    test("login redirects to a Clicker game by resolving the game route before opening it", async () => {
        const user = userEvent.setup();
        const ravensOpenGame = vi.fn();
        const clickerOpenGame = vi.fn();
        const ravensGame = makeTestGameEntry("ravens-and-dragons", "Ravens and Dragons", () => undefined);
        const clickerGame = makeTestGameEntry("clicker", "Clicker", () => undefined);
        ravensGame.lifecycle.openGame = ravensOpenGame;
        clickerGame.lifecycle.openGame = clickerOpenGame;
        fetchGameMetadataMock.mockResolvedValue({
            ok: true,
            json: async () => ({ gameSlug: "clicker" })
        });
        window.history.pushState({}, "", "/g/9W5RJHQ");

        renderWithStore(<App gameEntries={[ravensGame, clickerGame]} />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");

        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });

        await user.click(screen.getByRole("button", { name: "Continue as Guest" }));

        await waitFor(() => {
            expect(clickerOpenGame).toHaveBeenCalledWith(expect.anything(), "9W5RJHQ");
        });
        expect(clickerOpenGame).toHaveBeenCalledTimes(1);
        expect(ravensOpenGame).not.toHaveBeenCalled();
        expect(window.location.pathname).toBe("/g/9W5RJHQ");
        expect(screen.getByRole("heading", { name: "Clicker game" })).toBeInTheDocument();
    });

    test("unknown game routes return to the lobby without opening the default game", async () => {
        const ravensOpenGame = vi.fn();
        const ravensGame = makeTestGameEntry("ravens-and-dragons", "Ravens and Dragons", () => undefined);
        ravensGame.lifecycle.openGame = ravensOpenGame;
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameMetadataMock.mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({ message: "Game not found." })
        });
        window.history.pushState({}, "", "/g/MISSING");

        renderWithStore(<App gameEntries={[ravensGame]} />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(window.location.pathname).toBe("/lobby");
        expect(ravensOpenGame).not.toHaveBeenCalled();
        expect(screen.queryByRole("heading", { name: "Ravens and Dragons game" })).not.toBeInTheDocument();
    });

    test("unauthenticated users loading /ravens-and-dragons/create are redirected to /login and then back after login", async () => {
        const user = userEvent.setup();
        window.history.pushState({}, "", "/ravens-and-dragons/create");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/ravens-and-dragons/create");

        await user.click(screen.getByRole("button", { name: "Continue as Guest" }));
        await waitFor(() => {
            expect(window.location.pathname).toBe("/ravens-and-dragons/create");
        });
        expect(await screen.findByRole("heading", { name: "Create game: Ravens and Dragons", level: 1 })).toBeInTheDocument();
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
        expect(screen.getByRole("heading", { name: "Ayazian Games", level: 1 })).toBeInTheDocument();
        expect(screen.getByText("Dragon Player")).toBeInTheDocument();
        expect(screen.getByText("© 2026 Johnathon Ayazian")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Lobby" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
    });

    test("logged in users loading /ravens-and-dragons/create can start a game from the draft", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        createGameSessionMock.mockResolvedValue({
            id: "game-101",
            version: 0,
            createdAt: "2026-04-05T00:00:00Z",
            updatedAt: "2026-04-05T00:00:00Z",
            lifecycle: "new",
            canUndo: false,
            undoOwnerSide: null,
            availableRuleConfigurations: [],
            selectedRuleConfigurationId: "free-play",
            selectedStartingSide: "dragons",
            selectedBoardSize: 7,
            snapshot: {
                board: {},
                boardSize: 7,
                specialSquare: "d4",
                phase: "none",
                activeSide: "dragons",
                pendingMove: null,
                turns: [],
                ruleConfigurationId: "free-play",
                positionKeys: []
            },
            gameSlug: "ravens-and-dragons"
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "game-101" }));
        window.history.pushState({}, "", "/ravens-and-dragons/create");
        const { store } = renderWithStore(<App />, {
            preloadedState: {
                createGame: {
                    isActive: true,
                    selectedRuleConfigurationId: "free-play",
                    selectedStartingSide: "dragons",
                    selectedBoardSize: 7,
                    draftBoard: {
                        a1: "dragon"
                    }
                }
            }
        });

        expect(await screen.findByRole("heading", { name: "Create game: Ravens and Dragons", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Start Game" })).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "Start Game" }));

        await screen.findByRole("heading", { name: "Game game-101" });
        expect(createGameSessionMock).toHaveBeenCalledWith("ravens-and-dragons", {
            ruleConfigurationId: "free-play",
            startingSide: "dragons",
            boardSize: 7,
            publiclyListed: true,
            board: {
                a1: "dragon"
            }
        });
        expect(store.getState().game.session?.id).toBe("game-101");
        expect(window.location.pathname).toBe("/g/game-101");
    });

    test("create game errors stay on /ravens-and-dragons/create and preserve the draft", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        createGameSessionMock.mockRejectedValue(new Error("Unable to create game."));
        window.history.pushState({}, "", "/ravens-and-dragons/create");
        const { store } = renderWithStore(<App />, {
            preloadedState: {
                createGame: {
                    isActive: true,
                    selectedRuleConfigurationId: "free-play",
                    selectedStartingSide: "dragons",
                    selectedBoardSize: 7,
                    draftBoard: {
                        a1: "dragon"
                    }
                }
            }
        });

        expect(await screen.findByRole("heading", { name: "Create game: Ravens and Dragons", level: 1 })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Start Game" }));

        expect(window.location.pathname).toBe("/ravens-and-dragons/create");
        expect(screen.getByText("Unable to create game.")).toBeInTheDocument();
        expect(store.getState().createGame.draftBoard).toMatchObject({
            a1: "dragon"
        });
        expect(store.getState().game.session).toBeNull();
        expect(store.getState().game.isSubmitting).toBe(false);
    });

    test("loading /ravens-and-dragons/create initializes the draft and leaving the route clears it", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        window.history.pushState({}, "", "/ravens-and-dragons/create");

        const { store } = renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Create game: Ravens and Dragons", level: 1 });
        expect(store.getState().createGame.isActive).toBe(true);

        window.history.pushState({}, "", "/lobby");
        window.dispatchEvent(new PopStateEvent("popstate"));

        await waitFor(() => {
            expect(store.getState().createGame.isActive).toBe(false);
        });
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

    test("opening a missing game from the lobby shows feedback without navigating", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchGameMetadataMock.mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({ message: "Game not found." })
        });
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        await user.type(screen.getByLabelText("Game ID"), "MISSING");
        await user.click(screen.getByRole("button", { name: "Open Game" }));

        expect(await screen.findByRole("dialog", { name: "Open Game Error" })).toBeInTheDocument();
        expect(screen.getByText('Unable to open game "MISSING".')).toBeInTheDocument();
        expect(window.location.pathname).toBe("/lobby");
        expect(fetchGameViewMock).not.toHaveBeenCalled();
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

    test("clicking Create Game from the lobby updates the URL to /ravens-and-dragons/create", async () => {
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

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(screen.getByLabelText("Game")).toHaveValue("ravens-and-dragons");
        await user.click(screen.getByRole("button", { name: "Create Game" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/ravens-and-dragons/create");
        });
        expect(await screen.findByRole("heading", { name: "Create game: Ravens and Dragons", level: 1 })).toBeInTheDocument();
    });

    test("selecting Clicker from the lobby opens the Clicker create route", async () => {
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

        await screen.findByRole("heading", { name: "Game Lobby" });
        await user.selectOptions(screen.getByLabelText("Game"), "clicker");
        await user.click(screen.getByRole("button", { name: "Create Game" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/clicker/create");
        });
        expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    });

    test("selecting a game with a different session lifecycle keeps the lobby mounted", async () => {
        const user = userEvent.setup();
        const statefulGame = makeTestGameEntry("stateful-game", "Stateful Game", () => {
            useState(0);
        });
        const noHookGame = makeTestGameEntry("no-hook-game", "No Hook Game", () => undefined);
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App gameEntries={[statefulGame, noHookGame]} />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(screen.getByLabelText("Game")).toHaveValue("stateful-game");
        await user.selectOptions(screen.getByLabelText("Game"), "no-hook-game");

        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
        expect(screen.getByLabelText("Game")).toHaveValue("no-hook-game");
        expect(screen.getByRole("button", { name: "Create Game" })).toBeEnabled();
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
