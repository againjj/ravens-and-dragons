import { useState } from "react";

import type { GameEntryIdentity } from "@ravensanddragons/platform-frontend/game-entry";

export interface PublicGameListing {
    gameId: string;
    gameSlug: string;
    gameName: string;
    openSeats: number;
}

interface LobbyScreenProps {
    games: GameEntryIdentity[];
    publicGames: PublicGameListing[];
    selectedGameSlug: string;
    feedbackMessage: string | null;
    openErrorMessage: string | null;
    isLoading: boolean;
    onCreateGame: (gameSlug: string) => void;
    onDismissOpenError: () => void;
    onOpenGame: (gameId: string) => void;
    onSelectGame: (gameSlug: string) => void;
}

export const LobbyScreen = ({
    games,
    publicGames,
    selectedGameSlug,
    feedbackMessage,
    openErrorMessage,
    isLoading,
    onCreateGame,
    onDismissOpenError,
    onOpenGame,
    onSelectGame
}: LobbyScreenProps) => {
    const [gameId, setGameId] = useState("");
    const [selectedPublicGameId, setSelectedPublicGameId] = useState<string | null>(null);
    const trimmedGameId = gameId.trim();
    const gameIdToOpen = selectedPublicGameId ?? trimmedGameId;
    const selectedGame = games.find((game) => game.slug === selectedGameSlug) ?? games[0];

    return (
        <section className="lobby-layout">
            <section className="panel page-header-panel">
                <div className="page-header-copy">
                    <h2>Game Lobby</h2>
                    <p>Start a shared session for a new matchup or rejoin one with its game ID.</p>
                </div>
            </section>

            <div className="lobby-grid">
                <section className="lobby-card">
                    <div className="lobby-card-copy">
                        <h3>Start Fresh</h3>
                        <p>Create a game to start playing a new game.</p>
                    </div>
                    <div className="lobby-actions">
                        <div className="control-row game-picker-row">
                            <label className="control-label" htmlFor="game-select">
                                Game
                            </label>
                            <div className="select-shell">
                                <select
                                    id="game-select"
                                    value={selectedGame?.slug ?? ""}
                                    disabled={isLoading || games.length === 0}
                                    onChange={(event) => {
                                        onSelectGame(event.target.value);
                                    }}
                                >
                                    {games.map((game) => (
                                        <option key={game.slug} value={game.slug}>
                                            {game.displayName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button
                            id="create-game-button"
                            type="button"
                            disabled={isLoading || !selectedGame}
                            onClick={() => {
                                if (selectedGame) {
                                    onCreateGame(selectedGame.slug);
                                }
                            }}
                        >
                            Create Game
                        </button>
                    </div>
                </section>

                <section className="lobby-card">
                    <div className="lobby-card-copy">
                        <h3>Join Game</h3>
                        <p>Select a public game or paste a game ID to open it.</p>
                        <div className="public-game-list" role="listbox" aria-label="Public games">
                            {publicGames.length === 0 ? (
                                <p className="public-game-empty">No public games are available.</p>
                            ) : (
                                publicGames.map((publicGame) => {
                                    const openSeatLabel = `${publicGame.openSeats} open ${publicGame.openSeats === 1 ? "seat" : "seats"}`;
                                    return (
                                        <button
                                            key={publicGame.gameId}
                                            type="button"
                                            role="option"
                                            aria-selected={selectedPublicGameId === publicGame.gameId}
                                            className="public-game-option"
                                            disabled={isLoading}
                                            onClick={() => {
                                                setSelectedPublicGameId(publicGame.gameId);
                                                setGameId("");
                                            }}
                                        >
                                            {publicGame.gameName} ({openSeatLabel}): {publicGame.gameId}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    <div className="lobby-actions">
                        <div className="control-row">
                            <label className="control-label" htmlFor="game-id-input">
                                Game ID
                            </label>
                            <input
                                id="game-id-input"
                                className="text-input"
                                type="text"
                                value={gameId}
                                disabled={isLoading}
                                placeholder="Example: C7H2RMW"
                                autoCapitalize="characters"
                                spellCheck={false}
                                onFocus={() => {
                                    setSelectedPublicGameId(null);
                                }}
                                onClick={() => {
                                    setSelectedPublicGameId(null);
                                }}
                                onChange={(event) => {
                                    setSelectedPublicGameId(null);
                                    setGameId(event.target.value.toUpperCase());
                                }}
                            />
                        </div>

                        <button
                            id="open-game-button"
                            type="button"
                            disabled={isLoading || gameIdToOpen.length === 0}
                            onClick={() => {
                                onOpenGame(gameIdToOpen);
                            }}
                        >
                            Open Game
                        </button>
                    </div>
                </section>
            </div>

            <p className="lobby-feedback" aria-live="polite">
                {feedbackMessage ?? " "}
            </p>
            {openErrorMessage ? (
                <div
                    className="modal-backdrop"
                    role="presentation"
                    onClick={onDismissOpenError}
                >
                    <section
                        className="panel modal-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="lobby-open-error-title"
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <h2 id="lobby-open-error-title">Open Game Error</h2>
                        <p>{openErrorMessage}</p>
                        <button type="button" onClick={onDismissOpenError}>
                            OK
                        </button>
                    </section>
                </div>
            ) : null}
        </section>
    );
};
