import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
    selectedSquare: string | null;
}

export const initialUiState: UiState = {
    selectedSquare: null
};

const uiSlice = createSlice({
    name: "ui",
    initialState: initialUiState,
    reducers: {
        selectedSquareSet(state, action: PayloadAction<string | null>) {
            state.selectedSquare = action.payload;
        }
    }
});

export const uiReducer = uiSlice.reducer;
export const uiActions = uiSlice.actions;
