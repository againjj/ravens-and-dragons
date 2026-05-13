import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clickerGameEntry } from "../../main/frontend/clicker-entry.js";

class TestEventSource {
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
    }

    addEventListener() {
    }

    close() {
    }
}

describe("clickerGameEntry", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("declares Clicker identity and create route", () => {
        expect(clickerGameEntry.identity).toEqual({
            slug: "clicker",
            displayName: "Clicker"
        });
        expect(clickerGameEntry.routes.createPath).toBe("/clicker/create");
    });

    test("create screen starts the game", async () => {
        const user = userEvent.setup();
        const onStartGame = vi.fn();
        const CreateScreen = clickerGameEntry.components.CreateScreen;

        render(<CreateScreen gameName="Clicker" onStartGame={onStartGame} />);
        await user.click(screen.getByRole("button", { name: "Start" }));

        expect(onStartGame).toHaveBeenCalled();
    });

    test("play screen loads and clicks until game over", async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "CLK1234",
                    gameSlug: "clicker",
                    version: 1,
                    lifecycle: "active",
                    counter: 0
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "CLK1234",
                    gameSlug: "clicker",
                    version: 2,
                    lifecycle: "active",
                    counter: 1
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "CLK1234",
                    gameSlug: "clicker",
                    version: 11,
                    lifecycle: "finished",
                    counter: 10
                })
            });
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("EventSource", TestEventSource);
        window.history.pushState({}, "", "/g/CLK1234");
        const PlayScreen = clickerGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        expect(await screen.findByText("Counter: 0")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Click" }));
        expect(await screen.findByText("Counter: 1")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Click" }));
        expect(await screen.findByText("Counter: 10")).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Click" })).toBeDisabled();
        });
        expect(screen.getByText("Game over")).toBeInTheDocument();
    });
});
