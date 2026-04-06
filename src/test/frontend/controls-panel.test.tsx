import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ControlsPanel } from "../../main/frontend/components/ControlsPanel.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("ControlsPanel", () => {
    test("enables the start button during setup and calls the handler", async () => {
        const user = userEvent.setup();
        const onStartGame = vi.fn();

        renderWithStore(
            <ControlsPanel
                onStartGame={onStartGame}
                onResetGame={vi.fn()}
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

        const startButton = screen.getByRole("button", { name: "Start Game" });
        const skipButton = screen.getByRole("button", { name: "Skip Capture" });

        expect(startButton).toBeEnabled();
        expect(skipButton).toBeDisabled();

        await user.click(startButton);

        expect(onStartGame).toHaveBeenCalledTimes(1);
    });

    test("enables capture skipping only during the capture phase", () => {
        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onResetGame={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    game: {
                        session: createSession({}, {
                            phase: "capture",
                            activeSide: "ravens"
                        }),
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

        expect(screen.getByRole("button", { name: "Skip Capture" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Start Game" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Reset to Setup" })).toBeEnabled();
    });
});
