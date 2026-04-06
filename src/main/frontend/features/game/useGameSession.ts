import { useEffect } from "react";

import { useAppDispatch } from "../../app/hooks.js";
import { connectGameStream } from "./gameStream.js";
import { loadGame } from "./gameThunks.js";

export const useGameSession = (): void => {
    const dispatch = useAppDispatch();

    useEffect(() => {
        let closeStream: (() => void) | null = null;
        let disposed = false;

        void dispatch(loadGame()).then((loaded: boolean) => {
            if (!loaded || disposed) {
                return;
            }

            closeStream = connectGameStream(dispatch);
        });

        return () => {
            disposed = true;
            closeStream?.();
        };
    }, [dispatch]);
};
