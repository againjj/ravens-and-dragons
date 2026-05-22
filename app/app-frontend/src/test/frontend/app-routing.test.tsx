import { useState } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../../main/frontend/App.js";
import type { AppDispatch } from "../../main/frontend/app/store.js";
import { authActions } from "../../main/frontend/features/auth/authSlice.js";
import { createGameView } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";
import type { GameEntry } from "@ravensanddragons/platform-frontend/game-entry";

const {
    fetchAuthSessionMock,
    createGameSessionMock,
    fetchGameViewMock,
    fetchGameMetadataMock,
    fetchLocalProfileMock,
    fetchPlayerGamesMock,
    openPlayerGamesStreamMock,
    loginAsGuestMock,
    logoutRequestMock,
    sendGameCommandRequestMock
} = vi.hoisted(() => ({
    fetchAuthSessionMock: vi.fn(),
    createGameSessionMock: vi.fn(),
    fetchGameViewMock: vi.fn(),
    fetchGameMetadataMock: vi.fn(),
    fetchLocalProfileMock: vi.fn(),
    fetchPlayerGamesMock: vi.fn(),
    openPlayerGamesStreamMock: vi.fn(),
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
    authSessionExpiredEventType: "ravensanddragons:auth-session-expired",
    serverUnavailableEventType: "ravensanddragons:server-unavailable",
    serverUnavailableMessage: "The server is down. Please wait and try again later.",
    sessionExpiredMessage: "Your session expired. Please sign in again.",
    createResponseError: async (response: Response, fallbackMessage = "Request failed.") => {
        const error = new Error(fallbackMessage) as Error & { status?: number };
        error.status = response.status;
        return error;
    },
    fetchAuthSession: fetchAuthSessionMock,
    fetchLocalProfile: fetchLocalProfileMock,
    getOAuthLoginUrl: (provider: string) => `/oauth2/authorization/${provider}`,
    isServerUnavailableError: (error: unknown) => error instanceof Error && /failed to fetch/i.test(error.message),
    isUnauthorizedError: (error: unknown) => error instanceof Error && (error as Error & { status?: number }).status === 401,
    loginAsGuest: loginAsGuestMock,
    loginRequest: vi.fn(),
    logoutRequest: logoutRequestMock,
    notifyAuthSessionExpired: () => window.dispatchEvent(new CustomEvent("ravensanddragons:auth-session-expired")),
    notifyServerUnavailable: () => window.dispatchEvent(new CustomEvent("ravensanddragons:server-unavailable")),
    signupRequest: vi.fn()
}));

