import { describe, expect, test } from "vitest";

import { createAppStore } from "../../main/frontend/app/store.js";
import { createGameDraftActions } from "../../main/frontend/features/game/createGameSlice.js";
import {
    selectCreateGameAvailableRuleConfigurations,
    selectCreateGameCanEditBoard,
    selectCreateGameCurrentRuleConfiguration,
    selectCreateGameIsActive,
    selectCreateGameSelectedBoardSize,
    selectCreateGameSelectedRuleConfigurationId,
    selectCreateGameSelectedStartingSide,
    selectCreateGameSnapshot
} from "../../main/frontend/features/game/createGameSelectors.js";

describe("create game draft", () => {
    test("entering create mode uses the free-play defaults", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());

        expect(selectCreateGameIsActive(store.getState())).toBe(true);
        expect(selectCreateGameSelectedRuleConfigurationId(store.getState())).toBe("free-play");
        expect(selectCreateGameSelectedStartingSide(store.getState())).toBe("ravens");
        expect(selectCreateGameSelectedBoardSize(store.getState())).toBe(7);
        expect(selectCreateGameCanEditBoard(store.getState())).toBe(true);
        expect(selectCreateGameCurrentRuleConfiguration(store.getState())?.id).toBe("free-play");
        expect(selectCreateGameSnapshot(store.getState())).toMatchObject({
            board: {},
            boardSize: 7,
            specialSquare: "d4",
            phase: "move",
            activeSide: "ravens",
            ruleConfigurationId: "free-play"
        });
        expect(selectCreateGameAvailableRuleConfigurations(store.getState())).toHaveLength(7);
        expect(selectCreateGameAvailableRuleConfigurations(store.getState()).map((ruleConfiguration) => ruleConfiguration.id)).toEqual([
            "free-play",
            "trivial",
            "original-game",
            "sherwood-rules",
            "square-one",
            "sherwood-x-9",
            "square-one-x-9"
        ]);
    });

    test("cycling setup squares follows the free-play setup cycle and preserves pieces inside the board", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        store.dispatch(createGameDraftActions.setupSquareCycled("g7"));
        store.dispatch(createGameDraftActions.boardSizeSelected(5));

        expect(selectCreateGameSnapshot(store.getState())).toMatchObject({
            board: {
                a1: "raven"
            },
            boardSize: 5,
            specialSquare: "c3",
            phase: "move",
            activeSide: "ravens",
            ruleConfigurationId: "free-play"
        });
    });

    test("free play cycles raven to dragon to gold to empty", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());

        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        expect(selectCreateGameSnapshot(store.getState())?.board).toMatchObject({ a1: "raven" });

        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        expect(selectCreateGameSnapshot(store.getState())?.board).toMatchObject({ a1: "dragon" });

        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        expect(selectCreateGameSnapshot(store.getState())?.board).toMatchObject({ a1: "gold" });

        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        expect(selectCreateGameSnapshot(store.getState())?.board).toEqual({});
    });

    test("changing away from free play clears the draft board and rebuilds the preset snapshot", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        store.dispatch(createGameDraftActions.ruleConfigurationSelected("trivial"));

        expect(selectCreateGameSelectedRuleConfigurationId(store.getState())).toBe("trivial");
        expect(selectCreateGameCanEditBoard(store.getState())).toBe(false);
        expect(selectCreateGameSnapshot(store.getState())).toMatchObject({
            board: {
                a1: "dragon",
                g7: "dragon",
                a2: "gold",
                g6: "gold",
                a7: "raven",
                g1: "raven"
            },
            boardSize: 7,
            specialSquare: "d4",
            phase: "none",
            activeSide: "dragons",
            ruleConfigurationId: "trivial"
        });
    });

    test("selecting a preset ruleset uses its built-in board size and starting side", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.ruleConfigurationSelected("sherwood-x-9"));

        expect(selectCreateGameSnapshot(store.getState())).toMatchObject({
            boardSize: 9,
            specialSquare: "e5",
            phase: "none",
            activeSide: "ravens",
            ruleConfigurationId: "sherwood-x-9"
        });
    });

    test("leaving create mode clears the draft state", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        store.dispatch(createGameDraftActions.createModeCleared());

        expect(selectCreateGameIsActive(store.getState())).toBe(false);
        expect(selectCreateGameSnapshot(store.getState())).toBeNull();
    });
});
