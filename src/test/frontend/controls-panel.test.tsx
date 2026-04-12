import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ControlsPanel } from "../../main/frontend/components/ControlsPanel.js";
import { createAuthSession, createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const renderPanel = (
    session = createSession(),
    gameOverrides: Record<string, unknown> = {},
    authOverrides: Record<string, unknown> = {}
) =>
    renderWithStore(
        <ControlsPanel
            onStartGame={vi.fn()}
            onSelectRuleConfiguration={vi.fn()}
            onSelectStartingSide={vi.fn()}
            onSelectBoardSize={vi.fn()}
            onEndSetup={vi.fn()}
            onEndGame={vi.fn()}
            onUndo={vi.fn()}
            onSkipCapture={vi.fn()}
        />,
        {
            preloadedState: {
                auth: {
                    session: {
                        ...createAuthSession(),
                        ...authOverrides
                    }
                },
                game: {
                    session,
                    viewerRole: session.snapshot.activeSide,
                    dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                    ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
                    isSubmitting: false,
                    loadState: "ready",
                    connectionState: "open",
                    feedbackMessage: null,
                    ...gameOverrides
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
                onSelectBoardSize={vi.fn()}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession(),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
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
        expect(screen.getByLabelText("Board Size")).toHaveValue("7");
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
                onSelectBoardSize={vi.fn()}
                onEndSetup={onEndSetup}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession({}, { phase: "setup" }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
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
            createSession(
                {
                    canUndo: true,
                    undoOwnerSide: "dragons",
                    lifecycle: "active"
                },
                {
                    phase: "move",
                    activeSide: "ravens"
                }
            ),
            {
                viewerRole: "ravens"
            },
            {
                user: { id: "player-ravens", displayName: "Raven Player", authType: "local" }
            }
        );

        const buttons = screen.getAllByRole("button");
        expect(screen.getByRole("button", { name: "End Game" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Skip Capture" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
        expect(buttons.indexOf(screen.getByRole("button", { name: "End Game" }))).toBeGreaterThan(
            buttons.indexOf(screen.getByRole("button", { name: "Undo" }))
        );
    });

    test("enables undo for the player who made the last move", () => {
        renderPanel(
            createSession(
                {
                    canUndo: true,
                    undoOwnerSide: "dragons",
                    lifecycle: "active"
                },
                {
                    phase: "move",
                    activeSide: "ravens"
                }
            ),
            {
                viewerRole: "dragons"
            }
        );

        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "End Game" })).toBeDisabled();
    });

    test("enables capture skipping only during the capture phase", () => {
        renderPanel(
            createSession(
                {
                    lifecycle: "active"
                },
                {
                    phase: "capture",
                    activeSide: "ravens"
                }
            )
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
                onSelectBoardSize={vi.fn()}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession(),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
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
                onSelectBoardSize={vi.fn()}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession(),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
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

    test("changes the selected board size in free play", async () => {
        const user = userEvent.setup();
        const onSelectBoardSize = vi.fn();

        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onSelectRuleConfiguration={vi.fn()}
                onSelectStartingSide={vi.fn()}
                onSelectBoardSize={onSelectBoardSize}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession(),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
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

        await user.selectOptions(screen.getByLabelText("Board Size"), "9");

        expect(onSelectBoardSize).toHaveBeenCalledWith(9);
    });

    test("hides manual capture and manual end controls for automatic configurations", () => {
        renderPanel(
            createSession(
                {
                    lifecycle: "active",
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
        expect(screen.queryByLabelText("Board Size")).toBeNull();
        expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    });

    test("hides start controls after a game has finished", () => {
        renderPanel(
            createSession(
                {
                    lifecycle: "finished",
                    canUndo: true,
                    undoOwnerSide: "dragons"
                },
                {
                    turns: [{ type: "move", from: "a1", to: "a2" }, { type: "gameOver", outcome: "Dragons win" }]
                }
            )
        );

        expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
        expect(screen.queryByLabelText("Play Style")).toBeNull();
        expect(screen.queryByLabelText("Starting Side")).toBeNull();
        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "End Game" })).toBeNull();
    });

    test("disables game actions for a spectator", () => {
        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onSelectRuleConfiguration={vi.fn()}
                onSelectStartingSide={vi.fn()}
                onSelectBoardSize={vi.fn()}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession({ user: { id: "spectator", displayName: "Spectator", authType: "local" } })
                    },
                    game: {
                        session: createSession(),
                        viewerRole: "spectator",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
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

        expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
        expect(screen.queryByLabelText("Play Style")).toBeNull();
        expect(screen.queryByLabelText("Starting Side")).toBeNull();
        expect(screen.queryByLabelText("Board Size")).toBeNull();
    });

    test("hides pre-game controls when the viewer has not claimed a seat", () => {
        renderWithStore(
            <ControlsPanel
                onStartGame={vi.fn()}
                onSelectRuleConfiguration={vi.fn()}
                onSelectStartingSide={vi.fn()}
                onSelectBoardSize={vi.fn()}
                onEndSetup={vi.fn()}
                onEndGame={vi.fn()}
                onUndo={vi.fn()}
                onSkipCapture={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession({ user: { id: "spectator", displayName: "Spectator", authType: "local" } })
                    },
                    game: {
                        session: createSession(),
                        viewerRole: "spectator",
                        dragonsPlayer: null,
                        ravensPlayer: null,
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

        expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
        expect(screen.queryByLabelText("Play Style")).toBeNull();
        expect(screen.queryByLabelText("Starting Side")).toBeNull();
        expect(screen.queryByLabelText("Board Size")).toBeNull();
        expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });
});
