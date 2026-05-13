import { useEffect, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { selectAuthLoadState, selectCurrentUser, selectIsAuthenticated } from "../features/auth/authSelectors.js";
import { selectGameView } from "../../../../../../ravens-and-dragons/ravens-and-dragons-frontend/src/main/frontend/features/game/gameSelectors.js";
import type { GameEntry } from "@ravensanddragons/platform-frontend/game-entry";
import type { AppDispatch } from "../app/store.js";

export type AppPage = "login" | "lobby" | "create" | "game" | "profile" | "loading";

type NavigationMode = "push" | "replace";
type RouteKind = "root" | "login" | "lobby" | "create" | "profile" | "game" | "unknown";

interface ParsedRoute {
    kind: RouteKind;
    fullPath: string;
    gameId: string | null;
    gameSlug: string | null;
}

interface RouteGameMetadata {
    gameSlug?: string;
}

const createRoutePattern = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/create$/;
const playRoutePattern = /^\/g\/([^/]+)$/;

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

const parseRoute = (fullPath: string): ParsedRoute => {
    const pathname = fullPath.split("?")[0] ?? fullPath;
    const playRouteMatch = pathname.match(playRoutePattern);
    const createRouteMatch = pathname.match(createRoutePattern);
    const gameId = playRouteMatch ? decodeURIComponent(playRouteMatch[1]) : null;
    const createGameSlug = createRouteMatch?.[1] ?? null;

    if (pathname === "/") {
        return { kind: "root", fullPath, gameId: null, gameSlug: null };
    }
    if (pathname === "/login") {
        return { kind: "login", fullPath, gameId: null, gameSlug: null };
    }
    if (pathname === "/lobby") {
        return { kind: "lobby", fullPath, gameId: null, gameSlug: null };
    }
    if (createGameSlug) {
        return { kind: "create", fullPath, gameId: null, gameSlug: createGameSlug };
    }
    if (pathname === "/profile") {
        return { kind: "profile", fullPath, gameId: null, gameSlug: null };
    }
    if (gameId) {
        return { kind: "game", fullPath, gameId, gameSlug: null };
    }
    return { kind: "unknown", fullPath, gameId: null, gameSlug: null };
};

export const useGameRoute = (
    gameEntries: GameEntry<AppDispatch>[],
    gameEntry: GameEntry<AppDispatch>,
    setActiveGameSlug: (gameSlug: string) => void
): {
    page: AppPage;
    navigateToLobby: (mode?: NavigationMode) => void;
    navigateToCreate: (gameSlug: string, mode?: NavigationMode) => void;
    navigateToProfile: (mode?: NavigationMode) => void;
    navigateToGame: (gameId: string, options?: { mode?: NavigationMode; loadGame?: boolean }) => void;
    createGameSlug: string | null;
} => {
    const dispatch = useAppDispatch();
    const authLoadState = useAppSelector(selectAuthLoadState);
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const view = useAppSelector(selectGameView);
    const [locationPath, setLocationPath] = useState(getCurrentLocationPath);
    const [resolvingGameRouteId, setResolvingGameRouteId] = useState<string | null>(null);
    const openedRouteGameIdRef = useRef<string | null>(null);
    const currentRoute = useMemo(() => parseRoute(locationPath), [locationPath]);
    const gameEntriesBySlug = useMemo(
        () => new Map(gameEntries.map((entry) => [entry.identity.slug, entry])),
        [gameEntries]
    );

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
        openedRouteGameIdRef.current = null;
        setResolvingGameRouteId(null);
        clearCreateDraft();
        clearActiveGameView();
        updateRoutePath("/lobby", mode);
    };

    const navigateToCreate = (gameSlug: string, mode: NavigationMode = "push") => {
        openedRouteGameIdRef.current = null;
        setResolvingGameRouteId(null);
        clearActiveGameView();
        clearCreateDraft();
        enterCreateDraft();
        updateRoutePath(`/${gameSlug}/create`, mode);
    };

    const navigateToProfile = (mode: NavigationMode = "push") => {
        openedRouteGameIdRef.current = null;
        setResolvingGameRouteId(null);
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
        openedRouteGameIdRef.current = trimmedGameId;
        setResolvingGameRouteId(null);
        clearCreateDraft();
        updateRoutePath(targetPath, options.mode ?? "push");
        if (options.loadGame ?? true) {
            gameEntry.lifecycle.openGame(dispatch, trimmedGameId);
        }
    };

    const resolveGameEntryForGameId = async (gameId: string): Promise<GameEntry<AppDispatch> | null> => {
        try {
            const response = await fetch(`/api/games/${encodeURIComponent(gameId)}`);
            if (response.ok) {
                const game = await response.json() as RouteGameMetadata;
                const resolvedEntry = game.gameSlug ? gameEntriesBySlug.get(game.gameSlug) : null;
                if (resolvedEntry) {
                    return resolvedEntry;
                }
            }
        } catch {
            // Treat metadata fetch failures as an unresolved game route.
        }
        return null;
    };

    const openRouteGame = (gameId: string, mode?: NavigationMode) => {
        const trimmedGameId = gameId.trim();
        if (openedRouteGameIdRef.current === trimmedGameId) {
            return;
        }
        const targetPath = gameEntry.routes.buildPlayPath(trimmedGameId);
        clearCreateDraft();
        if (mode) {
            updateRoutePath(targetPath, mode);
        }
        setResolvingGameRouteId(trimmedGameId);
        void resolveGameEntryForGameId(gameId).then((entry) => {
            if (!entry) {
                clearActiveGameView();
                setResolvingGameRouteId(null);
                updateRoutePath("/lobby", "replace");
                return;
            }
            setActiveGameSlug(entry.identity.slug);
            entry.lifecycle.openGame(dispatch, gameId);
            openedRouteGameIdRef.current = trimmedGameId;
            setResolvingGameRouteId(null);
        });
    };

    useEffect(() => {
        if (authLoadState === "idle" || authLoadState === "loading") {
            return;
        }

        const syncFromLocation = () => {
            const currentLocationPath = getCurrentLocationPath();
            const route = parseRoute(currentLocationPath);
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
                const targetRoute = parseRoute(targetPath);
                if (targetRoute.kind === "game" && targetRoute.gameId) {
                    openRouteGame(targetRoute.gameId, "push");
                } else if (targetRoute.kind === "create") {
                    navigateToCreate(targetRoute.gameSlug ?? "ravens-and-dragons", "push");
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
                        openRouteGame(route.gameId);
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
    }, [authLoadState, currentUser?.authType, dispatch, gameEntry, gameEntriesBySlug, isAuthenticated]);

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
        if (currentRoute.kind === "game" && currentRoute.gameId === resolvingGameRouteId) {
            return "loading";
        }
        if (locationPath === "/profile") {
            return "profile";
        }
        if (currentRoute.kind === "create") {
            return "create";
        }
        if (currentRoute.kind === "game") {
            return "game";
        }
        return view === "game" ? "game" : "lobby";
    }, [authLoadState, currentRoute.gameId, currentRoute.kind, isAuthenticated, locationPath, resolvingGameRouteId, view]);

    return {
        page,
        navigateToLobby,
        navigateToCreate,
        navigateToProfile,
        navigateToGame,
        createGameSlug: currentRoute.kind === "create" ? currentRoute.gameSlug : null
    };
};
