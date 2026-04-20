import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { AuthPanel } from "../../main/frontend/components/AuthPanel.js";
import { createAuthSession } from "./fixtures.js";
import { renderWithStore } from "./test-utils.js";

describe("AuthPanel", () => {
    test("shows two sign-in panels with local, guest, oauth, and signup options when google auth is available", async () => {
        const user = userEvent.setup();
        const onContinueAsGuest = vi.fn();
        const onLogin = vi.fn();
        const onSignup = vi.fn();

        renderWithStore(
            <AuthPanel
                onContinueAsGuest={onContinueAsGuest}
                onLogin={onLogin}
                onSignup={onSignup}
                onLogout={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: {
                            authenticated: false,
                            user: null,
                            oauthProviders: ["google"]
                        }
                    }
                }
            }
        );

        expect(screen.getByRole("region", { name: "Sign in options" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Sign In" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
        expect(screen.getByText("Sign in with your account, as a guest, or with Google.")).toBeInTheDocument();
        expect(screen.getAllByText("Username")).toHaveLength(2);
        expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "Continue as Guest" }));
        await user.type(screen.getByLabelText("Username", { selector: "#login-username-input" }), "dragon");
        await user.type(screen.getByLabelText("Password", { selector: "#login-password-input" }), "password123");
        await user.click(screen.getByRole("button", { name: "Sign In" }));
        await user.type(screen.getByLabelText("Display Name"), "New Player");
        await user.type(screen.getByLabelText("Username", { selector: "#signup-username-input" }), "new-player");
        await user.type(screen.getByLabelText("Password", { selector: "#signup-password-input" }), "short");
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeDisabled();
        await user.clear(screen.getByLabelText("Display Name"));
        await user.type(screen.getByLabelText("Display Name"), "   ");
        await user.clear(screen.getByLabelText("Password", { selector: "#signup-password-input" }));
        await user.type(screen.getByLabelText("Password", { selector: "#signup-password-input" }), "password123");
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeDisabled();
        await user.clear(screen.getByLabelText("Display Name"));
        await user.type(screen.getByLabelText("Display Name"), "New Player");
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "Sign Up" }));
        expect(onContinueAsGuest).toHaveBeenCalledTimes(1);
        expect(onLogin).toHaveBeenCalledWith({ username: "dragon", password: "password123" });
        expect(onSignup).toHaveBeenCalledWith({
            username: "new-player",
            password: "password123",
            displayName: "New Player"
        });
    });

    test("hides the google sign-in button when oauth is not configured", () => {
        renderWithStore(
            <AuthPanel
                onContinueAsGuest={vi.fn()}
                onLogin={vi.fn()}
                onSignup={vi.fn()}
                onLogout={vi.fn()}
            />
        );

        expect(screen.getByText("Sign in with your account or as a guest.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Sign in with Google" })).not.toBeInTheDocument();
    });

    test("shows the current user and logout when signed in", async () => {
        const user = userEvent.setup();
        const onLogout = vi.fn();

        renderWithStore(
            <AuthPanel
                onContinueAsGuest={vi.fn()}
                onLogin={vi.fn()}
                onSignup={vi.fn()}
                onLogout={onLogout}
            />,
            {
                preloadedState: {
                    auth: {
                        session: createAuthSession()
                    }
                }
            }
        );

        expect(screen.getByText(/Signed in as/)).toHaveTextContent("Dragon Player");
        await user.click(screen.getByRole("button", { name: "Log Out" }));
        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    test("shows auth errors in a popup that can be dismissed", async () => {
        const user = userEvent.setup();

        const { store } = renderWithStore(
            <AuthPanel
                onContinueAsGuest={vi.fn()}
                onLogin={vi.fn()}
                onSignup={vi.fn()}
                onLogout={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: {
                            authenticated: false,
                            user: null
                        },
                        isSubmitting: false,
                        loadState: "ready",
                        feedbackMessage: "Unable to sign in right now."
                    }
                }
            }
        );

        expect(screen.getByRole("dialog", { name: "Sign In Error" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "OK" }));
        expect(store.getState().auth.feedbackMessage).toBeNull();
    });

    test("clicking outside the popup dismisses the auth error", async () => {
        const user = userEvent.setup();
        const { store } = renderWithStore(
            <AuthPanel
                onContinueAsGuest={vi.fn()}
                onLogin={vi.fn()}
                onSignup={vi.fn()}
                onLogout={vi.fn()}
            />,
            {
                preloadedState: {
                    auth: {
                        session: {
                            authenticated: false,
                            user: null
                        },
                        isSubmitting: false,
                        loadState: "ready",
                        feedbackMessage: "Unable to continue as a guest right now."
                    }
                }
            }
        );

        await user.click(screen.getByRole("presentation"));
        expect(store.getState().auth.feedbackMessage).toBeNull();
    });
});
