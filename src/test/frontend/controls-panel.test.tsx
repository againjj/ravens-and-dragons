import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ControlsPanel } from "../../main/frontend/components/ControlsPanel.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const renderPanel = (session = createSession()) =>
    renderWithStore(
        <ControlsPanel
            onStartGame={vi.fn()}
            onEndSetup={vi.fn()}
            onEndGame={vi.fn()}
            onUndo={vi.fn()}
            onSkipCapture={vi.fn()}
        />,
        {
            preloadedState: {
                game: {
                    session,
                    isSubmitting: false,
                    loadState: "ready",
                    connectionState: "open",
                    feedbackMessage: null
                },
                ui: {
                    selectedSquare: null
                }
            }
        }
    );

describe("ControlsPanel", () => {
    test("shows only start game in the no game state and calls the handler", async () => {
        const user = userEvent.setup();
        const onStartGame = vi.fn();

        renderWithStore(
            <ControlsPanel
                onStartGame={onStartGame}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    game: {
                        session: createSession(),
                        isSubmitting: false,
                        loadState: "ready",
                        connectionState: "open",
                        feedbackMessage: null
                    },
                    ui: {
                        selectedSquare: null
                    }
                }
            }
        );

        expect(screen.getByRole("button", { name: "Start Game" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "End Setup" })).toBeNull();
        expect(screen.queryByRole("button", { name: "End Game" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Skip Capture" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

        await user.click(screen.getByRole("button", { name: "Start Game" }));

        expect(onStartGame).toHaveBeenCalledTimes(1);
    });

    test("shows end setup during setup", async () => {
        const user = userEvent.setup();
        const onEndSetup = vi.fn();

        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onEndSetup={onEndSetup}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    game: {
                        session: createSession({}, { phase: "setup" }),
                        isSubmitting: false,
                        loadState: "ready",
                        connectionState: "open",
                        feedbackMessage: null
                    },
                    ui: {
                        selectedSquare: null
                    }
                }
            }
        );

        expect(screen.getByRole("button", { name: "End Setup" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
        expect(screen.queryByRole("button", { name: "End Game" })).toBeNull();

        await user.click(screen.getByRole("button", { name: "End Setup" }));

        expect(onEndSetup).toHaveBeenCalledTimes(1);
    });

    test("shows end game, skip capture, and undo during active play", () => {
        renderPanel(
            createSession({ canUndo: true }, {
                phase: "move",
                activeSide: "ravens"
            })
        );

        const buttons = screen.getAllByRole("button");
        expect(screen.getByRole("button", { name: "End Game" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Skip Capture" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
        expect(buttons.indexOf(screen.getByRole("button", { name: "End Game" }))).toBeGreaterThan(
            buttons.indexOf(screen.getByRole("button", { name: "Undo" }))
        );
    });

    test("enables capture skipping only during the capture phase", () => {
        renderPanel(
            createSession({}, {
                phase: "capture",
                activeSide: "ravens"
            })
        );

        expect(screen.getByRole("button", { name: "End Game" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Skip Capture" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    });
});
