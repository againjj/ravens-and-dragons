import { buildGameCreatePath, type GameEntry } from "@ravensanddragons/platform-frontend/game-entry";
import { CreateGinRummyScreen } from "./CreateGinRummyScreen";
import { GinRummyPlayScreen } from "./GinRummyPlayScreen";
import { createGinRummyGame, playRoutePattern } from "./gin-rummy-client";
const emptyLifecycle = () => undefined;
export const ginRummyGameEntry: GameEntry = {
    identity: { slug: "gin-rummy", displayName: "Gin Rummy" },
    routes: {
        createPath: buildGameCreatePath("gin-rummy"),
        buildPlayPath: (gameId) => "/g/" + encodeURIComponent(gameId.trim()),
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: { CreateScreen: CreateGinRummyScreen, PlayScreen: GinRummyPlayScreen },
    lifecycle: {
        useSession: emptyLifecycle,
        startGame: async (_dispatch, _gameSlug, options) => {
            const game = await createGinRummyGame(options);
            return game.id;
        },
        openGame: emptyLifecycle,
        returnToLobby: emptyLifecycle,
        enterCreateMode: emptyLifecycle,
        clearCreateMode: emptyLifecycle
    }
};
