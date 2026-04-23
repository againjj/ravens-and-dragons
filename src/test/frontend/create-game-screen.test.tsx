import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { CreateGameScreen } from "../../main/frontend/components/CreateGameScreen.js";
import { createGameDraftActions } from "../../main/frontend/features/game/createGameSlice.js";
import { renderWithStore } from "./test-utils.js";

vi.mock("../../main/frontend/hooks/useBoardSizing.js", () => ({
    useBoardSizing: () => undefined
}));

describe("CreateGameScreen", () => {
    test("shows the draft board, configuration controls, and rules panel", () => {
        const store = createAppStore();
        store.dispatch(createGameDraftActions.createModeEntered());

        renderWithStore(<CreateGameScreen />, { store });

        expect(screen.getByRole("heading", { name: "Create Game", level: 2 })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Configuration" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Rules" })).toBeInTheDocument();
        expect(screen.getByText("Configure and start your game.")).toBeInTheDocument();
        expect(screen.getByText("Place the pieces before starting the game.")).toBeInTheDocument();
        expect(screen.getByLabelText("Play Style")).toHaveValue("free-play");
        expect(screen.getByLabelText("Board Size")).toHaveValue("7");
        expect(screen.getByLabelText("Starting Side")).toHaveValue("ravens");
        expect(
            screen
                .getAllByRole("option")
                .filter((option) => option.parentElement === screen.getByLabelText("Starting Side"))
                .map((option) => option.textContent)
        ).toEqual(["Ravens", "Dragons"]);
        expect(screen.getByRole("button", { name: "Start Game" })).toBeDisabled();
    });

    test("keeps the board editable in free play and swaps to preset rules when selected", async () => {
        const user = userEvent.setup();
        const store = createAppStore();
        store.dispatch(createGameDraftActions.createModeEntered());

        renderWithStore(<CreateGameScreen />, { store });

        await user.click(screen.getByRole("button", { name: "Square a1" }));
        expect(store.getState().createGame.draftBoard).toMatchObject({
            a1: "raven"
        });

        await user.selectOptions(screen.getByLabelText("Play Style"), "trivial");

        expect(screen.getByLabelText("Play Style")).toHaveValue("trivial");
        expect(screen.queryByLabelText("Board Size")).toBeNull();
        expect(screen.queryByLabelText("Starting Side")).toBeNull();
        expect(screen.getByText("The dragons need to move the gold to the center.")).toBeInTheDocument();
        expect(screen.queryByText("Place the pieces before starting the game.")).toBeNull();
        expect(screen.getByRole("button", { name: "Square a1" })).toHaveTextContent("D");
    });
});
