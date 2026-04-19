import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { GameScreen } from "../../main/frontend/components/GameScreen.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

vi.mock("../../main/frontend/hooks/useBoardSizing.js", () => ({
    useBoardSizing: vi.fn()
}));

vi.mock("../../main/frontend/components/Board.js", () => ({
    Board: () => <div>Board</div>
}));

vi.mock("../../main/frontend/components/ControlsPanel.js", () => ({
    ControlsPanel: () => <div data-testid="controls-panel">Controls</div>
}));

vi.mock("../../main/frontend/components/MoveList.js", () => ({
    MoveList: () => <div data-testid="move-list">Move list</div>
}));

vi.mock("../../main/frontend/components/SeatPanel.js", () => ({
    SeatPanel: () => <div data-testid="seat-panel">Seat summary</div>
}));

vi.mock("../../main/frontend/components/RulesPanel.js", () => ({
    RulesPanel: () => <div data-testid="rules-panel">Rules</div>
}));

describe("GameScreen", () => {
    test("places the seat summary in the header and the controls above the move history", () => {
        const { container } = renderWithStore(<GameScreen />, {
            preloadedState: {
                game: {
                    view: "game",
                    currentGameId: "game-909",
                    session: createSession(
                        {
                            id: "game-909",
                            lifecycle: "active",
                            canUndo: true,
                            undoOwnerSide: "dragons"
                        },
                        {
                            phase: "move",
                            activeSide: "dragons"
                        }
                    ),
                    viewerRole: "dragons",
                    dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                    ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
                    isSubmitting: false,
                    loadState: "ready",
                    connectionState: "open",
                    feedbackMessage: null
                }
            }
        });

        const headerPanel = container.querySelector(".game-header-panel");
        const turnsPanel = container.querySelector(".turns-panel");
        const turnsPanelHeader = container.querySelector(".turns-panel-header");
        const gameLayout = container.querySelector(".game-layout");

        expect(headerPanel).not.toBeNull();
        expect(turnsPanel).not.toBeNull();
        expect(turnsPanelHeader).not.toBeNull();
        expect(gameLayout).not.toBeNull();

        expect(headerPanel).toContainElement(screen.getByTestId("seat-panel"));
        expect(turnsPanel).toContainElement(screen.getByRole("heading", { name: "Move List" }));
        expect(turnsPanelHeader).toContainElement(screen.getByTestId("controls-panel"));
        expect(turnsPanel).toContainElement(screen.getByTestId("move-list"));
        expect(gameLayout).toContainElement(screen.getByTestId("rules-panel"));
        expect(turnsPanel).not.toContainElement(screen.getByTestId("rules-panel"));
        expect(screen.queryByRole("heading", { name: "Seats" })).toBeNull();
    });

    test("shows game feedback in a popup that can be dismissed", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<GameScreen />, {
            preloadedState: {
                game: {
                    view: "game",
                    currentGameId: "game-909",
                    session: createSession({ id: "game-909" }),
                    viewerRole: "dragons",
                    dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                    ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
                    isSubmitting: false,
                    loadState: "ready",
                    connectionState: "open",
                    feedbackMessage: "The server is down. Please wait and try again later."
                }
            }
        });

        const dialog = screen.getByRole("dialog", { name: "Action Error" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("The server is down. Please wait and try again later.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "OK" }));
        expect(store.getState().game.feedbackMessage).toBeNull();
    });
});
