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
            onSelectRuleConfiguration={vi.fn()}
            onSelectStartingSide={vi.fn()}
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
                onSelectRuleConfiguration={vi.fn()}
                onSelectStartingSide={vi.fn()}
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

        expect(screen.getByLabelText("Play Style")).toHaveValue("free-play");
        expect(screen.getByLabelText("Starting Side")).toHaveValue("dragons");
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
                onSelectRuleConfiguration={vi.fn()}
                onSelectStartingSide={vi.fn()}
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

    test("changes the selected play style in the no game state", async () => {
        const user = userEvent.setup();
        const onSelectRuleConfiguration = vi.fn();

        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onSelectRuleConfiguration={onSelectRuleConfiguration}
                onSelectStartingSide={vi.fn()}
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

        await user.selectOptions(screen.getByLabelText("Play Style"), "trivial");

        expect(onSelectRuleConfiguration).toHaveBeenCalledWith("trivial");
    });

    test("changes the selected starting side in free play", async () => {
        const user = userEvent.setup();
        const onSelectStartingSide = vi.fn();

        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onSelectRuleConfiguration={vi.fn()}
                onSelectStartingSide={onSelectStartingSide}
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

        await user.selectOptions(screen.getByLabelText("Starting Side"), "ravens");

        expect(onSelectStartingSide).toHaveBeenCalledWith("ravens");
    });

    test("hides manual capture and manual end controls for automatic configurations", () => {
        renderPanel(
            createSession(
                {
                    selectedRuleConfigurationId: "original-game"
                },
                {
                    phase: "move",
                    ruleConfigurationId: "original-game"
                }
            )
        );

        expect(screen.queryByRole("button", { name: "Skip Capture" })).toBeNull();
        expect(screen.queryByRole("button", { name: "End Game" })).toBeNull();
        expect(screen.queryByLabelText("Starting Side")).toBeNull();
        expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    });
});
