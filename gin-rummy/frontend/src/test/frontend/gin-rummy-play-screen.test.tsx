import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GinRummyPlayScreen } from "../../main/frontend/GinRummyPlayScreen";
import { loadGinRummyGame } from "../../main/frontend/gin-rummy-slice";
import { createGinRummyStore } from "../../main/frontend/gin-rummy-store";
import type { GinRummyGame } from "../../main/frontend/gin-rummy-types";

class MockEventSource {
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {}

    addEventListener = vi.fn();
    close = vi.fn();
}

const game = (overrides: Partial<GinRummyGame> = {}): GinRummyGame => ({
    id: "gin-1",
    gameSlug: "gin-rummy",
    version: 2,
    lifecycle: "ACTIVE",
    config: {
        targetScore: 100,
        playMode: "singleGame",
        bigGinAllowed: false,
        optionalDealRule: true,
        lineBonusEnabled: false,
        aceHighAllowed: true
    },
    seats: [
        { userId: "user-1", displayName: "Ada" },
        { userId: "user-1", displayName: "Ada" }
    ],
    dealerSeat: 0,
    currentSeat: 1,
    phase: "discardOnly",
    gameNumber: 1,
    roundNumber: 2,
    stockCount: 31,
    discardTop: null,
    discardCount: 0,
    handCounts: [11, 10],
    scores: {
        gamePoints: [18, 0],
        totalPoints: [18, 0],
        gamesWon: [0, 0],
        handsWonThisGame: [1, 0],
        runningLines: []
    },
    roundResult: {
        winnerSeat: 0,
        points: 18,
        reason: "Knock",
        gameNumber: 1,
        roundNumber: 1,
        knockerSeat: 0,
        knockerDeadwood: 7,
        defenderDeadwood: 25,
        selectedMelds: [],
        selectedDeadwood: [],
        defenderMelds: [],
        defenderDeadwoodCards: [],
        layoffs: [],
        scoreLines: []
    },
    winnerSeat: null,
    message: null,
    viewer: {
        userId: "user-1",
        hands: { "0": [], "1": [] },
        deadwood: { "0": 0, "1": 0 },
        knockOptions: {}
    },
    ...overrides
});

beforeEach(() => {
    window.history.pushState({}, "", "/g/gin-1");
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url === "/api/auth/session") {
            return Response.json({ user: { id: "user-1", displayName: "Ada" } });
        }
        return Response.json(game());
    }));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("Gin Rummy play screen", () => {
    it("does not apply the app modal backdrop dimmer to the local hand result overlay", () => {
        const store = createGinRummyStore();
        store.dispatch(loadGinRummyGame.fulfilled(game(), "load", "gin-1"));

        render(
            <Provider store={store}>
                <GinRummyPlayScreen />
            </Provider>
        );

        const resultDialog = screen.getByRole("dialog", { name: "Hand result" });
        const localBackdrop = resultDialog.parentElement;

        expect(localBackdrop?.classList.contains("gin-local-backdrop")).toBe(true);
        expect(localBackdrop?.classList.contains("modal-backdrop")).toBe(false);
        expect(document.querySelectorAll(".gin-content-dim")).toHaveLength(1);
    });
});
