import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { MoveList } from "../../main/frontend/components/MoveList.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("MoveList", () => {
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
});
