import { openGameStream } from "../../game-client.js";
import type { RavensAndDragonsDispatch } from "../../frontend-state.js";
import { gameActions } from "./gameSlice.js";
import { applyServerSessionFromStream } from "./gameThunks.js";
import { notifyServerUnavailable } from "@ravensanddragons/platform-frontend/api-client";

export const connectGameStream = (dispatch: RavensAndDragonsDispatch, gameId: string): (() => void) =>
    openGameStream(
        (url) => new EventSource(url),
        gameId,
        (session) => {
            void dispatch(applyServerSessionFromStream(session));
        },
        () => {
            dispatch(gameActions.streamConnected());
        },
        () => {
            dispatch(gameActions.streamDisconnected());
            notifyServerUnavailable();
        }
    );
