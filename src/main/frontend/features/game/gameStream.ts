import { openGameStream } from "../../game-client.js";
import type { AppDispatch } from "../../app/store.js";
import { gameActions } from "./gameSlice.js";
import { applyServerSession } from "./gameThunks.js";

export const connectGameStream = (dispatch: AppDispatch): (() => void) =>
    openGameStream(
        (url) => new EventSource(url),
        (session) => {
            dispatch(applyServerSession(session));
        },
        () => {
            dispatch(gameActions.streamConnected());
        },
        () => {
            dispatch(gameActions.streamDisconnected());
        }
    );
