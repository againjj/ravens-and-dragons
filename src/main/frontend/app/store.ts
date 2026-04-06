import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";

import type { GameState } from "../features/game/gameSlice.js";
import { gameReducer } from "../features/game/gameSlice.js";
import type { UiState } from "../features/ui/uiSlice.js";
import { uiReducer } from "../features/ui/uiSlice.js";

const rootReducer = combineReducers({
    game: gameReducer,
    ui: uiReducer
});

export interface PreloadedAppState {
    game?: GameState;
    ui?: UiState;
}

export const createAppStore = (preloadedState?: PreloadedAppState) =>
    configureStore({
        reducer: rootReducer,
        preloadedState
    });

export const store = createAppStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, UnknownAction>;
