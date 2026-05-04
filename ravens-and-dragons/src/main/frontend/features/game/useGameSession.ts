import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "../../app/hooks.js";
import { selectCurrentGameId, selectGameView } from "./gameSelectors.js";
import { connectGameStream } from "./gameStream.js";

export const useGameSession = (): void => {
    const dispatch = useAppDispatch();
    const currentGameId = useAppSelector(selectCurrentGameId);
    const view = useAppSelector(selectGameView);
    const activeSessionId = useAppSelector((state) => state.game.session?.id ?? null);

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
