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
                publicGames={[]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage={null}
                openErrorMessage={null}
                isLoading={false}
                onCreateGame={onCreateGame}
                onDismissOpenError={vi.fn()}
                onOpenGame={onOpenGame}
                onSelectGame={onSelectGame}
            />
        );

        expect(screen.getByRole("combobox", { name: "Game" })).toBeVisible();
        expect(screen.getByRole("option", { name: "Ravens and Dragons" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Lunar Dunes" })).toBeInTheDocument();
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
                publicGames={[]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage='Unable to open game "missing-game".'
                openErrorMessage={null}
                isLoading={false}
                onCreateGame={vi.fn()}
                onDismissOpenError={vi.fn()}
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
                publicGames={[]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage={null}
                openErrorMessage={null}
                isLoading={false}
                onCreateGame={vi.fn()}
                onDismissOpenError={vi.fn()}
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

    test("opens either a selected public game or a typed game id", async () => {
        const user = userEvent.setup();
        const onOpenGame = vi.fn();

        renderWithStore(
            <LobbyScreen
                games={[
                    {
                        slug: "ravens-and-dragons",
                        displayName: "Ravens and Dragons"
                    }
                ]}
                publicGames={[
                    {
                        gameId: "AAAAAAA",
                        gameSlug: "ravens-and-dragons",
                        gameName: "Ravens and Dragons",
                        openSeats: 1
                    },
                    {
                        gameId: "BBBBBBB",
                        gameSlug: "ravens-and-dragons",
                        gameName: "Ravens and Dragons",
                        openSeats: 2
                    }
                ]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage={null}
                openErrorMessage={null}
                isLoading={false}
                onCreateGame={vi.fn()}
                onDismissOpenError={vi.fn()}
                onOpenGame={onOpenGame}
                onSelectGame={vi.fn()}
            />
        );

        expect(screen.getByText("Select a public game or paste a game ID to open it.")).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Ravens and Dragons (1 open seat): AAAAAAA" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Ravens and Dragons (2 open seats): BBBBBBB" })).toBeInTheDocument();

        await user.click(screen.getByRole("option", { name: "Ravens and Dragons (1 open seat): AAAAAAA" }));
        expect(screen.getByLabelText("Game ID")).toHaveValue("");
        await user.click(screen.getByRole("button", { name: "Open Game" }));
        expect(onOpenGame).toHaveBeenLastCalledWith("AAAAAAA");

        await user.click(screen.getByLabelText("Game ID"));
        await user.type(screen.getByLabelText("Game ID"), "c7h2rmw");
        await user.click(screen.getByRole("button", { name: "Open Game" }));
        expect(onOpenGame).toHaveBeenLastCalledWith("C7H2RMW");
        expect(screen.getByRole("option", { name: "Ravens and Dragons (1 open seat): AAAAAAA" })).toHaveAttribute("aria-selected", "false");
    });

    test("shows open failures in a dismissible popup", async () => {
        const user = userEvent.setup();
        const onDismissOpenError = vi.fn();

        renderWithStore(
            <LobbyScreen
                games={[
                    {
                        slug: "ravens-and-dragons",
                        displayName: "Ravens and Dragons"
                    }
                ]}
                publicGames={[]}
                selectedGameSlug="ravens-and-dragons"
                feedbackMessage={null}
                openErrorMessage='Unable to open game "MISSING".'
                isLoading={false}
                onCreateGame={vi.fn()}
                onDismissOpenError={onDismissOpenError}
                onOpenGame={vi.fn()}
                onSelectGame={vi.fn()}
            />
        );

        expect(screen.getByRole("dialog", { name: "Open Game Error" })).toBeInTheDocument();
        expect(screen.getByText('Unable to open game "MISSING".')).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "OK" }));

        expect(onDismissOpenError).toHaveBeenCalled();
    });
});
