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
    ControlsPanel: () => <div>Controls</div>
}));

vi.mock("../../main/frontend/components/MoveList.js", () => ({
    MoveList: () => <div>Move list</div>
}));

vi.mock("../../main/frontend/components/SeatPanel.js", () => ({
    SeatPanel: () => <div>Seats</div>
}));

describe("GameScreen", () => {
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
