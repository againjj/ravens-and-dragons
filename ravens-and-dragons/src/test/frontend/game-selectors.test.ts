import { describe, expect, test } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { gameActions } from "../../main/frontend/features/game/gameSlice.js";
import {
    selectBotAssignmentModel,
    selectBotAssignmentTargetSide,
    selectCanClaimDragons,
    selectCanAssignBotOpponent,
    selectCanClaimRavens,
    selectCanViewerAct,
    selectCanViewerUndo,
    selectIsBotAssignmentSupported,
    selectStatusText,
    selectTargetableSquares
} from "../../main/frontend/features/game/gameSelectors.js";
import { uiActions } from "../../main/frontend/features/ui/uiSlice.js";
import { createAuthSession, createSession } from "./fixtures.js";

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
        expect(targetableSquares).toHaveLength((7 * 7) - 3);
    });

    test("a player who owns both seats can act and undo even when the other side moved last", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession({
                    user: {
                        id: "player-dragons",
                        displayName: "Dragon Player",
                        authType: "local"
                    }
                })
            },
            game: {
                session: createSession(
                    {
                        canUndo: true,
                        undoOwnerSide: "ravens"
                    },
                    {
                        phase: "move",
                        activeSide: "ravens"
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectCanViewerAct(store.getState())).toBe(true);
        expect(selectCanViewerUndo(store.getState())).toBe(true);
        expect(selectCanClaimDragons(store.getState())).toBe(false);
        expect(selectCanClaimRavens(store.getState())).toBe(false);
    });

    test("grouped bot undo stays available for the player who made the last human move", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        canUndo: true,
                        undoOwnerSide: "dragons",
                        ravensBotId: "random"
                    },
                    {
                        phase: "move",
                        activeSide: "dragons"
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                ravensBot: {
                    id: "random",
                    displayName: "Randall"
                },
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectCanViewerUndo(store.getState())).toBe(true);
    });

    test("status text shows when a bot-controlled side is thinking", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        ravensBotId: "random"
                    },
                    {
                        phase: "move",
                        activeSide: "ravens"
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                availableBots: [{ id: "random", displayName: "Randall" }],
                isSubmitting: true,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("Randall is thinking...");
    });

    test("bot assignment is available when exactly one seat is claimed by the current user", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-rules",
                        ravensPlayerUserId: null
                    },
                    {
                        turns: []
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                availableBots: [
                    { id: "random", displayName: "Randall" },
                    { id: "simple", displayName: "Simon" }
                ],
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectIsBotAssignmentSupported(store.getState())).toBe(true);
        expect(selectBotAssignmentTargetSide(store.getState())).toBe("ravens");
        expect(selectCanAssignBotOpponent(store.getState())).toBe(true);
        expect(selectBotAssignmentModel(store.getState())).toMatchObject({
            targetSide: "ravens",
            canAssign: true,
            isSupported: true
        });
    });

    test("bot assignment is available for supported non-free-play rulesets before the first move", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "original-game",
                        ravensPlayerUserId: null
                    },
                    {
                        turns: []
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                availableBots: [{ id: "random", displayName: "Randall" }],
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectIsBotAssignmentSupported(store.getState())).toBe(true);
        expect(selectCanAssignBotOpponent(store.getState())).toBe(true);
    });

    test("bot assignment is hidden after the first move even on a supported ruleset", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "square-one-x-9",
                        ravensPlayerUserId: null
                    },
                    {
                        turns: [{ type: "move", from: "a1", to: "a2" }]
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                availableBots: [{ id: "random", displayName: "Randall" }],
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectIsBotAssignmentSupported(store.getState())).toBe(true);
        expect(selectCanAssignBotOpponent(store.getState())).toBe(false);
    });

    test("bot assignment stays hidden for unsupported rulesets", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "trivial"
                    },
                    {
                        turns: []
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                availableBots: [],
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectIsBotAssignmentSupported(store.getState())).toBe(false);
        expect(selectCanAssignBotOpponent(store.getState())).toBe(false);
    });

    test("bot assignment is hidden once both seats have been claimed", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-rules",
                        ravensPlayerUserId: "player-dragons"
                    },
                    {
                        turns: []
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: {
                    id: "player-dragons",
                    displayName: "Raven Player"
                },
                availableBots: [{ id: "random", displayName: "Randall" }],
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectBotAssignmentTargetSide(store.getState())).toBeNull();
        expect(selectCanAssignBotOpponent(store.getState())).toBe(false);
    });

    test("claiming a bot-controlled seat is hidden", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-rules",
                        ravensPlayerUserId: null,
                        ravensBotId: "random"
                    },
                    {
                        turns: []
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                ravensBot: {
                    id: "random",
                    displayName: "Randall"
                },
                availableBots: [{ id: "random", displayName: "Randall" }],
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectCanClaimRavens(store.getState())).toBe(false);
    });

    test("bot assignment model resolves pending optimistic bot labels", () => {
        const store = createAppStore({
            auth: {
                session: createAuthSession()
            },
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-rules",
                        ravensPlayerUserId: null,
                        ravensBotId: null
                    },
                    {
                        turns: []
                    }
                ),
                viewerRole: "dragons",
                dragonsPlayer: {
                    id: "player-dragons",
                    displayName: "Dragon Player"
                },
                ravensPlayer: null,
                availableBots: [
                    { id: "random", displayName: "Randall" },
                    { id: "simple", displayName: "Simon" }
                ],
                pendingBotAssignment: {
                    side: "ravens",
                    botId: "simple"
                },
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectBotAssignmentModel(store.getState())).toMatchObject({
            targetSide: "ravens",
            canAssign: true,
            ravensBot: {
                id: "simple",
                displayName: "Simon"
            }
        });
    });

    test("status text uses the no game copy when the session is idle", () => {
        const store = createAppStore({
            game: {
                session: createSession(),
                viewerRole: "dragons",
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("No game in progress. Select a play style and start the game.");
    });

    test("status text prompts spectators to claim a side when the session is idle", () => {
        const store = createAppStore({
            game: {
                session: createSession(),
                viewerRole: "spectator",
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe(
            "No game in progress. Claim a side or wait for someone else to start the game."
        );
    });

    test("status text uses manual-end wording after a free-play game ends", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        lifecycle: "finished"
                    },
                    {
                        turns: [{ type: "move", from: "a1", to: "a2" }, { type: "gameOver", outcome: "Game ended" }]
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("This game was ended manually. Go back to the lobby to create a new game.");
    });

    test("status text uses winner messaging when dragons win", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        lifecycle: "finished"
                    },
                    {
                        turns: [{ type: "move", from: "a1", to: "a2" }, { type: "gameOver", outcome: "Dragons win" }]
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe("Dragons win. Go back to the lobby to create a new game.");
    });

    test("status text uses explicit draw messaging when a game ends in a draw", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        lifecycle: "finished"
                    },
                    {
                        turns: [{ type: "move", from: "a1", to: "a2" }, { type: "gameOver", outcome: "Draw by no legal move" }]
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: null
            }
        });

        expect(selectStatusText(store.getState())).toBe(
            "This game ended in a draw by no legal move. Go back to the lobby to create a new game."
        );
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

    test("original game targetable squares exclude self captures even when the move would also capture an enemy", () => {
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
                            d6: "raven",
                            f6: "raven",
                            c5: "dragon",
                            e5: "dragon",
                            g5: "raven",
                            a4: "raven",
                            e4: "gold",
                            c3: "dragon",
                            e3: "raven",
                            f3: "raven",
                            b2: "raven",
                            d2: "dragon",
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
                selectedSquare: "e3"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).not.toContain("d3");
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

    test("sherwood rules only allow one-step gold targets", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-rules"
                    },
                    {
                        phase: "move",
                        ruleConfigurationId: "sherwood-rules",
                        activeSide: "dragons",
                        board: {
                            d5: "gold",
                            a7: "raven"
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

        expect(targetableSquares).toContain("c5");
        expect(targetableSquares).toContain("e5");
        expect(targetableSquares).toContain("d6");
        expect(targetableSquares).not.toContain("d7");
        expect(targetableSquares).not.toContain("a5");
    });

    test("sherwood x 9 only allows one-step gold targets on a 9x9 board", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-x-9"
                    },
                    {
                        boardSize: 9,
                        specialSquare: "e5",
                        phase: "move",
                        ruleConfigurationId: "sherwood-x-9",
                        activeSide: "dragons",
                        board: {
                            e6: "gold",
                            a9: "raven"
                        }
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "e6"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).toContain("d6");
        expect(targetableSquares).toContain("f6");
        expect(targetableSquares).toContain("e7");
        expect(targetableSquares).not.toContain("e9");
        expect(targetableSquares).not.toContain("a6");
    });

    test("square one only allows one-step gold targets", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "square-one"
                    },
                    {
                        phase: "move",
                        ruleConfigurationId: "square-one",
                        activeSide: "dragons",
                        board: {
                            d5: "gold",
                            a7: "raven"
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

        expect(targetableSquares).toContain("c5");
        expect(targetableSquares).toContain("e5");
        expect(targetableSquares).toContain("d6");
        expect(targetableSquares).not.toContain("d7");
        expect(targetableSquares).not.toContain("a5");
    });

    test("square one x 9 only allows one-step gold targets on a 9x9 board", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "square-one-x-9"
                    },
                    {
                        boardSize: 9,
                        specialSquare: "e5",
                        phase: "move",
                        ruleConfigurationId: "square-one-x-9",
                        activeSide: "dragons",
                        board: {
                            e6: "gold",
                            a9: "raven"
                        }
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "e6"
            }
        });

        const targetableSquares = selectTargetableSquares(store.getState());

        expect(targetableSquares).toContain("d6");
        expect(targetableSquares).toContain("f6");
        expect(targetableSquares).toContain("e7");
        expect(targetableSquares).not.toContain("e9");
        expect(targetableSquares).not.toContain("a6");
    });

    test("sherwood x 9 does not show targets for a stale gold selection when ravens are to move", () => {
        const store = createAppStore({
            game: {
                session: createSession(
                    {
                        selectedRuleConfigurationId: "sherwood-x-9"
                    },
                    {
                        boardSize: 9,
                        specialSquare: "e5",
                        phase: "move",
                        ruleConfigurationId: "sherwood-x-9",
                        activeSide: "ravens",
                        board: {
                            e5: "gold",
                            e8: "raven"
                        }
                    }
                ),
                isSubmitting: false,
                loadState: "ready",
                connectionState: "open",
                feedbackMessage: null
            },
            ui: {
                selectedSquare: "e5"
            }
        });

        expect(selectTargetableSquares(store.getState())).toEqual([]);
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
