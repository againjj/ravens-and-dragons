import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { selectCurrentGameId, selectGameView } from "../features/game/gameSelectors.js";
import { openGame, returnToLobby } from "../features/game/gameThunks.js";
import { generatedGameIdPattern } from "../game.js";

const gameRoutePattern = /^\/g\/([23456789CFGHJMPQRVWX]{7})$/;

const getPathForGame = (gameId: string | null, view: "lobby" | "game"): string =>
    view === "game" && gameId ? `/g/${encodeURIComponent(gameId)}` : "/";

const getRouteGameId = (pathname: string): string | null => {
    const match = pathname.match(gameRoutePattern);
    const routeGameId = match?.[1] ?? null;
    return routeGameId && generatedGameIdPattern.test(routeGameId) ? routeGameId : null;
};

export const useGameRoute = (): void => {
    const dispatch = useAppDispatch();
    const currentGameId = useAppSelector(selectCurrentGameId);
    const view = useAppSelector(selectGameView);
    const initialDirectGameId = useRef<string | null>(getRouteGameId(window.location.pathname));
    const pendingLocationPath = useRef<string | null>(window.location.pathname);

    useEffect(() => {
        const syncFromLocation = () => {
            pendingLocationPath.current = window.location.pathname;
            const routeGameId = getRouteGameId(window.location.pathname);
            if (routeGameId) {
                void dispatch(openGame(routeGameId));
                return;
            }

            dispatch(returnToLobby());
        };

        syncFromLocation();
        window.addEventListener("popstate", syncFromLocation);

        return () => {
            window.removeEventListener("popstate", syncFromLocation);
        };
    }, [dispatch]);

    useEffect(() => {
        const targetPath = getPathForGame(currentGameId, view);
        const syncedLocationPath = pendingLocationPath.current;
        if (syncedLocationPath !== null) {
            const syncedGameId = getRouteGameId(syncedLocationPath);
            const syncedTargetPath = getPathForGame(syncedGameId, syncedGameId ? "game" : "lobby");

            if (targetPath !== syncedTargetPath) {
                return;
            }

            pendingLocationPath.current = null;
            return;
        }

        if (window.location.pathname === targetPath) {
            return;
        }

        if (
            targetPath === "/" &&
            initialDirectGameId.current &&
            window.location.pathname === getPathForGame(initialDirectGameId.current, "game")
        ) {
            window.history.replaceState({}, "", targetPath);
            initialDirectGameId.current = null;
            return;
        }

        window.history.pushState({}, "", targetPath);
    }, [currentGameId, view]);
};
