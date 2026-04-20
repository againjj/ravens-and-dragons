import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "../../app/store.js";
import type { ServerGameSnapshot, Side } from "../../game-types.js";
import {
    buildDraftSnapshot,
    createRuleConfigurations,
    getCreateRuleConfiguration,
    isDraftBoardEditable
} from "./createGameState.js";

export const selectCreateGameState = (state: RootState) => state.createGame;
export const selectCreateGameIsActive = (state: RootState) => state.createGame.isActive;
export const selectCreateGameAvailableRuleConfigurations = createSelector(
    selectCreateGameState,
    () => createRuleConfigurations.map((ruleConfiguration) => ruleConfiguration.summary)
);
export const selectCreateGameSelectedRuleConfigurationId = (state: RootState) =>
    state.createGame.selectedRuleConfigurationId;
export const selectCreateGameSelectedStartingSide = (state: RootState): Side =>
    state.createGame.selectedStartingSide;
export const selectCreateGameSelectedBoardSize = (state: RootState) => state.createGame.selectedBoardSize;
export const selectCreateGameCanEditBoard = createSelector(
    selectCreateGameState,
    (createGameState) => isDraftBoardEditable(createGameState)
);
export const selectCreateGameCurrentRuleConfiguration = createSelector(
    selectCreateGameSelectedRuleConfigurationId,
    (ruleConfigurationId) => getCreateRuleConfiguration(ruleConfigurationId)?.summary ?? null
);
export const selectCreateGameSnapshot = createSelector(
    selectCreateGameState,
    (createGameState): ServerGameSnapshot | null => buildDraftSnapshot(createGameState)
);
