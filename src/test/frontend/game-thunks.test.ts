import { describe, expect, test, vi, beforeEach } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { createAuthSession, createGameView, createSession } from "./fixtures.js";

const {
    claimGameSideMock,
    createGameSessionMock,
    fetchGameViewMock,
    sendGameCommandRequestMock
} = vi.hoisted(() => ({
    claimGameSideMock: vi.fn(),
    createGameSessionMock: vi.fn(),
    fetchGameViewMock: vi.fn(),
    sendGameCommandRequestMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    claimGameSide: claimGameSideMock,
    createGameSession: createGameSessionMock,
    fetchGameView: fetchGameViewMock,
    sendGameCommandRequest: sendGameCommandRequestMock
}));

import { claimSide, createGame, openGame, returnToLobby } from "../../main/frontend/features/game/gameThunks.js";

describe("gameThunks", () => {
    beforeEach(() => {
        claimGameSideMock.mockReset();
        createGameSessionMock.mockReset();
        fetchGameViewMock.mockReset();
        sendGameCommandRequestMock.mockReset();
    });

    test("createGame enters the game view with the created session", async () => {
        const session = createSession({ id: "game-101" });
        const gameView = createGameView({ id: "game-101" });
        createGameSessionMock.mockResolvedValue(session);
        fetchGameViewMock.mockResolvedValue(gameView);
        const store = createAppStore();

        const createdGameId = await store.dispatch(createGame());

        expect(createdGameId).toBe("game-101");
        expect(store.getState().game.view).toBe("game");
        expect(store.getState().game.currentGameId).toBe("game-101");
        expect(store.getState().game.session?.id).toBe("game-101");
        expect(store.getState().game.viewerRole).toBe("dragons");
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

    test("claimSide refreshes the current game view after a successful claim", async () => {
        claimGameSideMock.mockResolvedValue({
            data: createSession({ id: "game-404", dragonsPlayerUserId: "player-dragons", ravensPlayerUserId: null })
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

        expect(claimGameSideMock).toHaveBeenCalledWith("game-404", { side: "ravens" });
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-404");
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
