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

        expect(screen.getByText((_, element) => element?.textContent === "Ravens: Raven Player")).toBeInTheDocument();
        expect(screen.getByText((_, element) => element?.textContent === "Dragons: Open seat")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Claim Ravens" })).toBeNull();
        expect(screen.getByRole("button", { name: "Claim Dragons" })).toBeEnabled();

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
                        ravensBot: { id: "random", displayName: "Randall" },
                        availableBots: [{ id: "random", displayName: "Randall" }]
                    }
                }
            }
        );

        expect(screen.getByText((_, element) => element?.textContent === "Ravens: Bot: Randall")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Claim Ravens" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Assign Bot To Ravens" })).toBeNull();
        expect(screen.queryByRole("combobox", { name: "Choose bot opponent" })).toBeNull();
    });

    test("shows a bot picker and assigns the selected bot for supported rulesets", async () => {
        const user = userEvent.setup();
        const onAssignBotOpponent = vi.fn();

        renderWithStore(
            <SeatPanel onAssignBotOpponent={onAssignBotOpponent} onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
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
                        availableBots: [
                            { id: "random", displayName: "Randall" },
                            { id: "simple", displayName: "Simon" },
                            { id: "minimax", displayName: "Maxine" },
                            { id: "deep-minimax", displayName: "Alphie" }
                        ]
                    }
                }
            }
        );

        const botSelect = screen.getByRole("combobox", { name: "Choose bot opponent" });

        expect(botSelect).toHaveValue("random");

        await user.selectOptions(botSelect, "simple");
        await user.click(screen.getByRole("button", { name: "Assign Bot To Ravens" }));

        expect(onAssignBotOpponent).toHaveBeenCalledTimes(1);
        expect(onAssignBotOpponent).toHaveBeenCalledWith("simple");
    });

    test("renders assigned minimax seats with the bot label", () => {
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
                            dragonsBotId: "minimax",
                            ravensBotId: null,
                            dragonsPlayerUserId: null
                        }, {
                            turns: []
                        }),
                        viewerRole: "ravens",
                        dragonsPlayer: null,
                        ravensPlayer: { id: "player-ravens", displayName: "Raven Player" },
                        dragonsBot: { id: "minimax", displayName: "Maxine" },
                        availableBots: [
                            { id: "minimax", displayName: "Maxine" },
                            { id: "deep-minimax", displayName: "Alphie" }
                        ]
                    }
                }
            }
        );

        expect(screen.getByText((_, element) => element?.textContent === "Dragons: Bot: Maxine")).toBeInTheDocument();
    });

    test("renders a pending bot assignment before refreshed bot metadata arrives", () => {
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
                            ravensBotId: null,
                            ravensPlayerUserId: null
                        }, {
                            turns: []
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null,
                        availableBots: [
                            { id: "random", displayName: "Randall" },
                            { id: "simple", displayName: "Simon" }
                        ],
                        pendingBotAssignment: {
                            side: "ravens",
                            botId: "simple"
                        }
                    }
                }
            }
        );

        expect(screen.getByText((_, element) => element?.textContent === "Ravens: Bot: Simon")).toBeInTheDocument();
    });

    test("renders claim actions before the bot assignment controls", () => {
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
                        availableBots: [
                            { id: "random", displayName: "Randall" },
                            { id: "simple", displayName: "Simon" }
                        ]
                    }
                }
            }
        );

        const actionButtons = screen.getAllByRole("button").map((button) => button.textContent);
        expect(actionButtons).toEqual(["Claim Ravens", "Assign Bot To Ravens"]);
        expect(screen.getByRole("combobox", { name: "Choose bot opponent" })).toBeInTheDocument();
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
                        availableBots: [{ id: "random", displayName: "Randall" }]
                    }
                }
            }
        );

        expect(screen.queryByRole("button", { name: "Assign Bot To Ravens" })).toBeNull();
        expect(screen.queryByRole("combobox", { name: "Choose bot opponent" })).toBeNull();
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
        expect(screen.queryByRole("combobox", { name: "Choose bot opponent" })).toBeNull();
    });
});
