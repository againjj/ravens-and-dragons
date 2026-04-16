import { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { selectAuthLoadState, selectCurrentUser, selectIsAuthenticated } from "../features/auth/authSelectors.js";
import { selectGameView } from "../features/game/gameSelectors.js";
import { openGame, returnToLobby } from "../features/game/gameThunks.js";
import { generatedGameIdPattern } from "../game.js";

const gameRoutePattern = /^\/g\/([23456789CFGHJMPQRVWX]{7})$/;

export type AppPage = "login" | "lobby" | "game" | "profile" | "loading";

type NavigationMode = "push" | "replace";

const getRouteGameId = (pathname: string): string | null => {
    const match = pathname.match(gameRoutePattern);
    const routeGameId = match?.[1] ?? null;
    return routeGameId && generatedGameIdPattern.test(routeGameId) ? routeGameId : null;
};

const getLoginRedirectPath = (): string => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || next === "/login") {
        return "/lobby";
    }
    return next === "/" ? "/lobby" : next;
};

const replaceToLogin = (nextPath: string) => {
    const search = new URLSearchParams({ next: nextPath });
    window.history.replaceState({}, "", `/login?${search.toString()}`);
};

const writeHistory = (path: string, mode: NavigationMode) => {
    if (mode === "replace") {
        window.history.replaceState({}, "", path);
        return;
    }
    window.history.pushState({}, "", path);
};

export const useGameRoute = (): {
    page: AppPage;
    navigateToLobby: (mode?: NavigationMode) => void;
    navigateToProfile: (mode?: NavigationMode) => void;
    navigateToGame: (gameId: string, options?: { mode?: NavigationMode; loadGame?: boolean }) => void;
} => {
    const dispatch = useAppDispatch();
    const authLoadState = useAppSelector(selectAuthLoadState);
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const view = useAppSelector(selectGameView);
    const [locationPath, setLocationPath] = useState(() => `${window.location.pathname}${window.location.search}`);

    const clearActiveGameView = () => {
        dispatch(returnToLobby());
    };

    const navigateToLobby = (mode: NavigationMode = "push") => {
        writeHistory("/lobby", mode);
        setLocationPath("/lobby");
        clearActiveGameView();
    };

    const navigateToProfile = (mode: NavigationMode = "push") => {
        writeHistory("/profile", mode);
        setLocationPath("/profile");
        clearActiveGameView();
    };

    const navigateToGame = (
        gameId: string,
        options: { mode?: NavigationMode; loadGame?: boolean } = {}
    ) => {
        const trimmedGameId = gameId.trim();
        const targetPath = `/g/${encodeURIComponent(trimmedGameId)}`;
        writeHistory(targetPath, options.mode ?? "push");
        setLocationPath(targetPath);
        if (options.loadGame ?? true) {
            void dispatch(openGame(trimmedGameId));
        }
    };

    useEffect(() => {
        if (authLoadState === "idle" || authLoadState === "loading") {
            return;
        }

        const syncFromLocation = () => {
            const pathname = window.location.pathname;
            const nextLocationPath = `${window.location.pathname}${window.location.search}`;
            setLocationPath(nextLocationPath);
            const routeGameId = getRouteGameId(pathname);

            if (!isAuthenticated) {
                if (pathname !== "/login") {
                    const nextPath = nextLocationPath;
                    replaceToLogin(nextPath === "" ? "/" : nextPath);
                    setLocationPath(`${window.location.pathname}${window.location.search}`);
                }
                clearActiveGameView();
                return;
            }

            if (pathname === "/") {
                navigateToLobby("replace");
                return;
            }

            if (pathname === "/login") {
                const targetPath = getLoginRedirectPath();
                if (getRouteGameId(targetPath)) {
                    navigateToGame(getRouteGameId(targetPath)!, { mode: "push" });
                } else if (targetPath === "/profile") {
                    navigateToProfile("push");
                } else {
                    navigateToLobby("push");
                }
                return;
            }

            if (routeGameId) {
                void dispatch(openGame(routeGameId));
                return;
            }

            if (pathname === "/lobby") {
                clearActiveGameView();
                return;
            }

            if (pathname === "/profile") {
                if (currentUser?.authType !== "local") {
                    navigateToLobby("replace");
                    return;
                }
                clearActiveGameView();
                return;
            }

            navigateToLobby("replace");
        };

        syncFromLocation();
        window.addEventListener("popstate", syncFromLocation);
        return () => {
            window.removeEventListener("popstate", syncFromLocation);
        };
    }, [authLoadState, currentUser?.authType, dispatch, isAuthenticated]);

    const page = useMemo<AppPage>(() => {
        if (authLoadState === "idle" || authLoadState === "loading") {
            return "loading";
        }
        if (!isAuthenticated) {
            return "login";
        }
        if (locationPath.startsWith("/login")) {
            return "loading";
        }
        if (locationPath === "/profile") {
            return "profile";
        }
        return view === "game" ? "game" : "lobby";
    }, [authLoadState, isAuthenticated, locationPath, view]);

    return { page, navigateToLobby, navigateToProfile, navigateToGame };
};
