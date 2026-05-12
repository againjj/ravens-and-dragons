import type { RavensAndDragonsHostState } from "../../frontend-state.js";

export const selectCurrentUser = (state: RavensAndDragonsHostState) => state.auth.session.user;
export const selectIsAuthenticated = (state: RavensAndDragonsHostState) => state.auth.session.authenticated;
