import { useState } from "react";

interface LobbyScreenProps {
    feedbackMessage: string | null;
    isLoading: boolean;
    onCreateGame: () => void;
    onOpenGame: (gameId: string) => void;
}

export const LobbyScreen = ({
    feedbackMessage,
    isLoading,
    onCreateGame,
    onOpenGame
}: LobbyScreenProps) => {
    const [gameId, setGameId] = useState("");
    const trimmedGameId = gameId.trim();

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
                    <button
                        id="create-game-button"
                        type="button"
                        disabled={isLoading}
                        onClick={onCreateGame}
                    >
                        Create Game
                    </button>
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
