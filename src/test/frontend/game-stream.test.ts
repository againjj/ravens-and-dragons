import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { connectGameStream } from "../../main/frontend/features/game/gameStream.js";
import { createAuthSession, createGameView, createSession } from "./fixtures.js";

const { fetchGameViewMock, openGameStreamMock } = vi.hoisted(() => ({
    fetchGameViewMock: vi.fn(),
    openGameStreamMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    fetchGameView: fetchGameViewMock,
    openGameStream: openGameStreamMock
}));

describe("gameStream", () => {
    beforeEach(() => {
        fetchGameViewMock.mockReset();
        openGameStreamMock.mockReset();
        openGameStreamMock.mockReturnValue(() => undefined);
    });

    test("refreshes seat metadata after a streamed session update", async () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession({
                    user: {
                        id: "spectator",
                        displayName: "Spectator",
                        authType: "local"
                    }
                })
            },
            game: {
                view: "game",
                currentGameId: "game-404",
                session: createSession({
                    id: "game-404",
                    dragonsPlayerUserId: null,
                    ravensPlayerUserId: null
                }),
                viewerRole: "spectator",
                dragonsPlayer: null,
                ravensPlayer: null
            }
        });

        fetchGameViewMock.mockResolvedValue(
            createGameView(
                {
                    id: "game-404",
                    dragonsPlayerUserId: "claimed-dragon",
                    ravensPlayerUserId: null
                },
                {},
                {
                    currentUser: {
                        id: "spectator",
                        displayName: "Spectator",
                        authType: "local"
                    },
                    dragonsPlayer: {
                        id: "claimed-dragon",
                        displayName: "J"
                    },
                    ravensPlayer: null,
                    viewerRole: "spectator"
                }
            )
        );

        connectGameStream(store.dispatch, "game-404");

        const onGame = openGameStreamMock.mock.calls[0][2] as (session: ReturnType<typeof createSession>) => void;
        onGame(
            createSession({
                id: "game-404",
                dragonsPlayerUserId: "claimed-dragon",
                ravensPlayerUserId: null
            })
        );

        await waitFor(() => {
            expect(store.getState().game.dragonsPlayer).toEqual({
                id: "claimed-dragon",
                displayName: "J"
            });
        });
        expect(fetchGameViewMock).toHaveBeenCalledWith("game-404");
    });
});
