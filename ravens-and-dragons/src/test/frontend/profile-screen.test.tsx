import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ProfileScreen } from "../../main/frontend/components/ProfileScreen.js";
import { createAppStore } from "../../main/frontend/app/store.js";
import { createAuthSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

const {
    deleteLocalAccountMock,
    loadLocalProfileMock,
    updateLocalProfileMock
} = vi.hoisted(() => ({
    deleteLocalAccountMock: vi.fn(),
    loadLocalProfileMock: vi.fn(),
    updateLocalProfileMock: vi.fn()
}));

vi.mock("../../main/frontend/features/auth/authThunks.js", () => ({
    deleteLocalAccount: deleteLocalAccountMock,
    loadLocalProfile: loadLocalProfileMock,
    updateLocalProfile: updateLocalProfileMock
}));

describe("ProfileScreen", () => {
    test("prefills the display name and submits updates", async () => {
        const user = userEvent.setup();
        loadLocalProfileMock.mockReturnValue({ type: "auth/loadLocalProfile" });
        updateLocalProfileMock.mockReturnValue({ type: "auth/updateLocalProfile" });
        const store = createAppStore({
            auth: {
                session: createAuthSession(),
                profile: {
                    id: "player-dragons",
                    username: "player-dragons",
                    displayName: "Dragon Player"
                },
                profileLoadState: "ready"
            }
        });
        const dispatchSpy = vi.spyOn(store, "dispatch");

        renderWithStore(
            <ProfileScreen />,
            {
                store
            }
        );

        expect(loadLocalProfileMock).toHaveBeenCalledTimes(1);
        expect(dispatchSpy).toHaveBeenCalledWith({ type: "auth/loadLocalProfile" });
        expect(screen.getByRole("heading", { name: "Name" })).toBeInTheDocument();
        expect(screen.getByText("Username:")).toHaveTextContent("player-dragons");
        expect(screen.getByText("Current display name:")).toHaveTextContent("Dragon Player");
        expect(screen.getByLabelText("New Display Name")).toHaveValue("Dragon Player");

        await user.clear(screen.getByLabelText("New Display Name"));
        await user.type(screen.getByLabelText("New Display Name"), "Renamed Player");
        await user.click(screen.getByRole("button", { name: "Update" }));

        expect(updateLocalProfileMock).toHaveBeenCalledWith({ displayName: "Renamed Player" });
        expect(dispatchSpy).toHaveBeenCalledWith({ type: "auth/updateLocalProfile" });
    });

    test("surfaces delete account for local accounts", async () => {
        const user = userEvent.setup();
        loadLocalProfileMock.mockReturnValue({ type: "auth/loadLocalProfile" });
        deleteLocalAccountMock.mockReturnValue({ type: "auth/deleteLocalAccount" });
        const store = createAppStore({
            auth: {
                session: createAuthSession(),
                profile: {
                    id: "player-dragons",
                    username: "player-dragons",
                    displayName: "Dragon Player"
                },
                profileLoadState: "ready"
            }
        });
        const dispatchSpy = vi.spyOn(store, "dispatch");

        renderWithStore(
            <ProfileScreen />,
            {
                store
            }
        );

        expect(screen.getByRole("heading", { name: "Account deletion" })).toBeInTheDocument();
        expect(screen.getByText("Enter your password to delete your account.")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Confirm Password"), "password123");
        await user.click(screen.getByRole("button", { name: "Delete Account" }));

        expect(deleteLocalAccountMock).toHaveBeenCalledWith({ password: "password123" });
        expect(dispatchSpy).toHaveBeenCalledWith({ type: "auth/deleteLocalAccount" });
    });
});
