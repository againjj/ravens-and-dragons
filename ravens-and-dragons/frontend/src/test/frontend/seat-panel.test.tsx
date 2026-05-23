import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SeatPanel } from "../../main/frontend/components/SeatPanel.js";
import { createAuthSession, createSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const { fetchUsersMock } = vi.hoisted(() => ({
    fetchUsersMock: vi.fn()
}));

vi.mock("../../main/frontend/game-client.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../main/frontend/game-client.js")>()),
    fetchUsers: fetchUsersMock
}));

describe("SeatPanel", () => {
    beforeEach(() => {
        fetchUsersMock.mockReset();
        fetchUsersMock.mockResolvedValue([
            { id: "player-dragons", displayName: "Dragon Player", authType: "local" },
            { id: "player-ravens", displayName: "Raven Player", authType: "local" },
            { id: "guest-player", displayName: "Guest Player", authType: "guest" }
        ]);
    });

    test("shows open seats as add player buttons and adds the viewer through the picker", async () => {
        const user = userEvent.setup();
        const onClaimDragons = vi.fn();

        renderWithStore(
            <SeatPanel
                onAssignBotOpponent={vi.fn()}
                onClaimDragons={onClaimDragons}
                onClaimRavens={vi.fn()}
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
        expect(screen.getByRole("button", { name: "Add Player" })).toBeEnabled();

        await user.click(screen.getByRole("button", { name: "Add Player" }));
        await user.click(screen.getByRole("button", { name: "Add Myself" }));

        expect(onClaimDragons).toHaveBeenCalledTimes(1);
    });

    test("adds a selected existing player and excludes the current user from the dropdown", async () => {
        const user = userEvent.setup();
        const onAssignPlayerSeat = vi.fn();

        renderWithStore(
            <SeatPanel
                onAssignBotOpponent={vi.fn()}
                onAssignPlayerSeat={onAssignPlayerSeat}
                onClaimDragons={vi.fn()}
                onClaimRavens={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession({ user: { id: "player-dragons", displayName: "Dragon Player", authType: "local" } })
                    },
                    game: {
                        session: createSession({ ravensPlayerUserId: null }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null
                    }
                }
            }
        );

        await user.click(screen.getByRole("button", { name: "Add Player" }));

        const playerSelect = await screen.findByRole("combobox", { name: "Choose player" });
        expect(screen.queryByRole("option", { name: "Dragon Player" })).toBeNull();

        await user.selectOptions(playerSelect, "guest-player");
        await user.click(screen.getAllByRole("button", { name: "Add Player" })[1]);

        expect(onAssignPlayerSeat).toHaveBeenCalledWith("ravens", "guest-player");
    });

    test("shows bot choices only for the legal bot opponent target", async () => {
        const user = userEvent.setup();
        const onAssignBotOpponent = vi.fn();

        renderWithStore(
            <SeatPanel
                onAssignBotOpponent={onAssignBotOpponent}
                onClaimDragons={vi.fn()}
                onClaimRavens={vi.fn()}
            />,
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
                            turns: [{ type: "move", from: "a1", to: "a2" }]
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

        await user.click(screen.getByRole("button", { name: "Add Player" }));
        const botSelect = screen.getByRole("combobox", { name: "Choose bot" });

        await user.selectOptions(botSelect, "simple");
        await user.click(screen.getByRole("button", { name: "Add Bot" }));

        expect(onAssignBotOpponent).toHaveBeenCalledWith("simple");
    });

    test("does not show bot choices when no bots are available", async () => {
        const user = userEvent.setup();

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
                        }),
                        viewerRole: "dragons",
                        dragonsPlayer: { id: "player-dragons", displayName: "Dragon Player" },
                        ravensPlayer: null,
                        availableBots: []
                    }
                }
            }
        );

        await user.click(screen.getByRole("button", { name: "Add Player" }));

        expect(screen.queryByRole("combobox", { name: "Choose bot" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Add Bot" })).toBeNull();
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
                            ravensBotId: "random"
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
        expect(screen.queryByRole("button", { name: "Add Bot" })).toBeNull();
    });
});
