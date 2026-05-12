import { describe, expect, test, vi, beforeEach } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { createGameDraftActions } from "../../main/frontend/features/game/createGameSlice.js";
import { createAuthSession, createGameView, createSession } from "./fixtures.js";

const {
    createGameSessionMock,
    fetchGameViewMock,
    sendGameCommandRequestMock
} = vi.hoisted(() => ({
    createGameSessionMock: vi.fn(),
    fetchGameViewMock: vi.fn(),
    sendGameCommandRequestMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    createGameSession: createGameSessionMock,
    fetchGameView: fetchGameViewMock,
    sendGameCommandRequest: sendGameCommandRequestMock
}));

import { assignBotOpponent, claimSide, createGame, openGame, returnToLobby, sendCommand } from "../../main/frontend/features/game/gameThunks.js";

describe("gameThunks", () => {
    beforeEach(() => {
        createGameSessionMock.mockReset();
        fetchGameViewMock.mockReset();
        sendGameCommandRequestMock.mockReset();
    });

    test("createGame submits the active draft and stores the created session", async () => {
        const session = createSession({ id: "game-101" });
        createGameSessionMock.mockResolvedValue(session);
        const store = createAppStore();
        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));

        const createdGameId = await store.dispatch(createGame("ravens-and-dragons"));

        expect(createdGameId).toBe("game-101");
        expect(createGameSessionMock).toHaveBeenCalledWith("ravens-and-dragons", {
            ruleConfigurationId: "free-play",
            startingSide: "ravens",
            boardSize: 7,
            board: {
                a1: "raven"
            }
        });
        expect(store.getState().game.session?.id).toBe("game-101");
        expect(store.getState().game.currentGameId).toBe("game-101");
        expect(store.getState().game.view).toBe("lobby");
        expect(store.getState().game.isSubmitting).toBe(false);
    });

    test("createGame shows a server-down message when the create request does not respond", async () => {
        createGameSessionMock.mockRejectedValue(new TypeError("Failed to fetch"));
        const store = createAppStore();
        store.dispatch(createGameDraftActions.createModeEntered());

        const createdGameId = await store.dispatch(createGame("ravens-and-dragons"));

        expect(createdGameId).toBeNull();
        expect(store.getState().game.feedbackMessage).toBe("The server is down. Please wait and try again later.");
        expect(store.getState().createGame.isActive).toBe(true);
    });

    test("openGame enters the game view for a valid game id", async () => {
        const gameView = createGameView({ id: "game-202" });
        fetchGameViewMock.mockResolvedValue(gameView);
        const store = createAppStore();

        const loaded = await store.dispatch(openGame("game-202"));

        expect(loaded).toBe(true);
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-202");
        expect(store.getState().game.view).toBe("game");
        expect(store.getState().game.currentGameId).toBe("game-202");
        expect(store.getState().game.session?.id).toBe("game-202");
        expect(store.getState().auth.session.user?.id).toBe("player-dragons");
    });

    test("openGame keeps the requested game route active and shows feedback for an invalid game id", async () => {
        fetchGameViewMock.mockRejectedValue(new Error("missing"));
        const store = createAppStore();

        const loaded = await store.dispatch(openGame("missing-game"));

        expect(loaded).toBe(false);
        expect(store.getState().game.view).toBe("game");
        expect(store.getState().game.currentGameId).toBe("missing-game");
        expect(store.getState().game.feedbackMessage).toBe('Unable to open game "missing-game".');
    });

    test("openGame shows a server-down message when the game view request does not respond", async () => {
        fetchGameViewMock.mockRejectedValue(new TypeError("Failed to fetch"));
        const store = createAppStore();

        const loaded = await store.dispatch(openGame("game-303"));

        expect(loaded).toBe(false);
        expect(store.getState().game.feedbackMessage).toBe("The server is down. Please wait and try again later.");
    });

    test("claimSide refreshes the current game view after a successful claim", async () => {
        sendGameCommandRequestMock.mockResolvedValue({
            game: createSession({ id: "game-404", dragonsPlayerUserId: "player-dragons", ravensPlayerUserId: "player-ravens" })
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView(
                { id: "game-404", ravensPlayerUserId: null },
                {},
                {
                    ravensPlayer: null
                }
            )
        );
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                view: "game",
                currentGameId: "game-404",
                session: createSession({ id: "game-404", ravensPlayerUserId: null }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: null
            }
        });

        await store.dispatch(claimSide("ravens"));

        expect(sendGameCommandRequestMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: "game-404" }),
            { type: "claim-side", side: "ravens" }
        );
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-404");
    });

    test("sendCommand signs the viewer out and refreshes the game view after a 401 response", async () => {
        sendGameCommandRequestMock.mockResolvedValue({
            status: 401,
            errorMessage: "Sign in required."
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView(
                { id: "game-505" },
                {},
                {
                    currentUser: null,
                    viewerRole: null
                }
            )
        );
        const store = createAppStore({
            auth: {
                session: createAuthSession({ oauthProviders: ["google"] })
            },
            game: {
                view: "game",
                currentGameId: "game-505",
                session: createSession({ id: "game-505" }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: { id: "player-ravens", displayName: "Raven Player" }
            }
        });

        await store.dispatch(sendCommand({ type: "skip-capture" }));

        expect(fetchGameViewMock).toHaveBeenCalledWith("game-505");
        expect(store.getState().auth.session.authenticated).toBe(false);
        expect(store.getState().auth.session.oauthProviders).toEqual(["google"]);
        expect(store.getState().game.viewerRole).toBeNull();
        expect(store.getState().game.feedbackMessage).toBeNull();
    });

    test("assignBotOpponent refreshes the current game view after a successful assignment", async () => {
        sendGameCommandRequestMock.mockResolvedValue({
            game: createSession({ id: "game-515", ravensBotId: "minimax", canUndo: false })
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView(
                { id: "game-515", ravensBotId: "minimax", canUndo: false },
                {},
                {
                    ravensPlayer: null,
                    ravensBot: { id: "minimax", displayName: "Maxine" },
                    availableBots: [
                        { id: "random", displayName: "Randall" },
                        { id: "simple", displayName: "Simon" },
                        { id: "minimax", displayName: "Maxine" },
                        { id: "deep-minimax", displayName: "Alphie" }
                    ]
                }
            )
        );
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                view: "game",
                currentGameId: "game-515",
                session: createSession({ id: "game-515", ravensPlayerUserId: null, ravensBotId: null }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: null,
                availableBots: [
                    { id: "random", displayName: "Randall" },
                    { id: "simple", displayName: "Simon" },
                    { id: "minimax", displayName: "Maxine" },
                    { id: "deep-minimax", displayName: "Alphie" }
                ]
            }
        });

        await store.dispatch(assignBotOpponent("minimax"));

        expect(sendGameCommandRequestMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: "game-515" }),
            { type: "assign-bot-opponent", botId: "minimax" }
        );
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-515");
    });

    test("assignBotOpponent marks the pending bot seat while the request is in flight", async () => {
        let resolveRequest: ((value: { data: ReturnType<typeof createSession> }) => void) | null = null;
        sendGameCommandRequestMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveRequest = resolve as unknown as typeof resolveRequest;
                })
        );
        fetchGameViewMock.mockResolvedValue(
            createGameView(
                { id: "game-516", ravensBotId: "simple" },
                {},
                {
                    ravensPlayer: null,
                    ravensBot: { id: "simple", displayName: "Simon" },
                    availableBots: [
                        { id: "random", displayName: "Randall" },
                        { id: "simple", displayName: "Simon" }
                    ]
                }
            )
        );
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                view: "game",
                currentGameId: "game-516",
                session: createSession({ id: "game-516", ravensPlayerUserId: null, ravensBotId: null }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: null,
                availableBots: [
                    { id: "random", displayName: "Randall" },
                    { id: "simple", displayName: "Simon" }
                ]
            }
        });

        const pendingDispatch = store.dispatch(assignBotOpponent("simple"));

        expect(store.getState().game.pendingBotAssignment).toEqual({ side: "ravens", botId: "simple" });

        resolveRequest?.({
            game: createSession({ id: "game-516", ravensBotId: "simple", canUndo: false })
        } as unknown as { data: ReturnType<typeof createSession> });
        await pendingDispatch;

        expect(store.getState().game.pendingBotAssignment).toBeNull();
    });

    test("claimSide refreshes the game view after a 403 response without clearing OAuth providers", async () => {
        sendGameCommandRequestMock.mockResolvedValue({
            status: 403,
            errorMessage: "Seat already taken."
        });
        fetchGameViewMock.mockResolvedValue(
            createGameView(
                { id: "game-606" },
                {},
                {
                    viewerRole: null
                }
            )
        );
        const store = createAppStore({
            auth: {
                session: createAuthSession({ oauthProviders: ["google"] })
            },
            game: {
                view: "game",
                currentGameId: "game-606",
                session: createSession({ id: "game-606" }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: { id: "player-ravens", displayName: "Raven Player" }
            }
        });

        await store.dispatch(claimSide("ravens"));

        expect(fetchGameViewMock).toHaveBeenCalledWith("game-606");
        expect(store.getState().auth.session.oauthProviders).toEqual(["google"]);
        expect(store.getState().game.feedbackMessage).toBeNull();
    });

    test("sendCommand shows a server-down message when the command request fails to reach the server", async () => {
        sendGameCommandRequestMock.mockRejectedValue(new TypeError("Failed to fetch"));
        const store = createAppStore({
            game: {
                view: "game",
                currentGameId: "game-707",
                session: createSession({ id: "game-707" }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: { id: "player-ravens", displayName: "Raven Player" }
            }
        });

        await store.dispatch(sendCommand({ type: "skip-capture" }));

        expect(store.getState().game.feedbackMessage).toBe("The server is down. Please wait and try again later.");
        expect(store.getState().game.isSubmitting).toBe(false);
    });

    test("claimSide shows a server-down message when the claim request fails to reach the server", async () => {
        sendGameCommandRequestMock.mockRejectedValue(new TypeError("Failed to fetch"));
        const store = createAppStore({
            game: {
                view: "game",
                currentGameId: "game-808",
                session: createSession({ id: "game-808" }),
                viewerRole: "spectator",
                dragonsPlayer: null,
                ravensPlayer: null
            }
        });

        await store.dispatch(claimSide("dragons"));

        expect(store.getState().game.feedbackMessage).toBe("The server is down. Please wait and try again later.");
        expect(store.getState().game.isSubmitting).toBe(false);
    });

    test("returnToLobby clears the active game session and local selection", async () => {
        const store = createAppStore({
            game: {
                view: "game",
                currentGameId: "game-303",
                session: createSession({ id: "game-303" }),
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: { id: "player-ravens", displayName: "Raven Player" }
            },
            ui: {
                selectedSquare: "a1"
            }
        });

        store.dispatch(returnToLobby());

        expect(store.getState().game.view).toBe("lobby");
        expect(store.getState().game.currentGameId).toBeNull();
        expect(store.getState().game.session).toBeNull();
        expect(store.getState().ui.selectedSquare).toBeNull();
    });
});
