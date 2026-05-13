import { useEffect, useMemo, useState } from "react";

import { buildGameCreatePath, type GameEntry } from "@ravensanddragons/platform-frontend/game-entry";

interface ClickerGameState {
    id: string;
    gameSlug: "clicker";
    version: number;
    lifecycle: "active" | "finished";
    counter: number;
}

interface CreateGameResponse {
    game: ClickerGameState;
}

interface CommandResponse {
    game?: ClickerGameState;
    message?: string;
}

const playRoutePattern = /^\/g\/([^/]+)$/;
const emptyLifecycle = () => undefined;

const readGameIdFromLocation = (): string | null => {
    const routeGameId = window.location.pathname.match(playRoutePattern)?.[1] ?? null;
    return routeGameId ? decodeURIComponent(routeGameId) : null;
};

const fetchClickerGame = async (gameId: string): Promise<ClickerGameState> => {
    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}`);
    if (!response.ok) {
        throw new Error(`Unable to load game "${gameId}".`);
    }
    const game = await response.json() as ClickerGameState;
    if (game.gameSlug !== "clicker") {
        throw new Error(`Game "${gameId}" is not a Clicker game.`);
    }
    return game;
};

const createClickerGame = async (publiclyListed = true): Promise<ClickerGameState> => {
    const response = await fetch("/api/games/clicker", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ publiclyListed })
    });
    if (!response.ok) {
        throw new Error("Unable to start Clicker right now.");
    }
    const payload = await response.json() as CreateGameResponse;
    return payload.game;
};

const sendClick = async (game: ClickerGameState): Promise<ClickerGameState> => {
    const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/commands`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            type: "click",
            expectedVersion: game.version
        })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null) as CommandResponse | null;
        throw new Error(payload?.message ?? "Unable to click right now.");
    }
    return await response.json() as ClickerGameState;
};

const CreateClickerScreen = ({ onStartGame }: { gameName: string; onStartGame: (publiclyListed?: boolean) => void }) => {
    const [publiclyListed, setPubliclyListed] = useState(true);

    return (
        <section className="panel clicker-create-panel">
            <label className="checkbox-row">
                <input
                    type="checkbox"
                    checked={publiclyListed}
                    onChange={(event) => {
                        setPubliclyListed(event.target.checked);
                    }}
                />
                <span>Publicly list game</span>
            </label>
            <button
                id="start-clicker-button"
                type="button"
                onClick={() => {
                    onStartGame(publiclyListed);
                }}
            >
                Start
            </button>
        </section>
    );
};

const ClickerPlayScreen = () => {
    const gameId = useMemo(readGameIdFromLocation, []);
    const [game, setGame] = useState<ClickerGameState | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isFinished = game?.lifecycle === "finished" || game?.counter === 10;

    useEffect(() => {
        if (!gameId) {
            setMessage("Game ID is missing.");
            return;
        }

        let isActive = true;
        void fetchClickerGame(gameId)
            .then((loadedGame) => {
                if (isActive) {
                    setGame(loadedGame);
                    setMessage(null);
                }
            })
            .catch((error: unknown) => {
                if (isActive) {
                    setMessage(error instanceof Error ? error.message : "Unable to load Clicker.");
                }
            });

        const stream = new EventSource(`/api/games/${encodeURIComponent(gameId)}/stream`);
        stream.addEventListener("game", (event) => {
            const nextGame = JSON.parse((event as MessageEvent).data) as ClickerGameState;
            if (nextGame.gameSlug === "clicker") {
                setGame(nextGame);
                setMessage(null);
            }
        });
        stream.onerror = () => {
            stream.close();
        };

        return () => {
            isActive = false;
            stream.close();
        };
    }, [gameId]);

    const handleClick = () => {
        if (!game || isSubmitting || isFinished) {
            return;
        }

        setIsSubmitting(true);
        setMessage(null);
        void sendClick(game)
            .then(setGame)
            .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : "Unable to click right now.");
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    return (
        <section className="panel">
            <div className="page-header-copy">
                <h2>Clicker</h2>
            </div>
            <p aria-live="polite">Counter: {game?.counter ?? 0}</p>
            <button
                id="clicker-button"
                type="button"
                disabled={!game || isSubmitting || isFinished}
                onClick={handleClick}
            >
                Click
            </button>
            <p className="lobby-feedback" aria-live="polite">
                {isFinished ? "Game over" : message ?? " "}
            </p>
        </section>
    );
};

export const clickerGameEntry: GameEntry = {
    identity: {
        slug: "clicker",
        displayName: "Clicker"
    },
    routes: {
        createPath: buildGameCreatePath("clicker"),
        buildPlayPath: (gameId) => `/g/${encodeURIComponent(gameId.trim())}`,
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: {
        CreateScreen: CreateClickerScreen,
        PlayScreen: ClickerPlayScreen
    },
    lifecycle: {
        useSession: emptyLifecycle,
        startGame: async (_dispatch, _gameSlug, options) => {
            const game = await createClickerGame(options?.publiclyListed ?? true);
            return game.id;
        },
        openGame: emptyLifecycle,
        returnToLobby: emptyLifecycle,
        enterCreateMode: emptyLifecycle,
        clearCreateMode: emptyLifecycle
    }
};
