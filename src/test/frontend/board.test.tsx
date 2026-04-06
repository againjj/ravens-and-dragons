import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { Board } from "../../main/frontend/components/Board.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("Board", () => {
    test("selects and deselects an owned piece during move phase", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        phase: "move",
                        board: {
                            a1: "dragon",
                            e5: "gold",
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
                            e5: "gold"
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
                            e5: "gold"
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
