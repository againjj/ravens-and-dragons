import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../../main/frontend/App.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const {
    createGameSessionMock,
    fetchGameSessionMock,
    sendGameCommandRequestMock
} = vi.hoisted(() => ({
    createGameSessionMock: vi.fn(),
    fetchGameSessionMock: vi.fn(),
    sendGameCommandRequestMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", () => ({
    createGameSession: createGameSessionMock,
    fetchGameSession: fetchGameSessionMock,
    sendGameCommandRequest: sendGameCommandRequestMock,
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
        fetchGameSessionMock.mockReset();
        sendGameCommandRequestMock.mockReset();
        window.history.pushState({}, "", "/");
    });

    afterEach(() => {
        window.history.pushState({}, "", "/");
    });

    test("loading a /g/XXXXXXX URL opens that game", async () => {
        fetchGameSessionMock.mockResolvedValue(createSession({ id: "CFGHJMP" }));
        window.history.pushState({}, "", "/g/CFGHJMP");

        renderWithStore(<App />);

        await screen.findByText("Game ID: CFGHJMP");
        expect(fetchGameSessionMock).toHaveBeenCalledWith("CFGHJMP");
        expect(window.location.pathname).toBe("/g/CFGHJMP");
    });

    test("opening a game from the lobby updates the URL", async () => {
        const user = userEvent.setup();
        fetchGameSessionMock.mockResolvedValue(createSession({ id: "QRVWXC2" }));

        renderWithStore(<App />);

        await user.type(screen.getByLabelText("Game ID"), "QRVWXC2");
        await user.click(screen.getByRole("button", { name: "Open Game" }));

        await screen.findByText("Game ID: QRVWXC2");
        expect(window.location.pathname).toBe("/g/QRVWXC2");
    });

    test("back to lobby returns the app to the root URL", async () => {
        const user = userEvent.setup();
        fetchGameSessionMock.mockResolvedValue(createSession({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        renderWithStore(<App />);

        await screen.findByText("Game ID: MPQRVWX");
        await user.click(screen.getByRole("button", { name: "Back to Lobby" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/");
        });
        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
    });

    test("leaving a directly loaded game does not trap browser back inside the app", async () => {
        const user = userEvent.setup();
        const pushStateSpy = vi.spyOn(History.prototype, "pushState");
        const replaceStateSpy = vi.spyOn(History.prototype, "replaceState");
        fetchGameSessionMock.mockResolvedValue(createSession({ id: "MPQRVWX" }));
        window.history.pushState({}, "", "/g/MPQRVWX");

        renderWithStore(<App />);

        await screen.findByText("Game ID: MPQRVWX");
        pushStateSpy.mockClear();
        replaceStateSpy.mockClear();

        await user.click(screen.getByRole("button", { name: "Back to Lobby" }));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/");
        });
        expect(replaceStateSpy).toHaveBeenCalledWith({}, "", "/");
        expect(pushStateSpy).not.toHaveBeenCalled();
    });

    test("browser back from a lobby-opened game returns to the lobby", async () => {
        const user = userEvent.setup();
        fetchGameSessionMock.mockResolvedValue(createSession({ id: "QRVWXC2" }));

        renderWithStore(<App />);

        await user.type(screen.getByLabelText("Game ID"), "QRVWXC2");
        await user.click(screen.getByRole("button", { name: "Open Game" }));

        await screen.findByText("Game ID: QRVWXC2");

        window.history.back();
        window.dispatchEvent(new PopStateEvent("popstate"));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/");
        });
        expect(screen.getByRole("heading", { name: "Game Lobby" })).toBeInTheDocument();
    });
});
