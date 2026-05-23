import { useEffect, useMemo, useState } from "react";

import {
    createResponseError,
    isServerUnavailableError,
    isUnauthorizedError,
    notifyAuthSessionExpired,
    notifyServerUnavailable,
    serverUnavailableMessage,
    sessionExpiredMessage
} from "@ravensanddragons/platform-frontend/api-client";
import { buildGameCreatePath, type GameEntry, type GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";

type TicTacToeMark = "X" | "O";

interface TicTacToeGameState {
    id: string;
    gameSlug: "tic-tac-toe";
    version: number;
    lifecycle: "active" | "finished";
    board: Array<TicTacToeMark | null>;
    currentMark: TicTacToeMark;
    winner: TicTacToeMark | null;
    winningLine: number[];
}

interface CreateGameResponse {
    game: TicTacToeGameState;
}

const playRoutePattern = /^\/g\/([^/]+)$/;
const emptyLifecycle = () => undefined;
const emptyBoard: Array<TicTacToeMark | null> = Array(9).fill(null);

const readGameIdFromLocation = (): string | null => {
    const routeGameId = window.location.pathname.match(playRoutePattern)?.[1] ?? null;
    return routeGameId ? decodeURIComponent(routeGameId) : null;
};

const fetchTicTacToeGame = async (gameId: string): Promise<TicTacToeGameState> => {
    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}`);
    if (!response.ok) {
        throw await createResponseError(response, `Unable to load game "${gameId}".`);
    }
    const game = await response.json() as TicTacToeGameState;
    if (game.gameSlug !== "tic-tac-toe") {
        throw new Error(`Game "${gameId}" is not a Tic-Tac-Toe game.`);
    }
    return game;
};

const createTicTacToeGame = async (publiclyListed = true): Promise<TicTacToeGameState> => {
    const response = await fetch("/api/games/tic-tac-toe", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ publiclyListed })
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to start Tic-Tac-Toe right now.");
    }
    const payload = await response.json() as CreateGameResponse;
    return payload.game;
};

const placeMark = async (game: TicTacToeGameState, cellIndex: number): Promise<TicTacToeGameState> => {
    const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/commands`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            type: "placeMark",
            expectedVersion: game.version,
            cellIndex
        })
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to place a mark right now.");
    }
    return await response.json() as TicTacToeGameState;
};

const statusForGame = (game: TicTacToeGameState | null): string => {
    if (!game) {
        return "Loading game...";
    }
    if (game.winner) {
        return `${game.winner} wins`;
    }
    if (game.lifecycle === "finished") {
        return "Draw";
    }
    return `${game.currentMark} to move`;
};

const CreateTicTacToeScreen = ({ onStartGame }: { gameName: string; onStartGame: (options?: GameStartOptions | boolean) => void }) => {
    const [publiclyListed, setPubliclyListed] = useState(true);

    return (
        <section className="panel tic-tac-toe-create-panel">
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
                id="start-tic-tac-toe-button"
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

const TicTacToePlayScreen = () => {
    const gameId = useMemo(readGameIdFromLocation, []);
    const [game, setGame] = useState<TicTacToeGameState | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const winningCells = new Set(game?.winningLine ?? []);
    const isFinished = game?.lifecycle === "finished";

    useEffect(() => {
        if (!gameId) {
            setMessage("Game ID is missing.");
            return;
        }

        let isActive = true;
        void fetchTicTacToeGame(gameId)
            .then((loadedGame) => {
                if (isActive) {
                    setGame(loadedGame);
                    setMessage(null);
                }
            })
            .catch((error: unknown) => {
                if (isActive) {
                    if (isUnauthorizedError(error)) {
                        notifyAuthSessionExpired();
                        setMessage(sessionExpiredMessage);
                    } else if (isServerUnavailableError(error)) {
                        notifyServerUnavailable();
                        setMessage(serverUnavailableMessage);
                    } else {
                        setMessage(error instanceof Error ? error.message : "Unable to load Tic-Tac-Toe.");
                    }
                }
            });

        const stream = new EventSource(`/api/games/${encodeURIComponent(gameId)}/stream`);
        stream.addEventListener("game", (event) => {
            const nextGame = JSON.parse((event as MessageEvent).data) as TicTacToeGameState;
            if (nextGame.gameSlug === "tic-tac-toe") {
                setGame(nextGame);
                setMessage(null);
            }
        });
        stream.onerror = () => {
            notifyServerUnavailable();
            stream.close();
        };

        return () => {
            isActive = false;
            stream.close();
        };
    }, [gameId]);

    const handlePlaceMark = (cellIndex: number) => {
        if (!game || isSubmitting || isFinished || game.board[cellIndex]) {
            return;
        }

        setIsSubmitting(true);
        setMessage(null);
        void placeMark(game, cellIndex)
            .then(setGame)
            .catch((error: unknown) => {
                if (isUnauthorizedError(error)) {
                    notifyAuthSessionExpired();
                    setMessage(sessionExpiredMessage);
                } else if (isServerUnavailableError(error)) {
                    notifyServerUnavailable();
                    setMessage(serverUnavailableMessage);
                } else {
                    setMessage(error instanceof Error ? error.message : "Unable to place a mark right now.");
                }
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    return (
        <section className="game-page tic-tac-toe-page">
            <h1 className="content-title">Tic-Tac-Toe</h1>

            <section className="tic-tac-toe-layout">
                <section className="panel page-header-panel tic-tac-toe-status-panel">
                    <div className="page-header-copy">
                        <h2>{gameId ? `Game ${gameId}` : "Current Game"}</h2>
                        <p className="tic-tac-toe-status" aria-live="polite">{statusForGame(game)}</p>
                        <p className="tic-tac-toe-message" aria-live="polite">
                            {message ?? " "}
                        </p>
                    </div>
                </section>

                <section className="panel tic-tac-toe-board-panel">
                    <div className="tic-tac-toe-board" role="grid" aria-label="Tic-Tac-Toe board">
                        {(game?.board ?? emptyBoard).map((mark, cellIndex) => (
                            <button
                                key={cellIndex}
                                type="button"
                                className={[
                                    "tic-tac-toe-square",
                                    mark ? "is-filled" : "",
                                    winningCells.has(cellIndex) ? "is-winning" : ""
                                ].filter(Boolean).join(" ")}
                                role="gridcell"
                                disabled={!game || isSubmitting || isFinished || Boolean(mark)}
                                aria-label={`Square ${cellIndex + 1}${mark ? `, ${mark}` : ""}`}
                                onClick={() => {
                                    handlePlaceMark(cellIndex);
                                }}
                            >
                                {mark ?? ""}
                            </button>
                        ))}
                    </div>
                </section>
            </section>
        </section>
    );
};

export const ticTacToeGameEntry: GameEntry = {
    identity: {
        slug: "tic-tac-toe",
        displayName: "Tic-Tac-Toe"
    },
    routes: {
        createPath: buildGameCreatePath("tic-tac-toe"),
        buildPlayPath: (gameId) => `/g/${encodeURIComponent(gameId.trim())}`,
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: {
        CreateScreen: CreateTicTacToeScreen,
        PlayScreen: TicTacToePlayScreen
    },
    lifecycle: {
        useSession: emptyLifecycle,
        startGame: async (_dispatch, _gameSlug, options) => {
            const game = await createTicTacToeGame(options?.publiclyListed ?? true);
            return game.id;
        },
        openGame: emptyLifecycle,
        returnToLobby: emptyLifecycle,
        enterCreateMode: emptyLifecycle,
        clearCreateMode: emptyLifecycle
    }
};
