import { screen } from "@testing-library/react";
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
    test("shows no live-game controls while no game is in progress", () => {
        renderPanel(createSession());

        expect(screen.queryByRole("button", { name: "End Game" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Skip Capture" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
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

    test("enables undo in bot games when the backend reports a grouped exchange is available", () => {
        renderPanel(
            createSession(
                {
                    canUndo: true,
                    undoOwnerSide: "dragons",
                    lifecycle: "active",
                    ravensBotId: "random"
                },
                {
                    phase: "move",
                    activeSide: "dragons"
                }
            ),
            {
                viewerRole: "dragons",
                ravensBot: { id: "random", displayName: "Randall" }
            }
        );

        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
        expect(screen.queryByText("Undo reverses your last move and the bot reply.")).toBeNull();
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

    test("lets a player who owns both sides act and undo after the other side moves", () => {
        renderPanel(
            createSession(
                {
                    canUndo: true,
                    undoOwnerSide: "ravens",
                    lifecycle: "active",
                    dragonsPlayerUserId: "player-dragons",
                    ravensPlayerUserId: "player-dragons"
                },
                {
                    phase: "move",
                    activeSide: "ravens"
                }
            ),
            {
                viewerRole: "dragons",
                dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                ravensPlayer: { id: "player-dragons", displayName: "Dragon Player" }
            },
            {
                user: { id: "player-dragons", displayName: "Dragon Player", authType: "local" }
            }
        );

        expect(screen.getByRole("button", { name: "End Game" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
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
        expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    });

    test("shows undo but not active-play controls after a game has finished", () => {
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

        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "End Game" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Skip Capture" })).toBeNull();
    });
});