vi.mock("../../main/frontend/features/playerGames/playerGamesClient.js", () => ({
    fetchPlayerGames: fetchPlayerGamesMock,
    openPlayerGamesStream: openPlayerGamesStreamMock
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
        fetchPlayerGamesMock.mockReset();
        openPlayerGamesStreamMock.mockReset();
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
        fetchPlayerGamesMock.mockResolvedValue([]);
        openPlayerGamesStreamMock.mockReturnValue(() => undefined);
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
        document.title = "Ravens and Dragons";
        window.history.pushState({}, "", "/");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.title = "";
        window.history.pushState({}, "", "/");
    });

    test("uses the app title during transient loading", async () => {
        fetchAuthSessionMock.mockReturnValue(new Promise(() => undefined));

        renderWithStore(<App />);

        await waitFor(() => {
            expect(document.title).toBe("Ayazian Games");
        });
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
        expect(document.title).toBe("Ayazian Games: Login");

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

    test("login redirects to a Tic-Tac-Toe game by resolving the game route before opening it", async () => {
        const user = userEvent.setup();
        const ravensOpenGame = vi.fn();
        const ticTacToeOpenGame = vi.fn();
        const ravensGame = makeTestGameEntry("ravens-and-dragons", "Ravens and Dragons", () => undefined);
        const ticTacToeGame = makeTestGameEntry("tic-tac-toe", "Tic-Tac-Toe", () => undefined);
        ravensGame.lifecycle.openGame = ravensOpenGame;
        ticTacToeGame.lifecycle.openGame = ticTacToeOpenGame;
        fetchGameMetadataMock.mockResolvedValue({
            ok: true,
            json: async () => ({ gameSlug: "tic-tac-toe" })
        });
        window.history.pushState({}, "", "/g/9W5RJHQ");

        renderWithStore(<App gameEntries={[ravensGame, ticTacToeGame]} />);

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
            expect(ticTacToeOpenGame).toHaveBeenCalledWith(expect.anything(), "9W5RJHQ");
        });
        expect(ticTacToeOpenGame).toHaveBeenCalledTimes(1);
        expect(ravensOpenGame).not.toHaveBeenCalled();
        expect(window.location.pathname).toBe("/g/9W5RJHQ");
        expect(screen.getByRole("heading", { name: "Tic-Tac-Toe game" })).toBeInTheDocument();
        expect(document.title).toBe("Ayazian Games: Tic-Tac-Toe (9W5RJHQ)");
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
        expect(document.title).toBe("Ayazian Games");
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
        expect(document.title).toBe("Ayazian Games: Create Ravens and Dragons");
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
        expect(document.title).toBe("Ayazian Games");
        expect(screen.getByRole("heading", { name: "Ayazian Games", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Dragon Player" })).toBeInTheDocument();
        expect(screen.getByText("© 2026 Johnathon Ayazian")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Lobby" })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
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
        expect(document.title).toBe("Ayazian Games: Ravens and Dragons (QRVWXC2)");
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
        await user.click(screen.getByRole("button", { name: "Dragon Player" }));
        await user.click(screen.getByRole("menuitem", { name: "Lobby" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/lobby");
        });
        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
    });

    test("header title returns the app to /lobby", async () => {
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
        await user.click(screen.getByRole("link", { name: "Ayazian Games" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/lobby");
        });
        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
    });

    test("game header shows actions in the shared order and hides profile destination buttons only on that page", async () => {
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

        const { container } = renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game MPQRVWX" });

        const heroActions = container.querySelector(".hero-actions");
        expect(heroActions?.children.length).toBe(2);
        expect(screen.getByRole("button", { name: "Dragon Player" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Dragon Player" }));
        expect(Array.from(screen.getAllByRole("menuitem")).map((element) => element.textContent?.trim())).toEqual([
            "Profile",
            "Lobby",
            "Log Out"
        ]);
    });

    test("user menu closes when clicking the trigger again or clicking outside", async () => {
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
        const trigger = screen.getByRole("button", { name: "Dragon Player" });

        await user.click(trigger);
        expect(screen.getByRole("menuitem", { name: "Lobby" })).toBeInTheDocument();
        await user.click(trigger);
        expect(screen.queryByRole("menuitem", { name: "Lobby" })).not.toBeInTheDocument();

        await user.click(trigger);
        expect(screen.getByRole("menuitem", { name: "Lobby" })).toBeInTheDocument();
        await user.click(document.body);
        expect(screen.queryByRole("menuitem", { name: "Lobby" })).not.toBeInTheDocument();
    });

    test("user menu lists active seated games with turn badges and bolds the current game", async () => {
        const user = userEvent.setup();
        let streamUpdate: ((games: unknown[]) => void) | null = null;
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "player-dragons",
                displayName: "Dragon Player",
                authType: "local"
            }
        });
        fetchPlayerGamesMock.mockResolvedValue([
            {
                gameId: "AAAAAAA",
                gameSlug: "ravens-and-dragons",
                gameName: "Ravens and Dragons",
                isCurrentUserTurn: true
            },
            {
                gameId: "MPQRVWX",
                gameSlug: "ravens-and-dragons",
                gameName: "Ravens and Dragons",
                isCurrentUserTurn: false
            }
        ]);
        openPlayerGamesStreamMock.mockImplementation((onUpdate: (games: unknown[]) => void) => {
            streamUpdate = onUpdate;
            return () => undefined;
        });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        const { container } = renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game MPQRVWX" });
        expect(screen.getByRole("button", { name: "Dragon Player" }).querySelector(".turn-count-badge")?.textContent).toBe("1");

        act(() => {
            streamUpdate?.([
                {
                    gameId: "AAAAAAA",
                    gameSlug: "ravens-and-dragons",
                    gameName: "Ravens and Dragons",
                    isCurrentUserTurn: false
                },
                {
                    gameId: "MPQRVWX",
                    gameSlug: "ravens-and-dragons",
                    gameName: "Ravens and Dragons",
                    isCurrentUserTurn: true
                }
            ]);
        });
        expect(screen.getByRole("button", { name: "Dragon Player" }).querySelector(".turn-count-badge")?.textContent).toBe("1");

        await user.click(screen.getByRole("button", { name: "Dragon Player" }));

        const currentGameLink = screen.getByRole("menuitem", { name: /MPQRVWX/ });
        expect(currentGameLink).toHaveClass("is-current-page");
        expect(screen.getByRole("menuitem", { name: "Your Turn Ravens and Dragons: MPQRVWX" })).toBeInTheDocument();
        expect(container.querySelector(".your-turn-badge")?.textContent).toBe("YourTurn");
    });

    test("player game stream stays open when metadata refresh replaces the same current user object", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        const closeStream = vi.fn();
        openPlayerGamesStreamMock.mockReturnValue(closeStream);
        window.history.pushState({}, "", "/lobby");

        const { store } = renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(openPlayerGamesStreamMock).toHaveBeenCalledTimes(1);

        act(() => {
            store.dispatch(
                authActions.authSessionSet({
                    authenticated: true,
                    user: {
                        id: "guest-1",
                        displayName: "Guest 1",
                        authType: "guest"
                    },
                    oauthProviders: []
                })
            );
        });

        expect(closeStream).not.toHaveBeenCalled();
        expect(openPlayerGamesStreamMock).toHaveBeenCalledTimes(1);
    });

    test("player game stream errors show server unavailable without pinging auth again", async () => {
        let streamError: (() => void) | null = null;
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        openPlayerGamesStreamMock.mockImplementation((_onUpdate: (games: unknown[]) => void, onError: () => void) => {
            streamError = onError;
            return () => undefined;
        });
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        expect(fetchAuthSessionMock).toHaveBeenCalledTimes(1);

        act(() => {
            streamError?.();
        });

        expect(fetchAuthSessionMock).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: "Server Unavailable" })).toBeInTheDocument();
    });

    test("player game stream is not opened when the initial menu game load cannot reach the server", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        fetchPlayerGamesMock.mockRejectedValue(new TypeError("Failed to fetch"));
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game Lobby" });
        await waitFor(() => {
            expect(screen.getByRole("dialog", { name: "Server Unavailable" })).toBeInTheDocument();
        });
        expect(openPlayerGamesStreamMock).not.toHaveBeenCalled();
    });

    test("lobby menu navigation rechecks auth and redirects to login when the session expired", async () => {
        const user = userEvent.setup();
        fetchAuthSessionMock
            .mockResolvedValueOnce({
                authenticated: true,
                user: {
                    id: "guest-1",
                    displayName: "Guest 1",
                    authType: "guest"
                }
            })
            .mockResolvedValueOnce({
                authenticated: false,
                user: null,
                oauthProviders: []
            });
        fetchGameViewMock.mockResolvedValue(createGameView({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        renderWithStore(<App />);

        await screen.findByRole("heading", { name: "Game MPQRVWX" });
        await user.click(screen.getByRole("button", { name: "Dragon Player" }));
        await user.click(screen.getByRole("menuitem", { name: "Lobby" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/login");
        });
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/lobby");
    });

    test("public game list 401 redirects to login instead of showing an empty lobby", async () => {
        fetchAuthSessionMock.mockResolvedValue({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            }
        });
        fetchGameMetadataMock.mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ message: "Unauthorized." })
        });
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await waitFor(() => {
            expect(window.location.pathname).toBe("/login");
        });
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/lobby");
    });

    test("loading /lobby while signed out redirects to /login with a return target", async () => {
        window.history.pushState({}, "", "/lobby");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(window.location.pathname).toBe("/login");
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/lobby");
    });

    test("header title is not a lobby link on the login screen", async () => {
        window.history.pushState({}, "", "/login");

        renderWithStore(<App />);

        await screen.findByRole("button", { name: "Continue as Guest" });
        expect(screen.getByRole("heading", { name: "Ayazian Games", level: 1 })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Ayazian Games" })).not.toBeInTheDocument();
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
        await user.click(screen.getByRole("button", { name: "Dragon Player" }));
        await user.click(screen.getByRole("menuitem", { name: "Log Out" }));

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

        await screen.findByRole("button", { name: "Dragon Player" });
        await user.click(screen.getByRole("button", { name: "Dragon Player" }));
        await user.click(screen.getByRole("menuitem", { name: "Profile" }));

        expect(window.location.pathname).toBe("/profile");
        expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
        expect(fetchLocalProfileMock).toHaveBeenCalled();
        expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Dragon Player" }));
        expect(screen.getByRole("menuitem", { name: "Lobby" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Log Out" })).toBeInTheDocument();
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
        expect(document.title).toBe("Ayazian Games: Profile");
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
        expect(screen.getByRole("combobox", { name: "Game" })).toBeVisible();
        expect(screen.getByRole("option", { name: "Ravens and Dragons" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Tic-Tac-Toe" })).toBeInTheDocument();
        expect(screen.getByLabelText("Game")).toHaveValue("ravens-and-dragons");
        await user.click(screen.getByRole("button", { name: "Create Game" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/ravens-and-dragons/create");
        });
        expect(await screen.findByRole("heading", { name: "Create game: Ravens and Dragons", level: 1 })).toBeInTheDocument();
    });

    test("selecting Tic-Tac-Toe from the lobby opens the Tic-Tac-Toe create route", async () => {
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
        await user.selectOptions(screen.getByLabelText("Game"), "tic-tac-toe");
        await user.click(screen.getByRole("button", { name: "Create Game" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/tic-tac-toe/create");
        });
        expect(document.title).toBe("Ayazian Games: Create Tic-Tac-Toe");
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
