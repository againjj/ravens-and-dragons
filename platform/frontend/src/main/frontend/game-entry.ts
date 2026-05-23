import type { ComponentType } from "react";

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
    CreateScreen: ComponentType<{ gameName: string; onStartGame: (options?: GameStartOptions | boolean) => void }>;
    PlayScreen: ComponentType;
}

export interface GameStartOptions {
    publiclyListed?: boolean;
    [key: string]: unknown;
}

export interface GameEntryLifecycle<AppDispatch = unknown> {
    useSession: () => void;
    startGame: (dispatch: AppDispatch, gameSlug: string, options?: GameStartOptions) => Promise<string | null>;
    openGame: (dispatch: AppDispatch, gameId: string) => void | Promise<boolean>;
    returnToLobby: (dispatch: AppDispatch) => void;
    enterCreateMode: (dispatch: AppDispatch) => void;
    clearCreateMode: (dispatch: AppDispatch) => void;
}

export interface GameEntry<AppDispatch = unknown> {
    identity: GameEntryIdentity;
    routes: GameEntryRoutes;
    components: GameEntryComponents;
    lifecycle: GameEntryLifecycle<AppDispatch>;
}

export const buildGameCreatePath = (gameSlug: string): string => `/${gameSlug}/create`;
