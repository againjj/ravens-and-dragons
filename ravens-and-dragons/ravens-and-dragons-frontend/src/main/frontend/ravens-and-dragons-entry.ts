import { CreateGameScreen } from "./components/CreateGameScreen.js";
import { GameScreen } from "./components/GameScreen.js";
import { createGameDraftActions } from "./features/game/createGameSlice.js";
import { createGame, openGame, returnToLobby } from "./features/game/gameThunks.js";
import { useGameSession } from "./features/game/useGameSession.js";
import type { GameEntry } from "./game-entry.js";
import { generatedGameIdPattern } from "./game-types.js";

const playRoutePattern = /^\/g\/([^/]+)$/;

const matchPlayPath = (pathname: string): string | null => {
    const routeGameId = pathname.match(playRoutePattern)?.[1] ?? null;
    if (!routeGameId) {
        return null;
    }

    const gameId = decodeURIComponent(routeGameId);
    return generatedGameIdPattern.test(gameId) ? gameId : null;
};

export const ravensAndDragonsGameEntry: GameEntry = {
    identity: {
        slug: "ravens-and-dragons",
        displayName: "Ravens and Dragons"
    },
    routes: {
        createPath: "/create",
        buildPlayPath: (gameId) => `/g/${encodeURIComponent(gameId.trim())}`,
        matchPlayPath
    },
    components: {
        CreateScreen: CreateGameScreen,
        PlayScreen: GameScreen
    },
    lifecycle: {
        useSession: useGameSession,
        startGame: (dispatch) => dispatch(createGame()),
        openGame: (dispatch, gameId) => {
            void dispatch(openGame(gameId));
        },
        returnToLobby: (dispatch) => {
            dispatch(returnToLobby());
        },
        enterCreateMode: (dispatch) => {
            dispatch(createGameDraftActions.createModeEntered());
        },
        clearCreateMode: (dispatch) => {
            dispatch(createGameDraftActions.createModeCleared());
        }
    }
};
