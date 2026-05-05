import { useState } from "react";

import type { GameEntryIdentity } from "../game-entry.js";

interface LobbyScreenProps {
    games: GameEntryIdentity[];
    selectedGameSlug: string;
    feedbackMessage: string | null;
    isLoading: boolean;
    onCreateGame: (gameSlug: string) => void;
    onOpenGame: (gameId: string) => void;
    onSelectGame: (gameSlug: string) => void;
}

export const LobbyScreen = ({
    games,
    selectedGameSlug,
    feedbackMessage,
    isLoading,
    onCreateGame,
    onOpenGame,
    onSelectGame
}: LobbyScreenProps) => {
    const [gameId, setGameId] = useState("");
    const trimmedGameId = gameId.trim();
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
                        <div className="control-row">
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
                        <p>Paste an existing game ID to open the shared board and move history. Game IDs are case-insensitive.</p>
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
                                onChange={(event) => {
                                    setGameId(event.target.value.toUpperCase());
                                }}
                            />
                        </div>

                        <button
                            id="open-game-button"
                            type="button"
                            disabled={isLoading || trimmedGameId.length === 0}
                            onClick={() => {
                                onOpenGame(trimmedGameId);
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
        </section>
    );
};
