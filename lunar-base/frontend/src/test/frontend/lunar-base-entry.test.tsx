import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { lunarBaseGameEntry } from "../../main/frontend/lunar-base-entry";

describe("lunarBaseGameEntry", () => {
    it("submits player count and influence options from the create screen", async () => {
        const user = userEvent.setup();
        const onStartGame = vi.fn();
        const CreateScreen = lunarBaseGameEntry.components.CreateScreen;

        render(<CreateScreen gameName="Lunar Base" onStartGame={onStartGame} />);

        fireEvent.change(screen.getByLabelText("Player count"), { target: { value: "5" } });
        await user.click(screen.getByLabelText("Use Influences"));
        await user.click(screen.getByRole("button", { name: "Start" }));

        expect(onStartGame).toHaveBeenCalledWith({
            publiclyListed: true,
            playerCount: 5,
            useInfluences: true
        });
    });
});
