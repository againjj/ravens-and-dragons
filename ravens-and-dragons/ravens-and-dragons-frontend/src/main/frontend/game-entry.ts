import type { ComponentType } from "react";

import type { AppDispatch } from "./app/store.js";

export interface GameEntryIdentity {
    slug: string;
    displayName: string;
}

export interface GameEntryRoutes {
    createPath: string;
    buildPlayPath: (gameId: string) => string;
    matchPlayPath: (pathname: string) => string | null;
}

export interface GameEntryComponents {
    CreateScreen: ComponentType<{ onStartGame: () => void }>;
    PlayScreen: ComponentType;
}

export interface GameEntryLifecycle {
    useSession: () => void;
    startGame: (dispatch: AppDispatch) => Promise<string | null>;
    openGame: (dispatch: AppDispatch, gameId: string) => void;
    returnToLobby: (dispatch: AppDispatch) => void;
    enterCreateMode: (dispatch: AppDispatch) => void;
    clearCreateMode: (dispatch: AppDispatch) => void;
}

export interface GameEntry {
    identity: GameEntryIdentity;
    routes: GameEntryRoutes;
    components: GameEntryComponents;
    lifecycle: GameEntryLifecycle;
}
