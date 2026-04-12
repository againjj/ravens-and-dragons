import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";

import type { AuthState } from "../features/auth/authSlice.js";
import { authReducer, initialAuthState } from "../features/auth/authSlice.js";
import type { GameState } from "../features/game/gameSlice.js";
import { gameReducer, initialGameState } from "../features/game/gameSlice.js";
import type { UiState } from "../features/ui/uiSlice.js";
import { initialUiState, uiReducer } from "../features/ui/uiSlice.js";

const rootReducer = combineReducers({
    auth: authReducer,
    game: gameReducer,
    ui: uiReducer
});

export interface PreloadedAppState {
    auth?: AuthState;
    game?: GameState;
    ui?: UiState;
}

const buildPreloadedGameState = (gameState?: GameState): GameState => {
    const mergedGameState = {
        ...initialGameState,
        ...gameState
    };

    if (mergedGameState.session && !gameState?.currentGameId) {
        mergedGameState.currentGameId = mergedGameState.session.id;
    }

    if (mergedGameState.session && !gameState?.view) {
        mergedGameState.view = "game";
    }

    return mergedGameState;
};

export const createAppStore = (preloadedState?: PreloadedAppState) =>
    configureStore({
        reducer: rootReducer,
        preloadedState: {
            auth: {
                ...initialAuthState,
                ...preloadedState?.auth,
                session: {
                    ...initialAuthState.session,
                    ...preloadedState?.auth?.session
                }
            },
            game: buildPreloadedGameState(preloadedState?.game),
            ui: {
                ...initialUiState,
                ...preloadedState?.ui
            }
        }
    });

export const store = createAppStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, UnknownAction>;
