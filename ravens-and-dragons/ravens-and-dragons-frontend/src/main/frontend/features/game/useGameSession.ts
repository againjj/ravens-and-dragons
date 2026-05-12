import { useEffect } from "react";

import { useRavensAndDragonsDispatch, useRavensAndDragonsSelector } from "../../frontend-state.js";
import { selectCurrentGameId, selectGameView } from "./gameSelectors.js";
import { connectGameStream } from "./gameStream.js";

export const useGameSession = (): void => {
    const dispatch = useRavensAndDragonsDispatch();
    const currentGameId = useRavensAndDragonsSelector(selectCurrentGameId);
    const view = useRavensAndDragonsSelector(selectGameView);
    const activeSessionId = useRavensAndDragonsSelector((state) => state.game.session?.id ?? null);

    useEffect(() => {
        if (view !== "game" || !currentGameId || activeSessionId !== currentGameId) {
            return;
        }

        const closeStream = connectGameStream(dispatch, currentGameId);

        return () => {
            closeStream();
        };
    }, [activeSessionId, currentGameId, dispatch, view]);
};
