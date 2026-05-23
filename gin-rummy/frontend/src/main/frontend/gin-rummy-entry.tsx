import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
    createResponseError,
    fetchAuthSession,
    fetchUsers,
    isServerUnavailableError,
    isUnauthorizedError,
    notifyAuthSessionExpired,
    notifyServerUnavailable,
    serverUnavailableMessage,
    sessionExpiredMessage
} from "@ravensanddragons/platform-frontend/api-client";
import type { AuthUserSummary } from "@ravensanddragons/platform-frontend/auth-types";
import { buildGameCreatePath, type GameEntry, type GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";
import { PlayerPicker } from "@ravensanddragons/platform-frontend/player-picker";

type Suit = "clubs" | "diamonds" | "hearts" | "spades";
type Phase = "setup" | "firstUpcard" | "draw" | "discardOnly" | "discard" | "roundOver" | "gameOver" | "matchOver";

interface GinRummyConfig {
    targetScore: number;
    playMode: "singleGame" | "bestOfFiveMatch";
    bigGinAllowed: boolean;
    optionalDealRule: boolean;
    lineBonusEnabled: boolean;
    shutoutBonusEnabled: boolean;
    aceHighAllowed: boolean;
}

interface Card {
    id: string;
    rank: string;
    suit: Suit;
}

interface Seat {
    userId: string | null;
    displayName: string | null;
}

interface ScoreLine {
    seat: number;
    points: number;
    reason: string;
    gameNumber: number;
    roundNumber: number;
}

interface Scores {
    gamePoints: number[];
    totalPoints: number[];
    gamesWon: number[];
    handsWonThisGame: number[];
    runningLines: ScoreLine[];
}

interface MeldArrangement {
    melds: string[][];
    deadwood: string[];
    deadwoodScore: number;
}

interface RoundResult {
    winnerSeat: number | null;
    points: number;
    reason: string;
    knockerSeat: number | null;
    knockerDeadwood: number | null;
    defenderDeadwood: number | null;
    selectedMelds: string[][];
    selectedDeadwood: string[];
    defenderMelds: string[][];
    defenderDeadwoodCards: string[];
    layoffs: string[];
}

interface ViewerInfo {
    userId: string | null;
    hands: Record<string, Card[]>;
    deadwood: Record<string, number>;
    knockOptions: Record<string, MeldArrangement[]>;
}

interface GinRummyGame {
    id: string;
    gameSlug: "gin-rummy";
    version: number;
    lifecycle: string;
    config: GinRummyConfig;
    seats: Seat[];
    dealerSeat: number;
    currentSeat: number;
    phase: Phase;
    gameNumber: number;
    roundNumber: number;
    stockCount: number;
    discardTop: Card | null;
    discardCount: number;
    handCounts: number[];
    scores: Scores;
    roundResult: RoundResult | null;
    winnerSeat: number | null;
    message: string | null;
    viewer?: ViewerInfo;
}

interface CreateGameResponse {
    game: GinRummyGame;
}

const playRoutePattern = /^\/g\/([^/]+)$/;
const emptyLifecycle = () => undefined;
const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const deckById = new Map(suits.flatMap((suit) => ranks.map((rank) => [`${rank}_${suit}`, { id: `${rank}_${suit}`, rank, suit } as Card])));

const readGameIdFromLocation = (): string | null => {
    const routeGameId = window.location.pathname.match(playRoutePattern)?.[1] ?? null;
    return routeGameId ? decodeURIComponent(routeGameId) : null;
};

const fetchGinRummyGame = async (gameId: string): Promise<GinRummyGame> => {
    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/view`);
    if (!response.ok) {
        throw await createResponseError(response, `Unable to load game "${gameId}".`);
    }
    const game = await response.json() as GinRummyGame;
    if (game.gameSlug !== "gin-rummy") {
        throw new Error(`Game "${gameId}" is not a Gin Rummy game.`);
    }
    return game;
};

const createGinRummyGame = async (options: GameStartOptions = {}): Promise<GinRummyGame> => {
    const response = await fetch("/api/games/gin-rummy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options)
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to start Gin Rummy right now.");
    }
    const payload = await response.json() as CreateGameResponse;
    return payload.game;
};

const sendCommand = async (game: GinRummyGame, command: Record<string, unknown>): Promise<GinRummyGame> => {
    const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, expectedVersion: game.version })
    });
    if (!response.ok) {
        throw await createResponseError(response, "Unable to update Gin Rummy right now.");
    }
    return fetchGinRummyGame(game.id);
};

const CreateGinRummyScreen = ({ onStartGame }: { gameName: string; onStartGame: (options?: GameStartOptions | boolean) => void }) => {
    const [publiclyListed, setPubliclyListed] = useState(true);
    const [targetScore, setTargetScore] = useState(100);
    const [playMode, setPlayMode] = useState<GinRummyConfig["playMode"]>("singleGame");
    const [bigGinAllowed, setBigGinAllowed] = useState(false);
    const [optionalDealRule, setOptionalDealRule] = useState(true);
    const [lineBonusEnabled, setLineBonusEnabled] = useState(false);
    const [shutoutBonusEnabled, setShutoutBonusEnabled] = useState(true);
    const [aceHighAllowed, setAceHighAllowed] = useState(false);

    return (
        <section className="panel gin-create-panel">
            <div className="page-header-copy">
                <h2>Create Gin Rummy</h2>
            </div>
            <div className="gin-create-options">
                <label className="control-row gin-create-row">
                    <span className="control-label">Target score</span>
                    <input
                        className="text-input"
                        type="number"
                        min="1"
                        value={targetScore}
                        onChange={(event) => setTargetScore(Number(event.target.value))}
                    />
                </label>
                <label className="control-row gin-create-row">
                    <span className="control-label">Game type</span>
                    <span className="select-shell">
                        <select value={playMode} onChange={(event) => setPlayMode(event.target.value as GinRummyConfig["playMode"])}>
                            <option value="singleGame">Single game</option>
                            <option value="bestOfFiveMatch">Best of five match</option>
                        </select>
                    </span>
                </label>
                <label className="checkbox-row"><input type="checkbox" checked={publiclyListed} onChange={(event) => setPubliclyListed(event.target.checked)} /><span>Publicly list game</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={bigGinAllowed} onChange={(event) => setBigGinAllowed(event.target.checked)} /><span>Allow Big Gin</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={optionalDealRule} onChange={(event) => setOptionalDealRule(event.target.checked)} /><span>Optional 11-card first deal</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={lineBonusEnabled} onChange={(event) => setLineBonusEnabled(event.target.checked)} /><span>Line Bonus</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={shutoutBonusEnabled} onChange={(event) => setShutoutBonusEnabled(event.target.checked)} /><span>Shutout Bonus</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={aceHighAllowed} onChange={(event) => setAceHighAllowed(event.target.checked)} /><span>Ace can be high in runs</span></label>
            </div>
            <button
                type="button"
                onClick={() => onStartGame({
                    publiclyListed,
                    targetScore,
                    playMode,
                    bigGinAllowed,
                    optionalDealRule,
                    lineBonusEnabled,
                    shutoutBonusEnabled,
                    aceHighAllowed
                })}
            >
                Start
            </button>
        </section>
    );
};

const GinRummyPlayScreen = () => {
    const gameId = useMemo(readGameIdFromLocation, []);
    const [game, setGame] = useState<GinRummyGame | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activePickerSeat, setActivePickerSeat] = useState<number | null>(null);
    const [players, setPlayers] = useState<AuthUserSummary[]>([]);
    const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
    const [revealedTurnKey, setRevealedTurnKey] = useState<string | null>(null);
    const [knockCardId, setKnockCardId] = useState<string>("");
    const [knockOptions, setKnockOptions] = useState<MeldArrangement[]>([]);

    const loadGame = useCallback(() => {
        if (!gameId) {
            setMessage("Game ID is missing.");
            return;
        }
        void fetchGinRummyGame(gameId)
            .then((loaded) => {
                setGame(loaded);
                setMessage(null);
            })
            .catch((error: unknown) => handleAsyncError(error, setMessage));
    }, [gameId]);

    useEffect(() => {
        loadGame();
    }, [loadGame]);

    useEffect(() => {
        void fetchAuthSession()
            .then((session) => setCurrentUser(session.user))
            .catch((error: unknown) => handleAsyncError(error, setMessage));
    }, []);

    useEffect(() => {
        if (!gameId) return;
        const stream = new EventSource(`/api/games/${encodeURIComponent(gameId)}/stream`);
        stream.addEventListener("game", () => loadGame());
        stream.onerror = () => {
            notifyServerUnavailable();
            stream.close();
        };
        return () => {
            stream.close();
        };
    }, [gameId, loadGame]);

    useEffect(() => {
        if (!game) return;
        setKnockCardId("");
        setKnockOptions([]);
        setRevealedTurnKey(null);
    }, [game?.currentSeat, game?.roundNumber]);

    const currentUserId = game?.viewer?.userId ?? null;
    const userSeats = game?.seats.map((seat, index) => seat.userId === currentUserId ? index : null).filter((seat): seat is number => seat !== null) ?? [];
    const sameUserBothSeats = userSeats.length === 2;
    const bottomSeat = !game ? 1 : sameUserBothSeats ? game.currentSeat : userSeats[0] ?? 1 - game.dealerSeat;
    const topSeat = 1 - bottomSeat;
    const currentTurnKey = game ? `${game.id}:${game.roundNumber}:${game.currentSeat}` : "";
    const bottomHand = game?.viewer?.hands[String(bottomSeat)] ?? [];
    const bottomIsViewerSeat = userSeats.includes(bottomSeat);
    const shouldHideBottom = sameUserBothSeats && game?.currentSeat === bottomSeat && revealedTurnKey !== currentTurnKey;
    const bottomFaceUp = bottomIsViewerSeat && !shouldHideBottom;
    const canAct = Boolean(game && bottomIsViewerSeat && game.currentSeat === bottomSeat && bottomFaceUp && !isSubmitting);
    const selectedKnockOptions = useMemo(() => {
        if (!game || !knockCardId) return [];
        const remaining = bottomHand.filter((card) => card.id !== knockCardId);
        return findArrangements(remaining, game.config.aceHighAllowed).filter((option) => option.deadwoodScore <= 10);
    }, [bottomHand, game, knockCardId]);
    const isMatch = game?.config.playMode === "bestOfFiveMatch";

    const runCommand = (command: Record<string, unknown>) => {
        if (!game) return;
        setIsSubmitting(true);
        setMessage(null);
        void sendCommand(game, command)
            .then(setGame)
            .catch((error: unknown) => handleAsyncError(error, setMessage))
            .finally(() => setIsSubmitting(false));
    };

    const openPicker = (seat: number) => {
        setActivePickerSeat(seat);
        void fetchUsers().then(setPlayers).catch(() => setPlayers([]));
    };

    const startKnock = () => {
        if (!game || !knockCardId) return;
        setKnockOptions(selectedKnockOptions);
    };

    const renderSeat = (seatIndex: number, position: "top" | "bottom") => {
        if (!game) return null;
        const seat = game.seats[seatIndex];
        const isDealer = game.dealerSeat === seatIndex;
        const seatName = seat.displayName;
        return (
            <aside className={`gin-seat gin-seat-${position}`}>
                <div className="gin-seat-name">
                    {seatName ? (
                        <strong>{seatName}</strong>
                    ) : (
                        <button type="button" disabled={isSubmitting} onClick={() => openPicker(seatIndex)}>
                            Add Player
                        </button>
                    )}
                    {isDealer ? <span className="gin-seat-pill">Dealer</span> : null}
                    {game.currentSeat === seatIndex ? <span>Turn</span> : null}
                </div>
                <div className="gin-seat-score">
                    <span>Game {game.scores.gamePoints[seatIndex]}</span>
                    <span>Total {game.scores.totalPoints[seatIndex]}</span>
                    {isMatch ? <span>Games {game.scores.gamesWon[seatIndex]}</span> : null}
                </div>
            </aside>
        );
    };

    if (!game) {
        return <section className="panel"><p>{message ?? "Loading Gin Rummy..."}</p></section>;
    }

    return (
        <section className="game-page gin-page">
            <h1 className="content-title">Gin Rummy</h1>
            <section className="gin-board-shell">
                {renderSeat(topSeat, "top")}
                <Hand
                    cards={[]}
                    count={game.handCounts[topSeat] ?? 0}
                    faceUp={false}
                    position="top"
                    onReorder={() => {}}
                    onDiscard={() => {}}
                    onDrawDiscard={() => {}}
                    canDiscard={false}
                    canDrawDiscard={false}
                    interactive={false}
                />
                <section className="gin-table">
                    <button type="button" className="gin-stock" disabled={!canAct || game.phase !== "draw"} onClick={() => runCommand({ type: "drawStock" })}>
                        <strong>{game.stockCount}</strong>
                    </button>
                    <button
                        type="button"
                        className={`gin-discard ${game.discardTop ? "" : "is-empty"}`}
                        disabled={!canAct || (game.phase !== "draw" && game.phase !== "firstUpcard") || !game.discardTop}
                        draggable={Boolean(canAct && game.discardTop && (game.phase === "draw" || game.phase === "firstUpcard"))}
                        onDragStart={(event) => {
                            if (game.discardTop) {
                                event.dataTransfer.setData("text/plain", game.discardTop.id);
                                event.dataTransfer.setData("application/x-gin-source", "discard");
                            }
                        }}
                        onClick={() => runCommand({ type: "drawDiscard" })}
                        onDragOver={(event) => {
                            if (canAct && game.phase !== "draw" && game.phase !== "firstUpcard") event.preventDefault();
                        }}
                        onDrop={(event) => {
                            const cardId = event.dataTransfer.getData("text/plain");
                            if (cardId && canAct && game.phase !== "draw" && game.phase !== "firstUpcard") {
                                runCommand({ type: "discard", cardId });
                            }
                        }}
                    >
                        {game.discardTop ? <CardView card={game.discardTop} /> : null}
                    </button>
                    <div className="gin-table-actions">
                        {game.phase === "setup" && game.seats.every((seat) => seat.userId) ? <button type="button" onClick={() => runCommand({ type: "startHand" })}>Start Hand</button> : null}
                        {canAct && game.phase === "firstUpcard" ? <button type="button" onClick={() => runCommand({ type: "passUpcard" })}>Pass</button> : null}
                        {game.phase === "roundOver" ? <button type="button" onClick={() => runCommand({ type: "nextHand" })}>Next Hand</button> : null}
                        {game.phase === "gameOver" && game.config.playMode === "bestOfFiveMatch" ? <button type="button" onClick={() => runCommand({ type: "nextGame" })}>Next Game</button> : null}
                    </div>
                </section>
                {renderSeat(bottomSeat, "bottom")}
                <section className="gin-bottom-hand-wrap">
                    {shouldHideBottom ? (
                        <button type="button" className="gin-show-cards" onClick={() => setRevealedTurnKey(currentTurnKey)}>
                            Show Cards
                        </button>
                    ) : null}
                    <div className="gin-deadwood">{bottomFaceUp ? `Deadwood: ${findBestDeadwood(bottomHand, game.config.aceHighAllowed)} points` : " "}</div>
                    <Hand
                        cards={bottomHand}
                        count={game.handCounts[bottomSeat] ?? 0}
                        faceUp={bottomFaceUp}
                        position="bottom"
                        canDiscard={canAct && game.phase !== "draw" && game.phase !== "firstUpcard"}
                        canDrawDiscard={canAct && Boolean(game.discardTop) && (game.phase === "draw" || game.phase === "firstUpcard")}
                        onDiscard={(cardId) => runCommand({ type: "discard", cardId })}
                        onDrawDiscard={() => runCommand({ type: "drawDiscard" })}
                        onReorder={(cardIds) => runCommand({ type: "reorderHand", cardIds })}
                        interactive
                    />
                </section>
                <section className="gin-controls">
                    {canAct && game.phase === "discard" ? (
                        <div className="gin-knock-box">
                            <span className="select-shell">
                                <select aria-label="Discard before knocking" value={knockCardId} onChange={(event) => setKnockCardId(event.target.value)}>
                                    <option value="">Knock discard...</option>
                                    {bottomHand.map((card) => <option key={card.id} value={card.id}>{cardLabel(card)}</option>)}
                                </select>
                            </span>
                            <button type="button" disabled={selectedKnockOptions.length === 0} onClick={startKnock}>Knock Options</button>
                            {game.config.bigGinAllowed && findBestDeadwood(bottomHand, game.config.aceHighAllowed) === 0 && bottomHand.length === 11 ? (
                                <button type="button" onClick={() => runCommand({ type: "bigGin", arrangement: findArrangements(bottomHand, game.config.aceHighAllowed)[0] })}>Big Gin</button>
                            ) : null}
                        </div>
                    ) : null}
                </section>
            </section>

            <section className="gin-score-rules">
                <section className="panel gin-score-sheet">
                    <h2>Scoring</h2>
                    <div className="gin-score-grid">
                        {[0, 1].map((seat) => (
                            <div key={seat}>
                                <strong>{game.seats[seat].displayName ?? `Open seat ${seat + 1}`}</strong>
                                <span>Game: {game.scores.gamePoints[seat]}</span>
                                <span>Total: {game.scores.totalPoints[seat]}</span>
                                {isMatch ? <span>Games won: {game.scores.gamesWon[seat]}</span> : null}
                            </div>
                        ))}
                    </div>
                    {game.roundResult ? <RoundResultPanel result={game.roundResult} /> : null}
                    <ol className="gin-score-lines">
                        {game.scores.runningLines.map((line, index) => (
                            <li key={index}>G{line.gameNumber} H{line.roundNumber}: Seat {line.seat + 1} +{line.points} {line.reason}</li>
                        ))}
                    </ol>
                </section>
                <RulesReference config={game.config} />
            </section>

            {activePickerSeat !== null ? createPortal(
                <div className="seat-player-picker-backdrop" role="presentation">
                    <section className="panel seat-player-picker-modal" role="dialog" aria-modal="true" aria-label="Gin Rummy player picker">
                        <PlayerPicker
                            players={players.filter((player) => player.id !== currentUserId)}
                            bots={[]}
                            onAddMyself={() => {
                                setActivePickerSeat(null);
                                runCommand({ type: "claimSeat", seat: activePickerSeat, playerUserId: currentUserId, displayName: currentUser?.displayName ?? "Player" });
                            }}
                            onAddPlayer={(playerUserId) => {
                                const player = players.find((candidate) => candidate.id === playerUserId);
                                setActivePickerSeat(null);
                                runCommand({ type: "claimSeat", seat: activePickerSeat, playerUserId, displayName: player?.displayName ?? "Player" });
                            }}
                            onAddBot={() => {}}
                            onCancel={() => setActivePickerSeat(null)}
                        />
                    </section>
                </div>,
                document.body
            ) : null}

            {knockOptions.length > 0 ? createPortal(
                <div className="modal-backdrop" role="presentation">
                    <section className="panel gin-knock-modal" role="dialog" aria-modal="true" aria-label="Choose knock arrangement">
                        <h2>Choose Knock Arrangement</h2>
                        {knockOptions.map((option, index) => (
                            <button key={index} type="button" onClick={() => {
                                runCommand({ type: option.deadwoodScore === 0 ? "gin" : "knock", cardId: knockCardId, arrangement: option });
                                setKnockOptions([]);
                            }}>
                                {option.deadwoodScore} deadwood: {option.melds.map((meld) => meld.map(cardLabelById).join(" ")).join(" / ") || "No melds"}
                            </button>
                        ))}
                        <button type="button" onClick={() => setKnockOptions([])}>Cancel</button>
                    </section>
                </div>,
                document.body
            ) : null}
        </section>
    );
};

const Hand = ({ cards, count, faceUp, position, canDiscard, canDrawDiscard, interactive, onDiscard, onDrawDiscard, onReorder }: {
    cards: Card[];
    count: number;
    faceUp: boolean;
    position: "top" | "bottom";
    canDiscard: boolean;
    canDrawDiscard: boolean;
    interactive: boolean;
    onDiscard: (cardId: string) => void;
    onDrawDiscard: () => void;
    onReorder: (cardIds: string[]) => void;
}) => {
    const visibleCards = faceUp ? cards : Array.from({ length: count }, (_, index) => ({ id: `hidden-${index}`, rank: "", suit: "spades" as Suit }));
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
    const orderedCards = previewOrder && faceUp
        ? previewOrder.map((cardId) => cards.find((card) => card.id === cardId)).filter((card): card is Card => Boolean(card))
        : visibleCards;
    const reorder = (targetId: string) => {
        if (!draggedId || draggedId === targetId || !faceUp) return;
        const ids = cards.map((card) => card.id);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setPreviewOrder(null);
        onReorder(ids);
    };
    const previewReorder = (targetId: string) => {
        if (!draggedId || draggedId === targetId || !faceUp) return;
        const ids = (previewOrder ?? cards.map((card) => card.id)).filter((cardId) => cardId !== draggedId);
        const to = ids.indexOf(targetId);
        if (to < 0) return;
        ids.splice(to, 0, draggedId);
        setPreviewOrder(ids);
    };
    return (
        <div
            className={`gin-hand gin-hand-${position}`}
            aria-label={`${position} hand`}
            onDragOver={(event) => {
                if (canDrawDiscard) event.preventDefault();
            }}
            onDrop={(event) => {
                const source = event.dataTransfer.getData("application/x-gin-source");
                if (source === "discard" && canDrawDiscard) {
                    onDrawDiscard();
                }
            }}
        >
            {orderedCards.map((card, index) => (
                <button
                    key={card.id}
                    type="button"
                    className={`gin-card-button ${interactive ? "is-interactive" : "is-static"}`}
                    style={{ zIndex: index + 1 }}
                    draggable={faceUp && interactive}
                    onDragStart={(event) => {
                        if (!interactive) return;
                        setDraggedId(card.id);
                        event.dataTransfer.setData("text/plain", card.id);
                        event.dataTransfer.setData("application/x-gin-source", "hand");
                    }}
                    onDragOver={(event) => {
                        if (!interactive) return;
                        event.preventDefault();
                        previewReorder(card.id);
                    }}
                    onDragEnd={() => {
                        setDraggedId(null);
                        setPreviewOrder(null);
                    }}
                    onDrop={(event) => {
                        if (!interactive) return;
                        const source = event.dataTransfer.getData("application/x-gin-source");
                        if (source === "hand") {
                            reorder(card.id);
                        }
                    }}
                    onClick={() => {
                        if (canDiscard && faceUp && interactive) onDiscard(card.id);
                    }}
                >
                    {faceUp ? <CardView card={card} /> : <div className="gin-card-back" />}
                </button>
            ))}
        </div>
    );
};

const CardView = ({ card }: { card: Card }) => (
    <div className={`gin-card ${card.suit === "hearts" || card.suit === "diamonds" ? "is-red" : "is-black"}`}>
        <span>{card.rank}</span>
        <strong>{suitSymbol(card.suit)}</strong>
        <span>{card.rank}</span>
    </div>
);

const RoundResultPanel = ({ result }: { result: RoundResult }) => (
    <section className="gin-round-result">
        <h3>{result.reason}{result.points ? `: ${result.points} points` : ""}</h3>
        <div className="gin-result-grid">
            <ResultGroup title="Knocker melds" groups={result.selectedMelds} />
            <ResultCards title="Knocker deadwood" cards={result.selectedDeadwood} score={result.knockerDeadwood} />
            <ResultGroup title="Defender melds" groups={result.defenderMelds} />
            <ResultCards title="Defender deadwood" cards={result.defenderDeadwoodCards} score={result.defenderDeadwood} />
            {result.layoffs.length > 0 ? <ResultCards title="Laid off" cards={result.layoffs} /> : null}
        </div>
    </section>
);

const ResultGroup = ({ title, groups }: { title: string; groups: string[][] }) => (
    <div>
        <strong>{title}</strong>
        {groups.length > 0 ? groups.map((group, index) => (
            <span key={index}>{group.map(cardLabelById).join(" ")}</span>
        )) : <span>None</span>}
    </div>
);

const ResultCards = ({ title, cards, score }: { title: string; cards: string[]; score?: number | null }) => (
    <div>
        <strong>{title}{score === undefined || score === null ? "" : ` (${score})`}</strong>
        <span>{cards.length > 0 ? cards.map(cardLabelById).join(" ") : "None"}</span>
    </div>
);

const RulesReference = ({ config }: { config: GinRummyConfig }) => (
    <section className="panel gin-rules">
        <h2>Rules Reference</h2>
        <section>
            <h3>Goal</h3>
            <p>Two players play hands until someone reaches {config.targetScore} points. {config.playMode === "singleGame" ? "This table is a single game, so no game bonus is awarded." : "This table is a best-of-five match, so games won and running total points are tracked."}</p>
        </section>
        <section>
            <h3>Cards And Melds</h3>
            <p>Use a standard 52-card deck. Sets are three or four cards of the same rank. Runs are three or more cards in the same suit. Melds cannot overlap; a card can count in only one meld.</p>
            <p>Aces score one point as deadwood. Face cards score 10, and number cards score face value. Aces are low in runs{config.aceHighAllowed ? " and may also be used high by this table's optional rule" : ""}.</p>
        </section>
        <section>
            <h3>Deal</h3>
            {config.optionalDealRule ? (
                <p>The starting player is dealt 11 cards, the other player is dealt 10, and the discard pile starts empty. The first turn is only the starting player discarding one card.</p>
            ) : (
                <p>The dealer deals 10 cards to each player, one at a time, beginning with the opponent. The next card is turned face up to start the discard pile, and the remaining cards form the stock.</p>
            )}
            <p>The dealer alternates after each hand and after each new game in a match.</p>
        </section>
        <section>
            <h3>Turns</h3>
            {config.optionalDealRule ? (
                <p>After the opening discard, players alternate turns. On each turn, draw the top stock card or the top discard, then discard one card.</p>
            ) : (
                <p>On the first turn, the non-dealer may take the upcard or pass. If the non-dealer passes, the dealer may take it or pass. If both pass, the non-dealer draws from stock. After that, players alternate turns by drawing from stock or discard, then discarding.</p>
            )}
            <p>A card drawn from the discard pile cannot be discarded immediately on the same turn. If only two cards remain in stock before someone goes out, the hand ends in a draw and no points are awarded.</p>
        </section>
        <section>
            <h3>Knocking And Gin</h3>
            <p>You may knock when your chosen meld arrangement leaves 10 or fewer deadwood points after the discard. When multiple legal arrangements exist, the knocker chooses the arrangement to reveal.</p>
            <p>After a knock, the defender reveals melds and may lay off deadwood onto the knocker's melds. The defender's deadwood is automatically minimized. The knocker never lays off onto the defender's melds.</p>
            <p>Going Gin means ending with zero deadwood. The defender cannot lay off against Gin. {config.bigGinAllowed ? "Big Gin is enabled: after drawing, an 11-card hand that all melds may end the hand for the Big Gin bonus." : "Big Gin is disabled at this table."}</p>
        </section>
        <section>
            <h3>Hand Scoring</h3>
            <p>Successful knock: the knocker scores the defender's deadwood after layoffs minus the knocker's deadwood.</p>
            <p>Undercut: if the defender's deadwood is less than or equal to the knocker's deadwood, the defender scores 25 plus the deadwood difference.</p>
            <p>Gin scores 25 plus the defender's deadwood. {config.bigGinAllowed ? "Big Gin scores 31 plus the defender's deadwood." : ""}</p>
        </section>
        <section>
            <h3>Game Scoring</h3>
            {config.playMode === "singleGame" ? (
                <p>The first player to reach {config.targetScore} points wins this single game. Game bonus, line bonus, and shutout bonus are not applied in single-game play.</p>
            ) : (
                <>
                    <p>The first player to reach {config.targetScore} points wins the game. Game points are recorded as a running sum across the best-of-five match.</p>
                    <p>The game winner receives a 100-point game bonus. {config.lineBonusEnabled ? "Line bonus is enabled: each hand won in the game adds 25 points." : "Line bonus is disabled."} {config.shutoutBonusEnabled ? "Shutout bonus is enabled: if the loser won no hands, the winner receives the configured shutout bonus." : "Shutout bonus is disabled."}</p>
                </>
            )}
        </section>
    </section>
);

const handleAsyncError = (error: unknown, setMessage: (message: string) => void) => {
    if (isUnauthorizedError(error)) {
        notifyAuthSessionExpired();
        setMessage(sessionExpiredMessage);
    } else if (isServerUnavailableError(error)) {
        notifyServerUnavailable();
        setMessage(serverUnavailableMessage);
    } else {
        setMessage(error instanceof Error ? error.message : "Unable to update Gin Rummy.");
    }
};

const statusText = (game: GinRummyGame): string => {
    if (game.phase === "setup") return "Claim seats to begin.";
    if (game.phase === "discardOnly") return "Starting player discards first.";
    if (game.phase === "firstUpcard") return "Take the upcard or pass.";
    if (game.phase === "draw") return "Draw from stock or discard.";
    if (game.phase === "discard") return "Discard, knock, or declare gin.";
    if (game.phase === "roundOver") return "Hand complete.";
    if (game.phase === "matchOver") return "Match complete.";
    return "Game complete.";
};

const cardLabel = (card: Card): string => `${card.rank}${suitSymbol(card.suit)}`;
const cardLabelById = (cardId: string): string => {
    const card = deckById.get(cardId);
    return card ? cardLabel(card) : cardId;
};
const suitSymbol = (suit: Suit): string => ({ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[suit]);
const rankValue = (rank: string, aceHigh: boolean): number => rank === "A" ? (aceHigh ? 14 : 1) : rank === "J" ? 11 : rank === "Q" ? 12 : rank === "K" ? 13 : Number(rank);
const deadwoodValue = (card: Card): number => card.rank === "A" ? 1 : ["J", "Q", "K"].includes(card.rank) ? 10 : Number(card.rank);
const consecutive = (values: number[]): boolean => values.every((value, index) => index === 0 || value === values[index - 1] + 1);

const findBestDeadwood = (cards: Card[], aceHighAllowed: boolean): number =>
    findArrangements(cards, aceHighAllowed)[0]?.deadwoodScore ?? 0;

const findArrangements = (cards: Card[], aceHighAllowed: boolean): MeldArrangement[] => {
    const candidates = meldCandidates(cards, aceHighAllowed);
    const results: MeldArrangement[] = [];
    const byId = new Map(cards.map((card) => [card.id, card]));
    const search = (index: number, used: Set<string>, melds: string[][]) => {
        if (index === candidates.length) {
            const deadwood = cards.map((card) => card.id).filter((cardId) => !used.has(cardId));
            results.push({ melds, deadwood, deadwoodScore: deadwood.reduce((sum, cardId) => sum + deadwoodValue(byId.get(cardId)!), 0) });
            return;
        }
        search(index + 1, used, melds);
        const candidate = candidates[index];
        if (candidate.every((cardId) => !used.has(cardId))) {
            search(index + 1, new Set([...used, ...candidate]), [...melds, candidate]);
        }
    };
    search(0, new Set(), []);
    const seen = new Set<string>();
    return results
        .filter((result) => {
            const key = `${result.melds.map((meld) => [...meld].sort().join(",")).sort().join("|")}:${[...result.deadwood].sort().join(",")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.deadwoodScore - b.deadwoodScore || a.deadwood.length - b.deadwood.length);
};

const meldCandidates = (cards: Card[], aceHighAllowed: boolean): string[][] => {
    const byRank = new Map<string, Card[]>();
    const bySuit = new Map<Suit, Card[]>();
    cards.forEach((card) => {
        byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
        bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);
    });
    const sets = [...byRank.values()].flatMap((group) => group.length >= 3 ? [group.map((card) => card.id)] : []);
    const runs = [...bySuit.values()].flatMap((group) => [
        ...runCandidates(group, false),
        ...(aceHighAllowed ? runCandidates(group, true) : [])
    ]);
    return [...sets, ...runs];
};

const runCandidates = (cards: Card[], aceHigh: boolean): string[][] => {
    const ordered = [...cards].sort((a, b) => rankValue(a.rank, aceHigh) - rankValue(b.rank, aceHigh));
    const results: string[][] = [];
    ordered.forEach((_card, start) => {
        for (let end = start + 2; end < ordered.length; end += 1) {
            const slice = ordered.slice(start, end + 1);
            if (consecutive(slice.map((card) => rankValue(card.rank, aceHigh)))) {
                results.push(slice.map((card) => card.id));
            }
        }
    });
    return results;
};

export const ginRummyGameEntry: GameEntry = {
    identity: {
        slug: "gin-rummy",
        displayName: "Gin Rummy"
    },
    routes: {
        createPath: buildGameCreatePath("gin-rummy"),
        buildPlayPath: (gameId) => `/g/${encodeURIComponent(gameId.trim())}`,
        matchPlayPath: (pathname) => pathname.match(playRoutePattern)?.[1] ?? null
    },
    components: {
        CreateScreen: CreateGinRummyScreen,
        PlayScreen: GinRummyPlayScreen
    },
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
