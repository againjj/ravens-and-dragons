import { useEffect, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { selectAuthLoadState, selectCurrentUser, selectIsAuthenticated } from "../features/auth/authSelectors.js";
import { gameActions, selectGameView } from "ravens-and-dragons-frontend/app-integration";
import type { GameEntry } from "@ravensanddragons/platform-frontend/game-entry";
import { createResponseError, isServerUnavailableError, isUnauthorizedError, notifyAuthSessionExpired, notifyServerUnavailable } from "@ravensanddragons/platform-frontend/api-client";
import type { AppDispatch } from "../app/store.js";
import { loadAuthSession } from "../features/auth/authThunks.js";

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

type RouteGameResolution =
    | { kind: "resolved"; entry: GameEntry<AppDispatch> }
    | { kind: "not-found" }
    | { kind: "unauthorized" }
    | { kind: "server-unavailable" };

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
    gameEntry: GameEntry<AppDispatch> | null,
    setActiveGameSlug: (gameSlug: string | null) => void
): {
    page: AppPage;
    navigateToLobby: (mode?: NavigationMode) => void;
    navigateToCreate: (gameSlug: string, mode?: NavigationMode) => void;
    navigateToProfile: (mode?: NavigationMode) => void;
    navigateToGame: (gameId: string, options?: { mode?: NavigationMode; loadGame?: boolean; gameSlug?: string }) => void;
    openGameFromLobby: (gameId: string) => Promise<{ opened: boolean; errorMessage?: string }>;
    createGameSlug: string | null;
    currentGameId: string | null;
} => {
    const dispatch = useAppDispatch();
    const authLoadState = useAppSelector(selectAuthLoadState);
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const currentUser = useAppSelector(selectCurrentUser);
    const view = useAppSelector(selectGameView);
    const [locationPath, setLocationPath] = useState(getCurrentLocationPath);
    const [resolvingGameRouteId, setResolvingGameRouteId] = useState<string | null>(null);
    const [openedRouteGameId, setOpenedRouteGameId] = useState<string | null>(null);
    const openedRouteGameIdRef = useRef<string | null>(null);
    const currentRoute = useMemo(() => parseRoute(locationPath), [locationPath]);
    const gameEntriesBySlug = useMemo(
        () => new Map(gameEntries.map((entry) => [entry.identity.slug, entry])),
        [gameEntries]
    );

    const clearAllActiveGameViews = () => {
        gameEntries.forEach((entry) => entry.lifecycle.returnToLobby(dispatch));
    };

    const clearCreateDraft = () => {
        gameEntries.forEach((entry) => entry.lifecycle.clearCreateMode(dispatch));
    };

    const clearActiveGameSelection = () => {
        openedRouteGameIdRef.current = null;
        setOpenedRouteGameId(null);
        setActiveGameSlug(null);
        setResolvingGameRouteId(null);
    };

    const enterCreateDraft = (gameSlug: string) => {
        gameEntriesBySlug.get(gameSlug)?.lifecycle.enterCreateMode(dispatch);
    };

    const updateRoutePath = (path: string, mode: NavigationMode) => {
        writeHistory(path, mode);
        setLocationPath(path);
    };

    const navigateToLobby = (mode: NavigationMode = "push") => {
        clearActiveGameSelection();
        clearCreateDraft();
        clearAllActiveGameViews();
        updateRoutePath("/lobby", mode);
        void dispatch(loadAuthSession());
    };

    const navigateToCreate = (gameSlug: string, mode: NavigationMode = "push") => {
        clearActiveGameSelection();
        clearAllActiveGameViews();
        clearCreateDraft();
        enterCreateDraft(gameSlug);
        updateRoutePath(`/${gameSlug}/create`, mode);
    };

    const navigateToProfile = (mode: NavigationMode = "push") => {
        clearActiveGameSelection();
        clearCreateDraft();
        clearAllActiveGameViews();
        updateRoutePath("/profile", mode);
    };

    const navigateToGame = (
        gameId: string,
        options: { mode?: NavigationMode; loadGame?: boolean; gameSlug?: string } = {}
    ) => {
        const trimmedGameId = gameId.trim();
        const entry = options.gameSlug ? gameEntriesBySlug.get(options.gameSlug) ?? null : gameEntry;
        if (!entry) return;
        const targetPath = entry.routes.buildPlayPath(trimmedGameId);
        setActiveGameSlug(entry.identity.slug);
        openedRouteGameIdRef.current = trimmedGameId;
        setOpenedRouteGameId(trimmedGameId);
        setResolvingGameRouteId(null);
        clearCreateDraft();
        updateRoutePath(targetPath, options.mode ?? "push");
        if (options.loadGame ?? true) {
            entry.lifecycle.openGame(dispatch, trimmedGameId);
        }
    };

    const openGameFromLobby = async (gameId: string): Promise<{ opened: boolean; errorMessage?: string }> => {
        const trimmedGameId = gameId.trim();
        if (!trimmedGameId) {
            return {
                opened: false,
                errorMessage: "Enter a game ID to open a game."
            };
        }

        const resolution = await resolveGameEntryForGameId(trimmedGameId);
        if (resolution.kind === "unauthorized") {
            notifyAuthSessionExpired();
            clearActiveGameSelection();
            return {
                opened: false
            };
        }
        if (resolution.kind === "server-unavailable") {
            notifyServerUnavailable();
            clearActiveGameSelection();
            return {
                opened: false
            };
        }
        if (resolution.kind === "not-found") {
            clearAllActiveGameViews();
            clearActiveGameSelection();
            return {
                opened: false,
                errorMessage: `Unable to open game "${trimmedGameId}".`
            };
        }

        const entry = resolution.entry;
        setActiveGameSlug(entry.identity.slug);
        clearCreateDraft();
        const opened = await entry.lifecycle.openGame(dispatch, trimmedGameId);
        if (opened === false) {
            dispatch(gameActions.feedbackMessageSet(null));
            clearActiveGameSelection();
            return {
                opened: false,
                errorMessage: `Unable to open game "${trimmedGameId}".`
            };
        }

        openedRouteGameIdRef.current = trimmedGameId;
        setOpenedRouteGameId(trimmedGameId);
        setResolvingGameRouteId(null);
        updateRoutePath(entry.routes.buildPlayPath(trimmedGameId), "push");
        return { opened: true };
    };

    const resolveGameEntryForGameId = async (gameId: string): Promise<RouteGameResolution> => {
        try {
            const response = await fetch(`/api/games/${encodeURIComponent(gameId)}`);
            if (response.ok) {
                const game = await response.json() as RouteGameMetadata;
                const resolvedEntry = game.gameSlug ? gameEntriesBySlug.get(game.gameSlug) : null;
                if (resolvedEntry) {
                    return { kind: "resolved", entry: resolvedEntry };
                }
            }
            if (response.status === 401) {
                return { kind: "unauthorized" };
            }
            throw await createResponseError(response, "Unable to resolve that game.");
        } catch (error) {
            if (isUnauthorizedError(error)) {
                return { kind: "unauthorized" };
            }
            if (isServerUnavailableError(error)) {
                return { kind: "server-unavailable" };
            }
        }
        return { kind: "not-found" };
    };

    const openRouteGame = (gameId: string, mode?: NavigationMode) => {
        const trimmedGameId = gameId.trim();
        if (openedRouteGameIdRef.current === trimmedGameId) {
            return;
        }
        const targetPath = `/g/${encodeURIComponent(trimmedGameId)}`;
        clearCreateDraft();
        clearAllActiveGameViews();
        clearActiveGameSelection();
        if (mode) {
            updateRoutePath(targetPath, mode);
        }
        setResolvingGameRouteId(trimmedGameId);
        void resolveGameEntryForGameId(gameId).then((resolution) => {
            const activeRoute = parseRoute(getCurrentLocationPath());
            if (activeRoute.kind !== "game" || activeRoute.gameId !== trimmedGameId) {
                return;
            }
            if (resolution.kind === "unauthorized") {
                notifyAuthSessionExpired();
                clearAllActiveGameViews();
                clearActiveGameSelection();
                return;
            }
            if (resolution.kind === "server-unavailable") {
                notifyServerUnavailable();
                clearActiveGameSelection();
                return;
            }
            if (resolution.kind === "not-found") {
                clearAllActiveGameViews();
                clearActiveGameSelection();
                updateRoutePath("/lobby", "replace");
                return;
            }
            const entry = resolution.entry;
            setActiveGameSlug(entry.identity.slug);
            entry.lifecycle.openGame(dispatch, gameId);
            openedRouteGameIdRef.current = trimmedGameId;
            setOpenedRouteGameId(trimmedGameId);
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
                clearActiveGameSelection();
                if (route.kind !== "login") {
                    replaceToLogin(route.fullPath === "" ? "/" : route.fullPath);
                    setLocationPath(getCurrentLocationPath());
                }
                clearCreateDraft();
                clearAllActiveGameViews();
                return;
            }

            if (route.kind === "login") {
                const targetPath = getLoginRedirectPath();
                const targetRoute = parseRoute(targetPath);
                if (targetRoute.kind === "game" && targetRoute.gameId) {
                    openRouteGame(targetRoute.gameId, "replace");
                } else if (targetRoute.kind === "create") {
                    if (targetRoute.gameSlug) {
                        navigateToCreate(targetRoute.gameSlug, "replace");
                    } else {
                        navigateToLobby("replace");
                    }
                } else if (targetRoute.kind === "profile") {
                    navigateToProfile("replace");
                } else {
                    navigateToLobby("replace");
                }
                return;
            }

            switch (route.kind) {
                case "root":
                    navigateToLobby("replace");
                    return;
                case "create":
                    clearActiveGameSelection();
                    clearAllActiveGameViews();
                    if (route.gameSlug) enterCreateDraft(route.gameSlug);
                    return;
                case "game":
                    clearCreateDraft();
                    if (route.gameId) {
                        openRouteGame(route.gameId);
                    }
                    return;
                case "lobby":
                    clearActiveGameSelection();
                    clearCreateDraft();
                    clearAllActiveGameViews();
                    return;
                case "profile":
                    if (currentUser?.authType !== "local") {
                        navigateToLobby("replace");
                        return;
                    }
                    clearActiveGameSelection();
                    clearCreateDraft();
                    clearAllActiveGameViews();
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
    }, [authLoadState, currentUser?.authType, dispatch, gameEntries, gameEntriesBySlug, isAuthenticated]);

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
        if (currentRoute.kind === "game" && currentRoute.gameId && openedRouteGameId !== currentRoute.gameId) {
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
    }, [authLoadState, currentRoute.gameId, currentRoute.kind, isAuthenticated, locationPath, openedRouteGameId, resolvingGameRouteId, view]);

    return {
        page,
        navigateToLobby,
        navigateToCreate,
        navigateToProfile,
        navigateToGame,
        openGameFromLobby,
        createGameSlug: currentRoute.kind === "create" ? currentRoute.gameSlug : null,
        currentGameId: currentRoute.kind === "game" ? currentRoute.gameId : null
    };
};
