import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerPicker } from "../../main/frontend/player-picker";

describe("PlayerPicker", () => {
    it("adds the selected player and bot", async () => {
        const user = userEvent.setup();
        const onAddMyself = vi.fn();
        const onAddPlayer = vi.fn();
        const onAddBot = vi.fn();
        const onCancel = vi.fn();

        render(
            <PlayerPicker
                players={[
                    { id: "p1", displayName: "Pat", authType: "local" },
                    { id: "p2", displayName: "Sam", authType: "guest" }
                ]}
                bots={[
                    { id: "randall", displayName: "Randall" },
                    { id: "simon", displayName: "Simon" }
                ]}
                currentUserId="current-user"
                onAddMyself={onAddMyself}
                onAddPlayer={onAddPlayer}
                onAddBot={onAddBot}
                onCancel={onCancel}
            />
        );

        await user.selectOptions(screen.getByLabelText("Choose player"), "p2");
        await user.click(screen.getByRole("button", { name: "Add Player" }));
        await user.selectOptions(screen.getByLabelText("Choose bot"), "simon");
        await user.click(screen.getByRole("button", { name: "Add Bot" }));
        await user.click(screen.getByRole("button", { name: "Add Myself" }));
        await user.click(screen.getByRole("button", { name: "Don't Add Anyone" }));

        expect(onAddPlayer).toHaveBeenCalledWith("p2");
        expect(onAddBot).toHaveBeenCalledWith("simon");
        expect(onAddMyself).toHaveBeenCalledOnce();
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("disables Add Player when no players are available", () => {
        render(
            <PlayerPicker
                players={[]}
                bots={[]}
                onAddMyself={vi.fn()}
                onAddPlayer={vi.fn()}
                onAddBot={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add Player" }).disabled).toBe(true);
        expect(screen.queryByRole("button", { name: "Add Bot" })).toBeNull();
    });

    it("excludes the current user and seated players from Add Player choices when second seats are not allowed", async () => {
        const user = userEvent.setup();
        const onAddPlayer = vi.fn();

        render(
            <PlayerPicker
                players={[
                    { id: "current-user", displayName: "Current User", authType: "local" },
                    { id: "seated-player", displayName: "Seated Player", authType: "local" },
                    { id: "other-player", displayName: "Other Player", authType: "guest" }
                ]}
                bots={[]}
                seatedPlayers={[{ id: "seated-player" }]}
                currentUserId="current-user"
                onAddMyself={vi.fn()}
                onAddPlayer={onAddPlayer}
                onAddBot={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(screen.queryByRole("option", { name: "Current User" })).toBeNull();
        expect(screen.queryByRole("option", { name: "Seated Player" })).toBeNull();
        expect(screen.queryByRole("option", { name: "Other Player" })).not.toBeNull();

        await user.click(screen.getByRole("button", { name: "Add Player" }));

        expect(onAddPlayer).toHaveBeenCalledWith("other-player");
    });

    it("keeps seated players in Add Player choices when second seats are allowed", () => {
        render(
            <PlayerPicker
                players={[
                    { id: "current-user", displayName: "Current User", authType: "local" },
                    { id: "seated-player", displayName: "Seated Player", authType: "local" },
                    { id: "other-player", displayName: "Other Player", authType: "guest" }
                ]}
                bots={[]}
                seatedPlayers={[{ id: "current-user" }, { id: "seated-player" }]}
                currentUserId="current-user"
                canCurrentUserTakeSecondSeat={true}
                onAddMyself={vi.fn()}
                onAddPlayer={vi.fn()}
                onAddBot={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(screen.queryByRole("option", { name: "Current User" })).toBeNull();
        expect(screen.queryByRole("option", { name: "Seated Player" })).not.toBeNull();
        expect(screen.queryByRole("option", { name: "Other Player" })).not.toBeNull();
    });

    it("disables Add Myself when the current user is already seated and cannot take a second seat", async () => {
        const user = userEvent.setup();
        const onAddMyself = vi.fn();

        render(
            <PlayerPicker
                players={[]}
                bots={[]}
                seatedPlayers={[{ id: "current-user" }]}
                currentUserId="current-user"
                canCurrentUserTakeSecondSeat={false}
                onAddMyself={onAddMyself}
                onAddPlayer={vi.fn()}
                onAddBot={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        const addMyself = screen.getByRole<HTMLButtonElement>("button", { name: "Add Myself" });
        expect(addMyself.disabled).toBe(true);

        await user.click(addMyself);

        expect(onAddMyself).not.toHaveBeenCalled();
    });

    it("allows Add Myself when the current user can take a second seat", async () => {
        const user = userEvent.setup();
        const onAddMyself = vi.fn();

        render(
            <PlayerPicker
                players={[]}
                bots={[]}
                seatedPlayers={[{ id: "current-user" }]}
                currentUserId="current-user"
                canCurrentUserTakeSecondSeat={true}
                onAddMyself={onAddMyself}
                onAddPlayer={vi.fn()}
                onAddBot={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        const addMyself = screen.getByRole<HTMLButtonElement>("button", { name: "Add Myself" });
        expect(addMyself.disabled).toBe(false);

        await user.click(addMyself);

        expect(onAddMyself).toHaveBeenCalledOnce();
    });
});
