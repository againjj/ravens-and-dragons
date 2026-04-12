import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { SeatPanel } from "../../main/frontend/components/SeatPanel.js";
import { createAuthSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("SeatPanel", () => {
    test("shows seat ownership and claim buttons for an authenticated spectator", async () => {
        const user = userEvent.setup();
        const onClaimDragons = vi.fn();
        const onClaimRavens = vi.fn();

        renderWithStore(
            <SeatPanel onClaimDragons={onClaimDragons} onClaimRavens={onClaimRavens} />,
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

        expect(
            screen.getByText((_, element) => element?.textContent === "Dragons: Open seat")
        ).toBeInTheDocument();
        expect(
            screen.getByText((_, element) => element?.textContent === "Ravens: Raven Player")
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Claim Dragons" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Claim Ravens" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Claim Dragons" }));

        expect(onClaimDragons).toHaveBeenCalledTimes(1);
        expect(onClaimRavens).not.toHaveBeenCalled();
    });

    test("hides claim buttons after the viewer has claimed a side", () => {
        renderWithStore(
            <SeatPanel onClaimDragons={vi.fn()} onClaimRavens={vi.fn()} />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
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
        expect(screen.queryByRole("button", { name: "Claim Ravens" })).toBeNull();
    });
});
