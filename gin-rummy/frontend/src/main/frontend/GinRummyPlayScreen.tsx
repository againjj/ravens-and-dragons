import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuthSession, fetchUsers, isServerUnavailableError, isUnauthorizedError, notifyAuthSessionExpired, notifyServerUnavailable, serverUnavailableMessage, sessionExpiredMessage } from "@ravensanddragons/platform-frontend/api-client";
import type { AuthUserSummary } from "@ravensanddragons/platform-frontend/auth-types";
import { PlayerPicker } from "@ravensanddragons/platform-frontend/player-picker";
import { CardView } from "./CardView";
import { Hand } from "./Hand";
import { FinishedGinRummyLayout, RoundResultBoard, RulesReference } from "./RoundResultBoard";
import { fetchGinRummyGame, readGameIdFromLocation, sendCommand } from "./gin-rummy-client";
import { arrangementLabel, canDiscardCardToPile, discardPileInteractionState, elementCenter, endActionButtonState, findArrangements, findBestDeadwood, handInsertionPoint, lastHandCardPoint } from "./gin-rummy-rules";
import type { Card, DragSource, EndAction, FlyingCard, FlyDestination, GinRummyGame, KnockChoice } from "./gin-rummy-types";

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

export const GinRummyPlayScreen = () => {
    const gameId = useMemo(readGameIdFromLocation, []);
    const [game, setGame] = useState<GinRummyGame | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activePickerSeat, setActivePickerSeat] = useState<number | null>(null);
    const [players, setPlayers] = useState<AuthUserSummary[]>([]);
    const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
    const [revealedTurnKey, setRevealedTurnKey] = useState<string | null>(null);
    const [knockChoices, setKnockChoices] = useState<KnockChoice[]>([]);
    const [pendingEndAction, setPendingEndAction] = useState<EndAction | null>(null);
    const [showFinishedLayout, setShowFinishedLayout] = useState(false);
    const [flyingCard, setFlyingCard] = useState<FlyingCard | null>(null);
    const [activeDragSource, setActiveDragSource] = useState<DragSource | null>(null);
    const [activeDragCardId, setActiveDragCardId] = useState<string | null>(null);
    const stockRef = useRef<HTMLButtonElement | null>(null);
    const discardRef = useRef<HTMLButtonElement | null>(null);
    const topHandRef = useRef<HTMLDivElement | null>(null);
    const bottomHandRef = useRef<HTMLDivElement | null>(null);
    const flyKey = useRef(0);
    const previousGameRef = useRef<GinRummyGame | null>(null);

    const loadGame = useCallback(() => {
        if (!gameId) {
            setMessage("Game ID is missing.");
            return;
        }
        void fetchGinRummyGame(gameId)
            .then((loaded) => {
                setGame((current) => !current || loaded.version >= current.version ? loaded : current);
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
        setKnockChoices([]);
        setPendingEndAction(null);
        setRevealedTurnKey(null);
        setShowFinishedLayout(false);
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
    const canShowEndActions = Boolean(game && bottomIsViewerSeat && game.currentSeat === bottomSeat && bottomFaceUp);
    const discardPileState = game ? discardPileInteractionState(canAct, game.phase, Boolean(game.discardTop)) : { canDrawDiscard: false, canDiscardToPile: false, disabled: true };
    const { canDrawDiscard, canDiscardToPile } = discardPileState;
    const turnIndicatorText = !game
        ? ""
        : userSeats.length === 0
            ? `${game.seats[game.currentSeat]?.displayName ?? "Empty seat"}'s\nturn`
            : game.currentSeat === bottomSeat
                ? "Your\nturn"
                : "Opponent's\nturn";
    const isMatch = game?.config.playMode === "bestOfFiveMatch";
    const allKnockChoices = useMemo(() => {
        if (!game || !canShowEndActions || game.phase !== "discard") return [];
        return bottomHand.flatMap((discardCard) => {
            const remaining = bottomHand.filter((card) => card.id !== discardCard.id);
            return findArrangements(remaining, game.config.aceHighAllowed)
                .filter((option) => option.deadwoodScore <= 10)
                .map((arrangement): KnockChoice => ({
                    type: arrangement.deadwoodScore === 0 ? "gin" : "knock",
                    cardId: discardCard.id,
                    arrangement
                }));
        });
    }, [bottomHand, canShowEndActions, game]);
    const knockOnlyChoices = allKnockChoices.filter((choice) => choice.type === "knock");
    const ginChoices = allKnockChoices.filter((choice) => choice.type === "gin");
    const legalEndDiscardIds = useMemo(() => new Set(
        (pendingEndAction === "knock" ? knockOnlyChoices : pendingEndAction === "gin" ? ginChoices : []).map((choice) => choice.cardId).filter((cardId): cardId is string => Boolean(cardId))
    ), [ginChoices, knockOnlyChoices, pendingEndAction]);
    const canDiscardHandCard = (cardId: string): boolean =>
        game?.viewer?.drewDiscardCardId !== cardId && (!pendingEndAction || legalEndDiscardIds.has(cardId));
    const canDropCardOnDiscard = (cardId: string): boolean =>
        canDiscardCardToPile(canDiscardToPile, cardId, game?.viewer?.drewDiscardCardId ?? null, pendingEndAction, legalEndDiscardIds);
    const bigGinChoice = useMemo<KnockChoice | null>(() => {
        if (!game || !canShowEndActions || game.phase !== "discard" || !game.config.bigGinAllowed || bottomHand.length !== 11) return null;
        const arrangement = findArrangements(bottomHand, game.config.aceHighAllowed).find((option) => option.deadwoodScore === 0);
        return arrangement ? { type: "bigGin", arrangement } : null;
    }, [bottomHand, canShowEndActions, game]);

    const runCommand = (command: Record<string, unknown>, baseGame = game): Promise<GinRummyGame | null> => {
        if (!baseGame) return Promise.resolve(null);
        setIsSubmitting(true);
        setMessage(null);
        return sendCommand(baseGame, command)
            .then((updated) => {
                setGame(updated);
                return updated;
            })
            .catch((error: unknown) => {
                handleAsyncError(error, setMessage);
                return null;
            })
            .finally(() => setIsSubmitting(false));
    };

    const openPicker = (seat: number) => {
        setActivePickerSeat(seat);
        void fetchUsers().then(setPlayers).catch(() => setPlayers([]));
    };

    const animateCard = (card: Card | null, fromClientX: number, fromClientY: number, destination: HTMLElement | FlyDestination | null) => {
        const point = destination instanceof HTMLElement
            ? (() => {
                const rect = destination.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            })()
            : destination;
        if (!point) return;
        const next: FlyingCard = {
            key: flyKey.current + 1,
            card,
            fromX: fromClientX,
            fromY: fromClientY,
            toX: point.x,
            toY: point.y
        };
        flyKey.current = next.key;
        setFlyingCard(next);
        window.setTimeout(() => setFlyingCard((current) => current?.key === next.key ? null : current), 500);
    };

    const chooseKnock = (choices: KnockChoice[]) => {
        if (choices.length === 0) return;
        if (choices.length === 1) {
            runKnockChoice(choices[0]);
        } else {
            setKnockChoices(choices);
        }
    };

    const runKnockChoice = (choice: KnockChoice) => {
        const command = choice.type === "bigGin"
            ? { type: "bigGin", arrangement: choice.arrangement }
            : { type: choice.type, cardId: choice.cardId, arrangement: choice.arrangement };
        void runCommand(command).then((updated) => {
            if (updated || choice.type === "bigGin") {
                setKnockChoices([]);
                setPendingEndAction(null);
            }
        });
    };

    const finishPendingEndAction = (cardId: string) => {
        if (!pendingEndAction) return false;
        const choices = (pendingEndAction === "knock" ? knockOnlyChoices : ginChoices).filter((choice) => choice.cardId === cardId);
        chooseKnock(choices);
        return choices.length > 0;
    };

    const renderEndActionButton = (
        action: EndAction,
        label: string,
        visible: boolean,
        onClick: () => void
    ) => {
        if (!visible) return null;
        const buttonState = endActionButtonState(action, pendingEndAction, isSubmitting);
        return (
            <button
                type="button"
                className={buttonState.selected ? "is-selected" : ""}
                disabled={buttonState.disabled}
                onClick={onClick}
            >
                {label}
            </button>
        );
    };

    const drawToHand = async (source: "stock" | "discard", insertIndex: number, fromClientX: number, fromClientY: number, destination: FlyDestination | null) => {
        if (!game) return;
        const beforeIds = bottomHand.map((card) => card.id);
        const sourceCard = source === "discard" ? game.discardTop : null;
        const drawn = await runCommand({ type: source === "stock" ? "drawStock" : "drawDiscard" });
        if (!drawn) return;
        const afterHand = drawn.viewer?.hands[String(bottomSeat)] ?? [];
        const drawnCard = afterHand.find((card) => !beforeIds.includes(card.id));
        if (!drawnCard) return;
        const withoutDrawn = afterHand.map((card) => card.id).filter((cardId) => cardId !== drawnCard.id);
        const nextOrder = [...withoutDrawn];
        const destinationIndex = Math.min(insertIndex, nextOrder.length);
        nextOrder.splice(destinationIndex, 0, drawnCard.id);
        animateCard(sourceCard, fromClientX, fromClientY, destination ?? handInsertionPoint(bottomHandRef.current, destinationIndex) ?? bottomHandRef.current);
        if (nextOrder.join("|") !== afterHand.map((card) => card.id).join("|")) {
            await runCommand({ type: "reorderHand", cardIds: nextOrder }, drawn);
        }
    };

    useEffect(() => {
        if (!game) return;
        const previous = previousGameRef.current;
        previousGameRef.current = game;
        if (!previous || previous.id !== game.id || previous.version >= game.version) return;
        const previousCount = previous.handCounts[topSeat] ?? 0;
        const nextCount = game.handCounts[topSeat] ?? 0;
        const countDelta = nextCount - previousCount;
        if (previous.currentSeat !== topSeat || Math.abs(countDelta) !== 1) return;
        const handPoint = lastHandCardPoint(topHandRef.current);
        if (!handPoint) return;
        if (countDelta > 0) {
            const fromElement = game.stockCount < previous.stockCount ? stockRef.current : game.discardCount < previous.discardCount ? discardRef.current : null;
            const fromPoint = elementCenter(fromElement);
            if (fromPoint) animateCard(null, fromPoint.x, fromPoint.y, handPoint);
        } else {
            const toElement = game.discardCount > previous.discardCount ? discardRef.current : null;
            if (toElement) animateCard(null, handPoint.x, handPoint.y, toElement);
        }
    }, [game, topSeat]);

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
                </div>
                <div className="gin-seat-score">
                    <span>Game score: {game.scores.gamePoints[seatIndex]}</span>
                    {isMatch ? <span>Games won: {game.scores.gamesWon[seatIndex]}</span> : null}
                    {isMatch ? <span>Total score: {game.scores.totalPoints[seatIndex]}</span> : null}
                </div>
            </aside>
        );
    };

    if (!game) {
        return <section className="panel"><p>{message ?? "Loading Gin Rummy..."}</p></section>;
    }

    if (showFinishedLayout && (game.phase === "gameOver" || game.phase === "matchOver")) {
        return <FinishedGinRummyLayout game={game} />;
    }

    const showResultLayout = Boolean(game.roundResult && (game.phase === "roundOver" || game.phase === "gameOver" || game.phase === "matchOver"));

    if (showResultLayout && game.roundResult) {
        return (
            <section className="game-page gin-page">
                <h1 className="content-title">Gin Rummy</h1>
                <RoundResultBoard
                    game={game}
                    result={game.roundResult}
                    onNext={() => {
                        if (game.phase === "roundOver") {
                            void runCommand({ type: "nextHand" });
                        } else if (game.phase === "gameOver" && game.config.playMode === "bestOfFiveMatch") {
                            void runCommand({ type: "nextGame" });
                        } else {
                            setShowFinishedLayout(true);
                        }
                    }}
                />
                <section className="gin-score-rules">
                    <RulesReference config={game.config} />
                </section>
            </section>
        );
    }

    return (
        <section className="game-page gin-page">
            <h1 className="content-title">Gin Rummy</h1>
            <section className="gin-board-shell">
                {renderSeat(topSeat, "top")}
                <Hand
                    handRef={topHandRef}
                    cards={[]}
                    count={game.handCounts[topSeat] ?? 0}
                    faceUp={false}
                    position="top"
                    onReorder={() => {}}
                    onDiscard={() => {}}
                    onDrawToHand={() => {}}
                    onDragSourceChange={() => {}}
                    onDragCardChange={() => {}}
                    canDiscard={false}
                    canDrawToHand={false}
                    interactive={false}
                    activeDragSource={activeDragSource}
                />
                <section className="gin-table">
                    <div className="gin-turn-indicator">{turnIndicatorText}</div>
                    <button
                        ref={stockRef}
                        type="button"
                        className="gin-stock"
                        disabled={!canAct || game.phase !== "draw"}
                        draggable={Boolean(canAct && game.phase === "draw")}
                        onDragStart={(event) => {
                            setActiveDragSource("stock");
                            event.dataTransfer.setData("text/plain", "stock");
                            event.dataTransfer.setData("application/x-gin-source", "stock");
                        }}
                        onDragEnd={() => setActiveDragSource(null)}
                        onClick={(event) => {
                            void drawToHand("stock", bottomHand.length, event.clientX, event.clientY, null);
                        }}
                    >
                        <strong>{game.stockCount}</strong>
                    </button>
                    <button
                        ref={discardRef}
                        type="button"
                        className={`gin-discard ${game.discardTop ? "" : "is-empty"}`}
                        disabled={discardPileState.disabled}
                        draggable={canDrawDiscard}
                        onDragStart={(event) => {
                            if (canDrawDiscard && game.discardTop) {
                                setActiveDragSource("discard");
                                event.dataTransfer.setData("text/plain", game.discardTop.id);
                                event.dataTransfer.setData("application/x-gin-source", "discard");
                            }
                        }}
                        onDragEnd={() => setActiveDragSource(null)}
                        onClick={(event) => {
                            if (!canDrawDiscard) return;
                            void drawToHand("discard", bottomHand.length, event.clientX, event.clientY, null);
                        }}
                        onDragOver={(event) => {
                            const cardId = activeDragCardId ?? event.dataTransfer.getData("text/plain");
                            if (cardId && canDropCardOnDiscard(cardId)) event.preventDefault();
                        }}
                        onDrop={(event) => {
                            const cardId = activeDragCardId ?? event.dataTransfer.getData("text/plain");
                            if (cardId && canDropCardOnDiscard(cardId)) {
                                const card = bottomHand.find((candidate) => candidate.id === cardId) ?? null;
                                animateCard(card, event.clientX, event.clientY, discardRef.current);
                                if (!finishPendingEndAction(cardId)) {
                                    void runCommand({ type: "discard", cardId });
                                }
                            }
                            setActiveDragSource(null);
                            setActiveDragCardId(null);
                        }}
                    >
                        {game.discardTop ? <CardView card={game.discardTop} /> : null}
                    </button>
                    <div className="gin-end-actions">
                        {renderEndActionButton("knock", "Knock", knockOnlyChoices.length > 0, () => setPendingEndAction("knock"))}
                        {renderEndActionButton("gin", "Gin", ginChoices.length > 0, () => setPendingEndAction("gin"))}
                        {renderEndActionButton("bigGin", "Big Gin", Boolean(bigGinChoice), () => {
                            if (!bigGinChoice) return;
                            setPendingEndAction("bigGin");
                            runKnockChoice(bigGinChoice);
                        })}
                    </div>
                    <div className="gin-table-actions">
                        {canAct && game.phase === "firstUpcard" ? <button type="button" onClick={() => runCommand({ type: "passUpcard" })}>Pass</button> : null}
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
                        handRef={bottomHandRef}
                        cards={bottomHand}
                        count={game.handCounts[bottomSeat] ?? 0}
                        faceUp={bottomFaceUp}
                        position="bottom"
                        canDiscard={canAct && game.phase !== "draw" && game.phase !== "firstUpcard"}
                        canDrawToHand={canAct && (game.phase === "draw" || game.phase === "firstUpcard")}
                        canDiscardCard={canDiscardHandCard}
                        activeDragSource={activeDragSource}
                        onDragSourceChange={setActiveDragSource}
                        onDragCardChange={setActiveDragCardId}
                        onDiscard={(cardId, clientX, clientY) => {
                            if (!canDiscardHandCard(cardId)) return;
                            const card = bottomHand.find((candidate) => candidate.id === cardId) ?? null;
                            animateCard(card, clientX, clientY, discardRef.current);
                            if (!finishPendingEndAction(cardId)) {
                                void runCommand({ type: "discard", cardId });
                            }
                        }}
                        onDrawToHand={(source, insertIndex, clientX, clientY, destination) => {
                            if (source === "discard" && !game.discardTop) return;
                            void drawToHand(source, insertIndex, clientX, clientY, destination);
                        }}
                        onReorder={(cardIds) => runCommand({ type: "reorderHand", cardIds })}
                        interactive
                    />
                </section>
            </section>

            <section className="gin-score-rules">
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

            {flyingCard ? createPortal(
                <div
                    key={flyingCard.key}
                    className="gin-flying-card"
                    style={{
                        "--gin-fly-from-x": `${flyingCard.fromX}px`,
                        "--gin-fly-from-y": `${flyingCard.fromY}px`,
                        "--gin-fly-to-x": `${flyingCard.toX}px`,
                        "--gin-fly-to-y": `${flyingCard.toY}px`
                    } as CSSProperties}
                >
                    {flyingCard.card ? <CardView card={flyingCard.card} /> : <div className="gin-card-back" />}
                </div>,
                document.body
            ) : null}

            {knockChoices.length > 0 ? createPortal(
                <div className="modal-backdrop" role="presentation">
                    <section className="panel gin-knock-modal" role="dialog" aria-modal="true" aria-label="Choose knock arrangement">
                        <h2>Choose Layoff</h2>
                        {knockChoices.map((choice, index) => (
                            <button key={index} type="button" onClick={() => runKnockChoice(choice)}>
                                {arrangementLabel(choice.arrangement)}
                            </button>
                        ))}
                    </section>
                </div>,
                document.body
            ) : null}
        </section>
    );
};
