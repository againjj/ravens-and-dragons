import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { LobbyScreen } from "../../main/frontend/components/LobbyScreen.js";
import { renderWithStore } from "./test-utils.js";

describe("LobbyScreen", () => {
    test("creates a game and opens a typed game id", async () => {
        const user = userEvent.setup();
        const onCreateGame = vi.fn();
        const onOpenGame = vi.fn();
        const onSelectGame = vi.fn();

        renderWithStore(
            <LobbyScreen
                games={[
                    {
                        slug: "ravens-and-dragons",
                        displayName: "Ravens and Dragons"
                    },
                    {
                        slug: "lunar-dunes",
                        displayName: "Lunar Dunes"
                    }
                ]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage={null}
                isLoading={false}
                onCreateGame={onCreateGame}
                onOpenGame={onOpenGame}
                onSelectGame={onSelectGame}
            />
        );

        await user.selectOptions(screen.getByLabelText("Game"), "lunar-dunes");
        expect(onSelectGame).toHaveBeenCalledWith("lunar-dunes");
        await user.click(screen.getByRole("button", { name: "Create Game" }));
        await user.type(screen.getByLabelText("Game ID"), "c7h2rmw");
        await user.click(screen.getByRole("button", { name: "Open Game" }));

        expect(onCreateGame).toHaveBeenCalledWith("ravens-and-dragons");
        expect(onOpenGame).toHaveBeenCalledWith("C7H2RMW");
    });

    test("renders feedback text from the lobby state", () => {
        renderWithStore(
            <LobbyScreen
                games={[
                    {
                        slug: "ravens-and-dragons",
                        displayName: "Ravens and Dragons"
                    }
                ]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage='Unable to open game "missing-game".'
                isLoading={false}
                onCreateGame={vi.fn()}
                onOpenGame={vi.fn()}
                onSelectGame={vi.fn()}
            />
        );

        expect(screen.getByText('Unable to open game "missing-game".')).toBeInTheDocument();
    });

    test("disables opening until a game id is provided", () => {
        renderWithStore(
            <LobbyScreen
                games={[
                    {
                        slug: "ravens-and-dragons",
                        displayName: "Ravens and Dragons"
                    }
                ]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage={null}
                isLoading={false}
                onCreateGame={vi.fn()}
                onOpenGame={vi.fn()}
                onSelectGame={vi.fn()}
            />
        );

        expect(screen.getByRole("button", { name: "Open Game" })).toBeDisabled();
        expect(screen.getByText("Start Fresh")).toBeInTheDocument();
        expect(screen.getByText("Create a game to start playing a new game.")).toBeInTheDocument();
        expect(screen.getByText("Join Game")).toBeInTheDocument();
        expect(screen.getByLabelText("Game")).toHaveValue("ravens-and-dragons");
    });
});
