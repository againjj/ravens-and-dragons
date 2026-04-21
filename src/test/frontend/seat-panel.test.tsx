import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { SeatPanel } from "../../main/frontend/components/SeatPanel.js";
import { createAuthSession, createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("SeatPanel", () => {
    test("shows seat ownership and claim buttons for an authenticated spectator", async () => {
        const user = userEvent.setup();
        const onAssignBotOpponent = vi.fn();
        const onClaimDragons = vi.fn();
        const onClaimRavens = vi.fn();

        renderWithStore(
            <SeatPanel
                onAssignBotOpponent={onAssignBotOpponent}
                onClaimDragons={onClaimDragons}
                onClaimRavens={onClaimRavens}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession({ user: { id: "spectator", displayName: "Spectator", authType: "local" } })
                    },
                    game: {
                        viewerRole: "spectator",
                        dragonsPlayer: null,
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" }
                    }
                }
            }
        );

        expect(screen.getByText((_, element) => element?.textContent === "Dragons: Open seat")).toBeInTheDocument();
        expect(screen.getByText((_, element) => element?.textContent === "Ravens: Raven Player")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Claim Dragons" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "Claim Ravens" })).toBeNull();

        await user.click(screen.getByRole("button", { name: "Claim Dragons" }));

        expect(onClaimDragons).toHaveBeenCalledTimes(1);
        expect(onClaimRavens).not.toHaveBeenCalled();
        expect(onAssignBotOpponent).not.toHaveBeenCalled();
    });

    test("shows the remaining open claim button after the viewer has claimed a side", () => {
        renderWithStore(
            <SeatPanel onAssignBotOpponent={vi.fn()} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession({ user: { id: "player-dragons", displayName: "Dragon Player", authType: "local" } })
                    },
                    game: {
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null
                    }
                }
            }
        );

        expect(screen.queryByRole("button", { name: "Claim Dragons" })).toBeNull();
        expect(screen.getByRole("button", { name: "Claim Ravens" })).toBeEnabled();
    });

    test("renders bot-controlled seats with the bot label", () => {
        renderWithStore(
            <SeatPanel onAssignBotOpponent={vi.fn()} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession({
                            selectedRuleConfigurationId: "sherwood-rules",
                            dragonsBotId: null,
                            ravensBotId: "random"
                        }, {
                            turns: []
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null,
                        ravensBot: { id: "random", displayName: "Random" },
                        availableBots: [{ id: "random", displayName: "Random" }]
                    }
                }
            }
        );

        expect(screen.getByText((_, element) => element?.textContent === "Ravens: Bot: Random")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Claim Ravens" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Assign Bot To Ravens" })).toBeNull();
    });

    test("shows the bot assignment button for supported rulesets when the opposite seat is open", () => {
        renderWithStore(
            <SeatPanel onAssignBotOpponent={vi.fn()} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession({
                            selectedRuleConfigurationId: "square-one",
                            dragonsBotId: null,
                            ravensBotId: null,
                            ravensPlayerUserId: null
                        }, {
                            turns: []
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null,
                        ravensBot: null,
                        availableBots: [{ id: "random", displayName: "Random" }]
                    }
                }
            }
        );

        expect(screen.getByRole("button", { name: "Assign Bot To Ravens" })).toBeInTheDocument();
    });

    test("renders claim actions before the bot assignment action", () => {
        renderWithStore(
            <SeatPanel onAssignBotOpponent={vi.fn()} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession({
                            selectedRuleConfigurationId: "sherwood-rules",
                            ravensPlayerUserId: null
                        }, {
                            turns: []
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null,
                        availableBots: [{ id: "random", displayName: "Random" }]
                    }
                }
            }
        );

        const actionButtons = screen.getAllByRole("button").map((button) => button.textContent);
        expect(actionButtons).toEqual(["Claim Ravens", "Assign Bot To Ravens"]);
    });

    test("hides bot assignment when both seats are already claimed", () => {
        renderWithStore(
            <SeatPanel onAssignBotOpponent={vi.fn()} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession({
                            selectedRuleConfigurationId: "sherwood-rules",
                            ravensPlayerUserId: "player-dragons"
                        }, {
                            turns: []
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        availableBots: [{ id: "random", displayName: "Random" }]
                    }
                }
            }
        );

        expect(screen.queryByRole("button", { name: "Assign Bot To Ravens" })).toBeNull();
    });

    test("hides bot assignment for unsupported rulesets", () => {
        renderWithStore(
            <SeatPanel onAssignBotOpponent={vi.fn()} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    },
                    game: {
                        session: createSession({
                            selectedRuleConfigurationId: "free-play",
                            ravensPlayerUserId: null
                        }, {
                            turns: []
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null,
                        availableBots: []
                    }
                }
            }
        );

        expect(screen.queryByRole("button", { name: "Assign Bot To Ravens" })).toBeNull();
    });
});
