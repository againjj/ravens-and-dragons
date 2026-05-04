import type { CSSProperties } from "react";

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Board } from "../../main/frontend/components/Board.js";
import { getColumnLetters } from "../../main/frontend/board-geometry.js";
import { createAuthSession } from "./fixtures.js";
import { createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const TestBoardScreen = ({ boardSize = 7 }: { boardSize?: number }) => (
    <div className="board-shell" style={{ "--board-dimension": String(boardSize) } as CSSProperties}>
        <Board />
        <div className="board-footer">
            <div className="board-footer-spacer" aria-hidden="true"></div>
            <div className="column-labels bottom" id="column-labels-bottom">
                {getColumnLetters(boardSize).map((letter) => (
                    <span key={letter}>{letter}</span>
                ))}
            </div>
        </div>
    </div>
);

describe("Board", () => {
    test("shows 7x7 row and column labels while square names stay letter-number", () => {
        renderWithStore(<TestBoardScreen />, {
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

    test("renders row and column labels from the shared board size", () => {
        renderWithStore(<TestBoardScreen boardSize={9} />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        boardSize: 9,
                        specialSquare: "e5",
                        phase: "none",
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
            }
        });

        const rowLabels = Array.from(document.querySelectorAll("#row-labels-left span")).map((element) => element.textContent);
        const columnLabels = Array.from(document.querySelectorAll("#column-labels-bottom span")).map((element) => element.textContent);

        expect(rowLabels).toEqual(["9", "8", "7", "6", "5", "4", "3", "2", "1"]);
        expect(columnLabels).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
        expect(screen.getByRole("button", { name: "Square e5" })).toBeInTheDocument();
    });

    test("marks the center and corner squares with the special styling class", () => {
        renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        boardSize: 9,
                        specialSquare: "e5",
                        phase: "none"
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

        expect(screen.getByRole("button", { name: "Square a1" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square a9" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square i1" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square i9" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square e5" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square e4" })).not.toHaveClass("special-square");
    });

    test("marks all four center squares on even-sized boards", () => {
        renderWithStore(<Board />, {
            preloadedState: {
                game: {
                    session: createSession({}, {
                        boardSize: 8,
                        specialSquare: "d4",
                        phase: "none"
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

        expect(screen.getByRole("button", { name: "Square d5" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square e5" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square d4" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square e4" })).toHaveClass("special-square");
        expect(screen.getByRole("button", { name: "Square c4" })).not.toHaveClass("special-square");
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

        const inactiveSquare = screen.getByRole("button", { name: "Square a1" });

        expect(inactiveSquare).toHaveClass("is-inactive");
        await user.click(inactiveSquare);

        expect(store.getState().ui.selectedSquare).toBeNull();
    });

    test("selects and deselects an owned piece during move phase", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                auth: {
                    session: createAuthSession()
                },
                game: {
                    session: createSession({}, {
                        phase: "move",
                        board: {
                            a1: "dragon",
                            d4: "gold",
                            b2: "raven"
                        }
                    }),
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
                auth: {
                    session: createAuthSession()
                },
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
        });

        expect(screen.getByRole("button", { name: "Square b2" })).toHaveClass("capture-target");
        expect(screen.getByRole("button", { name: "Square a1" })).not.toHaveClass("capture-target");
    });

    test("only shows pointer affordance for actionable squares", () => {
        renderWithStore(<Board />, {
            preloadedState: {
                auth: {
                    session: createAuthSession()
                },
                game: {
                    session: createSession({}, {
                        phase: "move",
                        activeSide: "dragons",
                        board: {
                            a1: "dragon",
                            b2: "raven"
                        }
                    }),
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
        });

        expect(screen.getByRole("button", { name: "Square a1" })).toHaveClass("is-clickable");
        expect(screen.getByRole("button", { name: "Square b2" })).not.toHaveClass("is-clickable");
        expect(screen.getByRole("button", { name: "Square c3" })).not.toHaveClass("is-clickable");
    });

    test("does not show move affordances to the wrong-side player", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                auth: {
                    session: createAuthSession({ user: { id: "player-ravens", displayName: "Raven Player", authType: "local" } })
                },
                game: {
                    session: createSession({}, {
                        phase: "move",
                        activeSide: "dragons",
                        board: {
                            a1: "dragon",
                            b2: "raven"
                        }
                    }),
                    viewerRole: "ravens",
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
        });

        const dragonsSquare = screen.getByRole("button", { name: "Square a1" });
        const ravensSquare = screen.getByRole("button", { name: "Square b2" });

        expect(dragonsSquare).not.toHaveClass("is-clickable");
        expect(ravensSquare).not.toHaveClass("is-clickable");

        await user.click(dragonsSquare);
        await user.click(ravensSquare);

        expect(store.getState().ui.selectedSquare).toBeNull();
    });

    test("does not show capture affordances to spectators", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(<Board />, {
            preloadedState: {
                auth: {
                    session: createAuthSession({ user: { id: "spectator", displayName: "Spectator", authType: "local" } })
                },
                game: {
                    session: createSession({}, {
                        phase: "capture",
                        activeSide: "dragons",
                        board: {
                            a1: "dragon",
                            b2: "raven"
                        }
                    }),
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
        });

        const captureTarget = screen.getByRole("button", { name: "Square b2" });

        expect(captureTarget).not.toHaveClass("capture-target");
        expect(captureTarget).not.toHaveClass("is-clickable");

        await user.click(captureTarget);

        expect(store.getState().ui.selectedSquare).toBeNull();
    });
});
