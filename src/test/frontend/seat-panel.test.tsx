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
        expect(screen.queryByRole("button", { name: "Assign Bot To Ravens" })).toBeNull();
    });

    test("shows the sherwood bot assignment button when the opposite seat is open", async () => {
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
                            selectedRuleConfigurationId: "sherwood-rules",
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

        await user.click(screen.getByRole("button", { name: "Assign Bot To Ravens" }));

        expect(onAssignBotOpponent).toHaveBeenCalledTimes(1);
    });
});
