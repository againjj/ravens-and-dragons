import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { MoveList } from "../../main/frontend/components/MoveList.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("MoveList", () => {
    test("scrolls to the end of the move list when history changes", () => {
        const scrollIntoView = vi.fn();
        vi.stubGlobal("HTMLElement", HTMLElement);
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = scrollIntoView;

        renderWithStore(<MoveList />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        turns: [{ type: "move", from: "a1", to: "a2" }]
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
        });

        expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });

        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    });

    test("renders an empty state before moves are made", () => {
        renderWithStore(<MoveList />, {
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
        });

        expect(screen.getByText("Moves will appear here once play begins.")).toBeInTheDocument();
        expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });

    test("renders game over without a turn number", () => {
        renderWithStore(<MoveList />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        turns: [
                            { type: "move", from: "a1", to: "a2", capturedSquares: ["b2", "c2"] },
                            { type: "gameOver", outcome: "Dragons win" }
                        ]
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
        });

        const items = screen.getAllByRole("listitem");

        expect(items[0]).toHaveTextContent("a1-a2xb2xc2");
        expect(items).toHaveLength(1);
        expect(screen.getByText("Game Over: Dragons win")).toBeInTheDocument();
        expect(screen.getByText("Game Over: Dragons win").tagName).toBe("DIV");
    });

    test("renders a manual free play ending as plain game over", () => {
        renderWithStore(<MoveList />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        turns: [
                            { type: "move", from: "a1", to: "a2" },
                            { type: "gameOver", outcome: "Game ended" }
                        ]
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
        });

        expect(screen.getByText("Game Over")).toBeInTheDocument();
        expect(screen.queryByText("Game Over: Game ended")).toBeNull();
    });
});
