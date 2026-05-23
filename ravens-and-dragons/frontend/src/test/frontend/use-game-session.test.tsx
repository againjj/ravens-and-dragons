import { act } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const { connectGameStreamMock, closeStreamMock } = vi.hoisted(() => ({
    connectGameStreamMock: vi.fn(),
    closeStreamMock: vi.fn()
}));

vi.mock("../../main/frontend/features/game/gameStream.js", () => ({
    connectGameStream: connectGameStreamMock
}));

import { useGameSession } from "../../main/frontend/features/game/useGameSession.js";
import { gameActions } from "../../main/frontend/features/game/gameSlice.js";

const HookHarness = () => {
    useGameSession();
    return null;
};

describe("useGameSession", () => {
    beforeEach(() => {
        connectGameStreamMock.mockReset();
        closeStreamMock.mockReset();
        connectGameStreamMock.mockReturnValue(closeStreamMock);
    });

    test("connects the stream when a game is open", () => {
        renderWithStore(<HookHarness />, {
            preloadedState: {
                game: {
                    view: "game",
                    currentGameId: "game-404",
                    session: createSession({ id: "game-404" })
                }
            }
        });

        expect(connectGameStreamMock).toHaveBeenCalledTimes(1);
        expect(connectGameStreamMock.mock.calls[0][1]).toBe("game-404");
    });

    test("disconnects the stream when returning to the lobby", () => {
        const { store } = renderWithStore(<HookHarness />, {
            preloadedState: {
                game: {
                    view: "game",
                    currentGameId: "game-505",
                    session: createSession({ id: "game-505" })
                }
            }
        });

        act(() => {
            store.dispatch(gameActions.returnedToLobby());
        });

        expect(closeStreamMock).toHaveBeenCalledTimes(1);
    });
});
