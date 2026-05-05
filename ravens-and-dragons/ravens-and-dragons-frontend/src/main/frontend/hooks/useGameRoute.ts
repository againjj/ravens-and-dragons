import { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { selectAuthLoadState, selectCurrentUser, selectIsAuthenticated } from "../features/auth/authSelectors.js";
import { selectGameView } from "../features/game/gameSelectors.js";
import type { GameEntry } from "../game-entry.js";

export type AppPage = "login" | "lobby" | "create" | "game" | "profile" | "loading";

type NavigationMode = "push" | "replace";
type RouteKind = "root" | "login" | "lobby" | "create" | "profile" | "game" | "unknown";

interface ParsedRoute {
    kind: RouteKind;
    fullPath: string;
    gameId: string | null;
}

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

const getCurrentLocationPath = (): string => `${window.location.pathname}${window.location.search}`;

const parseRoute = (gameEntry: GameEntry, fullPath: string): ParsedRoute => {
    const pathname = fullPath.split("?")[0] ?? fullPath;
    const gameId = gameEntry.routes.matchPlayPath(pathname);

    if (pathname === "/") {
        return { kind: "root", fullPath, gameId: null };
    }
    if (pathname === "/login") {
        return { kind: "login", fullPath, gameId: null };
    }
    if (pathname === "/lobby") {
        return { kind: "lobby", fullPath, gameId: null };
    }
    if (pathname === gameEntry.routes.createPath) {
        return { kind: "create", fullPath, gameId: null };
    }
    if (pathname === "/profile") {
        return { kind: "profile", fullPath, gameId: null };
    }
    if (gameId) {
        return { kind: "game", fullPath, gameId };
    }
    return { kind: "unknown", fullPath, gameId: null };
};

export const useGameRoute = (gameEntry: GameEntry): {
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
    const [locationPath, setLocationPath] = useState(getCurrentLocationPath);

    const clearActiveGameView = () => {
        gameEntry.lifecycle.returnToLobby(dispatch);
    };

    const clearCreateDraft = () => {
        gameEntry.lifecycle.clearCreateMode(dispatch);
    };

    const enterCreateDraft = () => {
        gameEntry.lifecycle.enterCreateMode(dispatch);
    };

    const updateRoutePath = (path: string, mode: NavigationMode) => {
        writeHistory(path, mode);
        setLocationPath(path);
    };

    const navigateToLobby = (mode: NavigationMode = "push") => {
        clearCreateDraft();
        clearActiveGameView();
        updateRoutePath("/lobby", mode);
    };

    const navigateToCreate = (mode: NavigationMode = "push") => {
        clearActiveGameView();
        clearCreateDraft();
        enterCreateDraft();
        updateRoutePath(gameEntry.routes.createPath, mode);
    };

    const navigateToProfile = (mode: NavigationMode = "push") => {
        clearCreateDraft();
        clearActiveGameView();
        updateRoutePath("/profile", mode);
    };

    const navigateToGame = (
        gameId: string,
        options: { mode?: NavigationMode; loadGame?: boolean } = {}
    ) => {
        const trimmedGameId = gameId.trim();
        const targetPath = gameEntry.routes.buildPlayPath(trimmedGameId);
        clearCreateDraft();
        updateRoutePath(targetPath, options.mode ?? "push");
        if (options.loadGame ?? true) {
            gameEntry.lifecycle.openGame(dispatch, trimmedGameId);
        }
    };

    useEffect(() => {
        if (authLoadState === "idle" || authLoadState === "loading") {
            return;
        }

        const syncFromLocation = () => {
            const currentLocationPath = getCurrentLocationPath();
            const route = parseRoute(gameEntry, currentLocationPath);
            setLocationPath(currentLocationPath);

            if (!isAuthenticated) {
                if (route.kind !== "login") {
                    replaceToLogin(route.fullPath === "" ? "/" : route.fullPath);
                    setLocationPath(getCurrentLocationPath());
                }
                clearCreateDraft();
                clearActiveGameView();
                return;
            }

            if (route.kind === "login") {
                const targetPath = getLoginRedirectPath();
                const targetRoute = parseRoute(gameEntry, targetPath);
                if (targetRoute.kind === "game" && targetRoute.gameId) {
                    navigateToGame(targetRoute.gameId, { mode: "push" });
                } else if (targetRoute.kind === "create") {
                    navigateToCreate("push");
                } else if (targetRoute.kind === "profile") {
                    navigateToProfile("push");
                } else {
                    navigateToLobby("push");
                }
                return;
            }

            switch (route.kind) {
                case "root":
                    navigateToLobby("replace");
                    return;
                case "create":
                    clearActiveGameView();
                    enterCreateDraft();
                    return;
                case "game":
                    clearCreateDraft();
                    if (route.gameId) {
                        gameEntry.lifecycle.openGame(dispatch, route.gameId);
                    }
                    return;
                case "lobby":
                    clearCreateDraft();
                    clearActiveGameView();
                    return;
                case "profile":
                    if (currentUser?.authType !== "local") {
                        navigateToLobby("replace");
                        return;
                    }
                    clearCreateDraft();
                    clearActiveGameView();
                    return;
                case "unknown":
                    navigateToLobby("replace");
                    return;
            }
        };

        syncFromLocation();
        window.addEventListener("popstate", syncFromLocation);
        return () => {
            window.removeEventListener("popstate", syncFromLocation);
        };
    }, [authLoadState, currentUser?.authType, dispatch, gameEntry, isAuthenticated]);

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
        if (locationPath === gameEntry.routes.createPath) {
            return "create";
        }
        return view === "game" ? "game" : "lobby";
    }, [authLoadState, gameEntry.routes.createPath, isAuthenticated, locationPath, view]);

    return { page, navigateToLobby, navigateToCreate, navigateToProfile, navigateToGame };
};
