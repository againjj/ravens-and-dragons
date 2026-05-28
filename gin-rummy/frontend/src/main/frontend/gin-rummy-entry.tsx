import { buildGameCreatePath, type GameEntry } from "@ravensanddragons/platform-frontend/game-entry";
import { CreateGinRummyScreen } from "./CreateGinRummyScreen";
import { GinRummyPlayScreen } from "./GinRummyPlayScreen";
import { createGinRummyGame, playRoutePattern } from "./gin-rummy-client";
import { GinRummyReduxProvider } from "./gin-rummy-store";
import "./gin-rummy.css";

const emptyLifecycle = () => undefined;
const ReduxCreateGinRummyScreen = (props: Parameters<typeof CreateGinRummyScreen>[0]) => (
    <GinRummyReduxProvider>
        <CreateGinRummyScreen {...props} />
    </GinRummyReduxProvider>
);
const ReduxGinRummyPlayScreen = () => (
    <GinRummyReduxProvider>
        <GinRummyPlayScreen />
    </GinRummyReduxProvider>
);

export const ginRummyGameEntry: GameEntry = {
    identity: { slug: "gin-rummy", displayName: "Gin Rummy" },
    routes: {
        createPath: buildGameCreatePath("gin-rummy"),
        buildPlayPath: (gameId) => "/g/" + encodeURIComponent(gameId.trim()),
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: { CreateScreen: ReduxCreateGinRummyScreen, PlayScreen: ReduxGinRummyPlayScreen },
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
