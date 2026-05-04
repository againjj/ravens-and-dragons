import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
    createActiveDraftState,
    createDraftState,
    cycleDraftSetupSquare,
    filterDraftBoardToBoardSize,
    getCreateRuleConfiguration,
    isDraftBoardEditable,
    isValidDraftBoardSize
} from "./createGameState.js";
import type { CreateGameDraftState, Side } from "../../game-types.js";

export const initialCreateGameDraftState: CreateGameDraftState = createDraftState();

const createGameSlice = createSlice({
    name: "createGame",
    initialState: initialCreateGameDraftState,
    reducers: {
        createModeEntered(state) {
            if (state.isActive) {
                return;
            }

            return createActiveDraftState();
        },
        createModeCleared() {
            return createDraftState();
        },
        ruleConfigurationSelected(state, action: PayloadAction<string>) {
            if (!state.isActive) {
                return;
            }

            const nextConfiguration = getCreateRuleConfiguration(action.payload);
            if (!nextConfiguration || state.selectedRuleConfigurationId === action.payload) {
                return;
            }

            state.selectedRuleConfigurationId = action.payload;
            state.draftBoard = {};
        },
        startingSideSelected(state, action: PayloadAction<Side>) {
            if (!isDraftBoardEditable(state)) {
                return;
            }

            state.selectedStartingSide = action.payload;
        },
        boardSizeSelected(state, action: PayloadAction<number>) {
            if (!isDraftBoardEditable(state) || !isValidDraftBoardSize(action.payload)) {
                return;
            }

            state.selectedBoardSize = action.payload;
            state.draftBoard = filterDraftBoardToBoardSize(state.draftBoard, action.payload);
        },
        setupSquareCycled(state, action: PayloadAction<string>) {
            if (!isDraftBoardEditable(state) || !isValidDraftBoardSize(state.selectedBoardSize)) {
                return;
            }

            state.draftBoard = cycleDraftSetupSquare(state.draftBoard, action.payload);
            state.draftBoard = filterDraftBoardToBoardSize(state.draftBoard, state.selectedBoardSize);
        }
    }
});

export const createGameDraftReducer = createGameSlice.reducer;
export const createGameDraftActions = createGameSlice.actions;
