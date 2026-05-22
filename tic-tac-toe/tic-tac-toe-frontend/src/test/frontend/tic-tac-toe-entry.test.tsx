import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ticTacToeGameEntry } from "../../main/frontend/tic-tac-toe-entry.js";

class TestEventSource {
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
    }

    addEventListener() {
    }

    close() {
    }
}

describe("ticTacToeGameEntry", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    test("declares Tic-Tac-Toe identity and create route", () => {
        expect(ticTacToeGameEntry.identity).toEqual({
            slug: "tic-tac-toe",
            displayName: "Tic-Tac-Toe"
        });
        expect(ticTacToeGameEntry.routes.createPath).toBe("/tic-tac-toe/create");
    });

    test("create screen starts the game", async () => {
        const user = userEvent.setup();
        const onStartGame = vi.fn();
        const CreateScreen = ticTacToeGameEntry.components.CreateScreen;

        render(<CreateScreen gameName="Tic-Tac-Toe" onStartGame={onStartGame} />);
        expect(screen.getByLabelText("Publicly list game")).toBeChecked();
        await user.click(screen.getByLabelText("Publicly list game"));
        await user.click(screen.getByRole("button", { name: "Start" }));

        expect(onStartGame).toHaveBeenCalledWith(false);
    });

    test("play screen loads and places a mark", async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "TTT1234",
                    gameSlug: "tic-tac-toe",
                    version: 1,
                    lifecycle: "active",
                    board: Array(9).fill(null),
                    currentMark: "X",
                    winner: null,
                    winningLine: []
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "TTT1234",
                    gameSlug: "tic-tac-toe",
                    version: 2,
                    lifecycle: "active",
                    board: ["X", null, null, null, null, null, null, null, null],
                    currentMark: "O",
                    winner: null,
                    winningLine: []
                })
            });
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("EventSource", TestEventSource);
        window.history.pushState({}, "", "/g/TTT1234");
        const PlayScreen = ticTacToeGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        expect(await screen.findByText("X to move")).toBeInTheDocument();
        await user.click(screen.getByRole("gridcell", { name: "Square 1" }));
        expect(await screen.findByText("O to move")).toBeInTheDocument();
        expect(screen.getByRole("gridcell", { name: "Square 1, X" })).toBeDisabled();
        expect(fetchMock).toHaveBeenLastCalledWith(
            "/api/games/TTT1234/commands",
            expect.objectContaining({
                body: JSON.stringify({
                    type: "placeMark",
                    expectedVersion: 1,
                    cellIndex: 0
                })
            })
        );
    });

    test("play screen disables board after a win", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "TTT1234",
                    gameSlug: "tic-tac-toe",
                    version: 6,
                    lifecycle: "finished",
                    board: ["X", "X", "X", "O", "O", null, null, null, null],
                    currentMark: "X",
                    winner: "X",
                    winningLine: [0, 1, 2]
                })
            });
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("EventSource", TestEventSource);
        window.history.pushState({}, "", "/g/TTT1234");
        const PlayScreen = ticTacToeGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        expect(await screen.findByText("X wins")).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole("gridcell", { name: "Square 6" })).toBeDisabled();
        });
    });
});
