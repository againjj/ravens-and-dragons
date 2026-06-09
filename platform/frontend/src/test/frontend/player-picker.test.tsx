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

    it("disables Add Myself when the current user cannot be added", async () => {
        const user = userEvent.setup();
        const onAddMyself = vi.fn();

        render(
            <PlayerPicker
                players={[]}
                bots={[]}
                addMyselfDisabled={true}
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
});
