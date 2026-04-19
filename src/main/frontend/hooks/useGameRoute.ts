import { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { selectAuthLoadState, selectCurrentUser, selectIsAuthenticated } from "../features/auth/authSelectors.js";
import { createGameDraftActions } from "../features/game/createGameSlice.js";
import { selectGameView } from "../features/game/gameSelectors.js";
import { openGame, returnToLobby } from "../features/game/gameThunks.js";
import { generatedGameIdPattern } from "../game-types.js";

const gameRoutePattern = /^\/g\/([23456789CFGHJMPQRVWX]{7})$/;

export type AppPage = "login" | "lobby" | "create" | "game" | "profile" | "loading";

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
    navigateToCreate: (mode?: NavigationMode) => void;
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

    const clearCreateDraft = () => {
        dispatch(createGameDraftActions.createModeCleared());
    };

    const enterCreateDraft = () => {
        dispatch(createGameDraftActions.createModeEntered());
    };

    const navigateToLobby = (mode: NavigationMode = "push") => {
        clearCreateDraft();
        writeHistory("/lobby", mode);
        setLocationPath("/lobby");
        clearActiveGameView();
    };

    const navigateToCreate = (mode: NavigationMode = "push") => {
        clearCreateDraft();
        writeHistory("/create", mode);
        setLocationPath("/create");
        clearActiveGameView();
        enterCreateDraft();
    };

    const navigateToProfile = (mode: NavigationMode = "push") => {
        clearCreateDraft();
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
        clearCreateDraft();
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
                clearCreateDraft();
                clearActiveGameView();
                return;
            }

            if (pathname === "/") {
                clearCreateDraft();
                navigateToLobby("replace");
                return;
            }

            if (pathname === "/login") {
                const targetPath = getLoginRedirectPath();
                const targetGameId = getRouteGameId(targetPath);
                if (targetGameId) {
                    navigateToGame(targetGameId, { mode: "push" });
                } else if (targetPath === "/create") {
                    navigateToCreate("push");
                } else if (targetPath === "/profile") {
                    navigateToProfile("push");
                } else {
                    navigateToLobby("push");
                }
                return;
            }

            if (pathname === "/create") {
                clearActiveGameView();
                enterCreateDraft();
                return;
            }

            if (routeGameId) {
                clearCreateDraft();
                void dispatch(openGame(routeGameId));
                return;
            }

            if (pathname === "/lobby") {
                clearCreateDraft();
                clearActiveGameView();
                return;
            }

            if (pathname === "/profile") {
                if (currentUser?.authType !== "local") {
                    navigateToLobby("replace");
                    return;
                }
                clearCreateDraft();
                clearActiveGameView();
                return;
            }

            clearCreateDraft();
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
        if (locationPath === "/create") {
            return "create";
        }
        return view === "game" ? "game" : "lobby";
    }, [authLoadState, isAuthenticated, locationPath, view]);

    return { page, navigateToLobby, navigateToCreate, navigateToProfile, navigateToGame };
};
