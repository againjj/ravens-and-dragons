import { screen, within } from "@testing-library/react";
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

    test("renders move rows in two columns with one turn number per pair", () => {
        renderWithStore(<MoveList />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        turns: [
                            { type: "move", from: "h5", to: "h7" },
                            { type: "move", from: "f5", to: "f2" },
                            { type: "move", from: "e3", to: "f3" },
                            { type: "move", from: "e4", to: "e3" },
                            { type: "move", from: "c5", to: "c3" },
                            { type: "move", from: "e6", to: "f6" }
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

        expect(items).toHaveLength(3);
        expect(within(items[0]).getByText("1.")).toBeInTheDocument();
        expect(items[0]).toHaveAttribute("value", "1");
        expect(within(items[0]).getByText("h5-h7")).toBeInTheDocument();
        expect(within(items[0]).getByText("f5-f2")).toBeInTheDocument();
        expect(within(items[1]).getByText("2.")).toBeInTheDocument();
        expect(items[1]).toHaveAttribute("value", "2");
        expect(within(items[1]).getByText("e3-f3")).toBeInTheDocument();
        expect(within(items[1]).getByText("e4-e3")).toBeInTheDocument();
        expect(within(items[2]).getByText("3.")).toBeInTheDocument();
        expect(items[2]).toHaveAttribute("value", "3");
        expect(within(items[2]).getByText("c5-c3")).toBeInTheDocument();
        expect(within(items[2]).getByText("e6-f6")).toBeInTheDocument();
    });

    test("renders the final move row with a single move when history length is odd", () => {
        renderWithStore(<MoveList />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        turns: [
                            { type: "move", from: "h5", to: "h7" },
                            { type: "move", from: "f5", to: "f2" },
                            { type: "move", from: "e3", to: "f3" }
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

        expect(items).toHaveLength(2);
        expect(items[1]).toHaveAttribute("value", "2");
        expect(within(items[1]).getByText("e3-f3")).toBeInTheDocument();
        expect(within(items[1]).queryByText("e4-e3")).toBeNull();
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
