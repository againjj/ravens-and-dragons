import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { App } from "../../main/frontend/App.js";
import { Board } from "../../main/frontend/components/Board.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

vi.mock("../../main/frontend/features/game/useGameSession.js", () => ({
    useGameSession: () => undefined
}));

vi.mock("../../main/frontend/hooks/useBoardSizing.js", () => ({
    useBoardSizing: () => undefined
}));

vi.mock("../../main/frontend/hooks/useFullscreen.js", () => ({
    useFullscreen: () => ({
        toggleFullscreen: async () => ({ message: null })
    })
}));

describe("Board", () => {
    test("shows 7x7 row and column labels while square names stay letter-number", () => {
        renderWithStore(<App />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        phase: "none",
                        board: {
                            a1: "dragon",
                            d4: "gold"
                        }
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

        const rowLabels = Array.from(document.querySelectorAll("#row-labels-left span")).map((element) => element.textContent);
        const columnLabels = Array.from(document.querySelectorAll("#column-labels-bottom span")).map((element) => element.textContent);

        expect(rowLabels).toEqual(["7", "6", "5", "4", "3", "2", "1"]);
        expect(columnLabels).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
        expect(screen.getByRole("button", { name: "Square a1" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Square d4" })).toBeInTheDocument();
    });

    test("does not select pieces when no game is in progress", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        phase: "none",
                        board: {
                            a1: "dragon"
                        }
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

        await user.click(screen.getByRole("button", { name: "Square a1" }));

        expect(store.getState().ui.selectedSquare).toBeNull();
    });

    test("selects and deselects an owned piece during move phase", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        phase: "move",
                        board: {
                            a1: "dragon",
                            d4: "gold",
                            b2: "raven"
                        }
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

        const a1Square = screen.getByRole("button", { name: "Square a1" });

        await user.click(a1Square);
        expect(store.getState().ui.selectedSquare).toBe("a1");
        expect(a1Square).toHaveClass("selected");

        await user.click(a1Square);
        expect(store.getState().ui.selectedSquare).toBeNull();
        expect(a1Square).not.toHaveClass("selected");
    });

    test("does not select an opposing piece during move phase", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        phase: "move",
                        activeSide: "dragons",
                        board: {
                            a1: "dragon",
                            b2: "raven",
                            d4: "gold"
                        }
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

        await user.click(screen.getByRole("button", { name: "Square b2" }));

        expect(store.getState().ui.selectedSquare).toBeNull();
    });

    test("marks capturable squares during capture phase", () => {
        renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        phase: "capture",
                        activeSide: "dragons",
                        board: {
                            a1: "dragon",
                            b2: "raven",
                            d4: "gold"
                        }
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

        expect(screen.getByRole("button", { name: "Square b2" })).toHaveClass("capture-target");
        expect(screen.getByRole("button", { name: "Square a1" })).not.toHaveClass("capture-target");
    });
});
