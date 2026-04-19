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
        expect(selectCreateGameSelectedStartingSide(store.getState())).toBe("dragons");
        expect(selectCreateGameSelectedBoardSize(store.getState())).toBe(7);
        expect(selectCreateGameCanEditBoard(store.getState())).toBe(true);
        expect(selectCreateGameCurrentRuleConfiguration(store.getState())?.id).toBe("free-play");
        expect(selectCreateGameSnapshot(store.getState())).toMatchObject({
            board: {},
            boardSize: 7,
            specialSquare: "d4",
            phase: "setup",
            activeSide: "dragons",
            ruleConfigurationId: "free-play"
        });
        expect(selectCreateGameAvailableRuleConfigurations(store.getState())).toHaveLength(7);
    });

    test("cycling setup squares follows the setup cycle and preserves pieces inside the board", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        store.dispatch(createGameDraftActions.setupSquareCycled("g7"));
        store.dispatch(createGameDraftActions.boardSizeSelected(5));

        expect(selectCreateGameSnapshot(store.getState())).toMatchObject({
            board: {
                a1: "dragon"
            },
            boardSize: 5,
            specialSquare: "c3",
            phase: "setup",
            activeSide: "dragons",
            ruleConfigurationId: "free-play"
        });
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

    test("leaving create mode clears the draft state", () => {
        const store = createAppStore();

        store.dispatch(createGameDraftActions.createModeEntered());
        store.dispatch(createGameDraftActions.setupSquareCycled("a1"));
        store.dispatch(createGameDraftActions.createModeCleared());

        expect(selectCreateGameIsActive(store.getState())).toBe(false);
        expect(selectCreateGameSnapshot(store.getState())).toBeNull();
    });
});
