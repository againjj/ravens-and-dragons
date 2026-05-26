import { describe, expect, it } from "vitest";

import { createGinRummyStore } from "../../main/frontend/gin-rummy-store";
import {
    loadGinRummyGame,
    runGinRummyCommand,
    setKnockChoices,
    setPendingEndAction,
    setRevealedTurnKey,
    updateCreateOptions
} from "../../main/frontend/gin-rummy-slice";
import type { GinRummyGame } from "../../main/frontend/gin-rummy-types";

const game = (overrides: Partial<GinRummyGame> = {}): GinRummyGame => ({
    id: "gin-1",
    gameSlug: "gin-rummy",
    version: 1,
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
        { userId: "user-2", displayName: "Grace" }
    ],
    dealerSeat: 0,
    currentSeat: 0,
    phase: "draw",
    gameNumber: 1,
    roundNumber: 1,
    stockCount: 21,
    discardTop: null,
    discardCount: 1,
    handCounts: [10, 10],
    scores: {
        gamePoints: [0, 0],
        totalPoints: [0, 0],
        gamesWon: [0, 0],
        handsWonThisGame: [0, 0],
        runningLines: []
    },
    roundResult: null,
    winnerSeat: null,
    message: null,
    viewer: {
        userId: "user-1",
        hands: { "0": [] },
        deadwood: { "0": 0 },
        knockOptions: {}
    },
    ...overrides
});

describe("Gin Rummy Redux state", () => {
    it("stores create options in the Gin Rummy slice", () => {
        const store = createGinRummyStore();

        store.dispatch(updateCreateOptions({
            targetScore: 250,
            playMode: "bestOfFiveMatch"
        }));

        expect(store.getState().ginRummy.createOptions).toMatchObject({
            targetScore: 250,
            playMode: "bestOfFiveMatch"
        });
    });

    it("tracks command submission and clears turn interaction state after a turn changes", () => {
        const store = createGinRummyStore();
        store.dispatch(loadGinRummyGame.fulfilled(game(), "load", "gin-1"));
        store.dispatch(setPendingEndAction("knock"));
        store.dispatch(setRevealedTurnKey("gin-1:1:0"));
        store.dispatch(setKnockChoices([{ type: "knock", cardId: "A_spades", arrangement: { melds: [], deadwood: ["A_spades"], deadwoodScore: 1 } }]));

        store.dispatch(runGinRummyCommand.pending("command", { game: game(), command: { type: "discard", cardId: "A_spades" } }));

        expect(store.getState().ginRummy.play.isSubmitting).toBe(true);

        store.dispatch(runGinRummyCommand.fulfilled(
            game({ version: 2, currentSeat: 1 }),
            "command",
            { game: game(), command: { type: "discard", cardId: "A_spades" } }
        ));

        expect(store.getState().ginRummy.play).toMatchObject({
            isSubmitting: false,
            pendingEndAction: null,
            revealedTurnKey: null,
            knockChoices: []
        });
        expect(store.getState().ginRummy.play.game?.currentSeat).toBe(1);
    });

    it("keeps newer game state when a stale command response arrives", () => {
        const store = createGinRummyStore();
        store.dispatch(loadGinRummyGame.fulfilled(game({ version: 3, currentSeat: 1 }), "load", "gin-1"));

        store.dispatch(runGinRummyCommand.fulfilled(
            game({ version: 2, currentSeat: 0 }),
            "command",
            { game: game({ version: 1 }), command: { type: "discard", cardId: "A_spades" } }
        ));

        expect(store.getState().ginRummy.play.game).toMatchObject({
            version: 3,
            currentSeat: 1
        });
    });
});
