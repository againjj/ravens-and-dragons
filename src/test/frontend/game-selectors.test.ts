import { describe, expect, test } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { gameActions } from "../../main/frontend/features/game/gameSlice.js";
import { selectStatusText, selectTargetableSquares } from "../../main/frontend/features/game/gameSelectors.js";
import { boardDimension } from "../../main/frontend/game.js";
import { uiActions } from "../../main/frontend/features/ui/uiSlice.js";
import { createSession } from "./fixtures.js";

describe("game selectors", () => {
    test("status text prefers feedback messages over snapshot-derived text", () => {
        const store = createAppStore({
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
        });

        store.dispatch(gameActions.feedbackMessageSet("Fullscreen is not available in this browser."));

        expect(selectStatusText(store.getState())).toBe("Fullscreen is not available in this browser.");
    });

    test("targetable squares come from the selected square and current snapshot", () => {
        const store = createAppStore({
            game: {
                session: createSession({}, {
                    phase: "move",
                    board: {
                        e5: "gold",
                        a1: "dragon",
                        b2: "raven"
                    }
                }),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "a1"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).toContain("c3");
        expect(targetableSquares).not.toContain("a1");
        expect(targetableSquares).not.toContain("b2");
        expect(targetableSquares).toHaveLength((boardDimension * boardDimension) - 3);
    });

    test("status text uses the updated setup copy", () => {
        const store = createAppStore({
            game: {
                session: createSession({}, {
                    phase: "setup"
                }),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("Setup phase: place the pieces on the board.");
    });

    test("status text uses the no game copy before a game starts", () => {
        const store = createAppStore({
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
        });

        expect(selectStatusText(store.getState())).toBe("No game in progress. Start a game to enter setup.");
    });

    test("status text uses the game over copy after ending a game", () => {
        const store = createAppStore({
            game: {
                session: createSession({}, {
                    turns: [{ type: "move", from: "a1", to: "a2" }, { type: "gameOver", outcome: "Dragons win" }]
                }),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("Game over. Start a new game when you're ready.");
    });

    test("status text omits the extra gold reminder during move phase", () => {
        const store = createAppStore({
            game: {
                session: createSession({}, {
                    phase: "move",
                    activeSide: "dragons"
                }),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("Dragons to move.");
    });

    test("status text uses the generic capture copy during capture phase", () => {
        const store = createAppStore({
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
        });

        expect(selectStatusText(store.getState())).toBe("Ravens moved. Capture a piece, or skip the capture.");
    });

    test("original game targetable squares only include legal orthogonal moves", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "original-game"
                    },
                    {
                        phase: "move",
                        ruleConfigurationId: "original-game",
                        board: {
                            d4: "gold",
                            d5: "dragon",
                            d7: "raven"
                        }
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "d5"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).toContain("a5");
        expect(targetableSquares).toContain("g5");
        expect(targetableSquares).not.toContain("d7");
        expect(targetableSquares).not.toContain("d4");
        expect(targetableSquares).not.toContain("a1");
    });

    test("original game targetable squares exclude self-capturing moves", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "original-game"
                    },
                    {
                        phase: "move",
                        ruleConfigurationId: "original-game",
                        activeSide: "ravens",
                        board: {
                            b4: "raven",
                            c1: "dragon",
                            g7: "gold"
                        }
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "b4"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).not.toContain("b1");
    });

    test("original game targetable squares exclude moves that expose other friendly pieces to capture", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "original-game"
                    },
                    {
                        phase: "move",
                        ruleConfigurationId: "original-game",
                        activeSide: "dragons",
                        board: {
                            d7: "raven",
                            f7: "raven",
                            d6: "raven",
                            d5: "dragon",
                            a4: "raven",
                            b4: "raven",
                            c4: "dragon",
                            d4: "gold",
                            f4: "dragon",
                            d3: "dragon",
                            e2: "raven",
                            d1: "raven"
                        }
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "d4"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).not.toContain("e4");
    });

    test("local selection can be updated independently of the shared session", () => {
        const store = createAppStore({
            game: {
                session: createSession({}, {
                    phase: "move",
                    board: {
                        a1: "dragon",
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
        });

        store.dispatch(uiActions.selectedSquareSet("a1"));

        expect(store.getState().ui.selectedSquare).toBe("a1");
    });
});
