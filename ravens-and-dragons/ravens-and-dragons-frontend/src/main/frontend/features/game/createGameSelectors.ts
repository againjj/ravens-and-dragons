import { createSelector } from "@reduxjs/toolkit";

import type { RavensAndDragonsHostState } from "../../frontend-state.js";
import type { ServerGameSnapshot, Side } from "../../game-types.js";
import {
    buildDraftSnapshot,
    createRuleConfigurations,
    getCreateRuleConfiguration,
    isDraftBoardEditable
} from "./createGameState.js";

export const selectCreateGameState = (state: RavensAndDragonsHostState) => state.createGame;
export const selectCreateGameIsActive = (state: RavensAndDragonsHostState) => state.createGame.isActive;
export const selectCreateGameAvailableRuleConfigurations = createSelector(
    selectCreateGameState,
    () => createRuleConfigurations.map((ruleConfiguration) => ruleConfiguration.summary)
);
export const selectCreateGameSelectedRuleConfigurationId = (state: RavensAndDragonsHostState) =>
    state.createGame.selectedRuleConfigurationId;
export const selectCreateGameSelectedStartingSide = (state: RavensAndDragonsHostState): Side =>
    state.createGame.selectedStartingSide;
export const selectCreateGameSelectedBoardSize = (state: RavensAndDragonsHostState) => state.createGame.selectedBoardSize;
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
