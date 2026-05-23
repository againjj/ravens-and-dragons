import type { ThunkAction, ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";

import type { AuthSessionResponse } from "@ravensanddragons/platform-frontend/auth-types";
import type { CreateGameDraftState } from "./game-types.js";
import type { GameState } from "./features/game/gameSlice.js";
import type { UiState } from "./features/ui/uiSlice.js";

export interface RavensAndDragonsHostState {
    auth: {
        session: AuthSessionResponse;
    };
    createGame: CreateGameDraftState;
    game: GameState;
    ui: UiState;
}

export type RavensAndDragonsDispatch = ThunkDispatch<RavensAndDragonsHostState, unknown, UnknownAction>;
export type RavensAndDragonsThunk<ReturnType = void> = ThunkAction<
    ReturnType,
    RavensAndDragonsHostState,
    unknown,
    UnknownAction
>;

export const useRavensAndDragonsDispatch = useDispatch.withTypes<RavensAndDragonsDispatch>();
export const useRavensAndDragonsSelector = useSelector.withTypes<RavensAndDragonsHostState>();
