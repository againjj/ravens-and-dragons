import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notifyServerUnavailable } from "@ravensanddragons/platform-frontend/api-client";
import { PlayerPicker } from "@ravensanddragons/platform-frontend/player-picker";
import { CardView } from "./CardView";
import { Hand } from "./Hand";
import { FinishedGinRummyLayout, RoundResultBoard, RulesReference } from "./RoundResultBoard";
import { fetchGinRummyGame, readGameIdFromLocation } from "./gin-rummy-client";
import { arrangementLabel, canDiscardCardToPile, discardPileInteractionState, elementCenter, endActionButtonState, findArrangements, findBestDeadwood, handInsertionPoint, lastHandCardPoint, pointLabel, seatDisplayName } from "./gin-rummy-rules";
import type { Card, DragSource, EndAction, FlyingCard, FlyDestination, GinRummyGame, KnockChoice } from "./gin-rummy-types";
import {
    clearDragState,
    clearFlyingCardByKey,
    clearKnockChoicesAndPendingEndAction,
    loadGinRummyAuthSession,
    loadGinRummyGame,
    loadGinRummyPlayers,
    receiveGinRummyGame,
    runGinRummyCommand,
    setActiveDragCardId,
    setActiveDragSource,
    setActivePickerSeat,
    setDismissedRoundReasonKey,
    setDismissedRoundResultKey,
    setFlyingCard,
    setKnockChoices,
    setPendingEndAction,
    setPlayMessage,
    setRevealedTurnKey
} from "./gin-rummy-slice";
import { useGinRummyDispatch, useGinRummySelector } from "./gin-rummy-store";

export const GinRummyPlayScreen = () => {
    const dispatch = useGinRummyDispatch();
    const gameId = useMemo(readGameIdFromLocation, []);
    const {
        game,
        message,
        isSubmitting,
        activePickerSeat,
        players,
        currentUser,
        revealedTurnKey,
        knockChoices,
        pendingEndAction,
        dismissedRoundResultKey,
        dismissedRoundReasonKey,
        flyingCard,
        activeDragSource,
        activeDragCardId
    } = useGinRummySelector((state) => state.ginRummy.play);
    const stockRef = useRef<HTMLButtonElement | null>(null);
    const discardRef = useRef<HTMLButtonElement | null>(null);
    const topHandRef = useRef<HTMLDivElement | null>(null);
    const bottomHandRef = useRef<HTMLDivElement | null>(null);
    const flyKey = useRef(0);
    const previousGameRef = useRef<GinRummyGame | null>(null);
    const [pendingHandView, setPendingHandView] = useState<{ seat: number; cards: Card[] } | null>(null);

    const loadGame = useCallback(() => {
        if (!gameId) {
            dispatch(setPlayMessage("Game ID is missing."));
            return;
        }
        void dispatch(loadGinRummyGame(gameId));
    }, [dispatch, gameId]);

    useEffect(() => {
        loadGame();
    }, [loadGame]);

    useEffect(() => {
        void dispatch(loadGinRummyAuthSession());
    }, [dispatch]);

    useEffect(() => {
        if (!gameId) return;
        const stream = new EventSource(`/api/games/${encodeURIComponent(gameId)}/stream`);
        stream.addEventListener("game", (event) => {
            const streamedGame = parseStreamedGame(event);
            if (!streamedGame?.roundResult) {
                loadGame();
                return;
            }
            void fetchGinRummyGame(gameId)
                .then((viewerGame) => dispatch(receiveGinRummyGame({
                    ...viewerGame,
                    roundResult: streamedGame.roundResult
                })))
                .catch(() => loadGame());
        });
        stream.onerror = () => {
            notifyServerUnavailable();
            stream.close();
        };
        return () => {
            stream.close();
        };
    }, [gameId, loadGame]);

    const currentUserId = game?.viewer?.userId ?? null;
    const userSeats = game?.seats.map((seat, index) => seat.userId === currentUserId ? index : null).filter((seat): seat is number => seat !== null) ?? [];
    const sameUserBothSeats = userSeats.length === 2;
    const hasVisibleDealer = Boolean(game && game.dealerSeat >= 0);
    const bottomSeat = !game ? 1 : sameUserBothSeats && game.currentSeat >= 0 ? game.currentSeat : userSeats[0] ?? (hasVisibleDealer ? 1 - game.dealerSeat : 1);
    const topSeat = 1 - bottomSeat;
    const currentTurnKey = game ? `${game.id}:${game.roundNumber}:${game.currentSeat}` : "";
    const bottomHand = game?.viewer?.hands[String(bottomSeat)] ?? [];
    const pendingHandMatchesBottom = Boolean(
        pendingHandView
        && pendingHandView.seat === bottomSeat
        && pendingHandView.cards.length === bottomHand.length
        && pendingHandView.cards.every((card) => bottomHand.some((candidate) => candidate.id === card.id))
    );
    const visibleBottomHand = pendingHandMatchesBottom ? pendingHandView!.cards : bottomHand;
    const bottomIsViewerSeat = userSeats.includes(bottomSeat);
    const shouldHideBottom = sameUserBothSeats && game?.currentSeat === bottomSeat && revealedTurnKey !== currentTurnKey;
    const bottomFaceUp = bottomIsViewerSeat && !shouldHideBottom;
    const canAct = Boolean(game && bottomIsViewerSeat && game.currentSeat === bottomSeat && bottomFaceUp && !isSubmitting);
    const canShowEndActions = Boolean(game && bottomIsViewerSeat && game.currentSeat === bottomSeat && bottomFaceUp);
    const discardPileState = game ? discardPileInteractionState(canAct, game.phase, Boolean(game.discardTop)) : { canDrawDiscard: false, canDiscardToPile: false, disabled: true };
    const { canDrawDiscard, canDiscardToPile } = discardPileState;
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
    const visibleEndAction = bigGinChoice ? "bigGin" : ginChoices.length > 0 ? "gin" : knockOnlyChoices.length > 0 ? "knock" : null;
    const turnIndicatorText = !game
        ? ""
        : game.currentSeat < 0
            ? "Waiting\nfor players"
        : userSeats.length === 0
            ? `${seatDisplayName(game, game.currentSeat, "Empty seat")}'s\nturn`
        : shouldHideBottom
            ? "Click\n\"Show Cards\""
            : game.currentSeat === bottomSeat
                ? activeTurnPrompt(game.phase, visibleEndAction)
                : "Opponent's\nturn";
    const roundResultKey = game?.roundResult
        ? `${game.id}:${game.roundResult.gameNumber ?? game.gameNumber}:${game.roundResult.roundNumber ?? game.roundNumber}:${game.roundResult.reason}`
        : null;
    const showResultOverlay = Boolean(game?.roundResult && roundResultKey && dismissedRoundResultKey !== roundResultKey);
    const endingSeat = game?.roundResult?.knockerSeat ?? game?.roundResult?.winnerSeat ?? null;
    const viewerEndedHand = endingSeat !== null && userSeats.includes(endingSeat);
    const showReasonOverlay = Boolean(
        game?.roundResult
        && showResultOverlay
        && roundResultKey
        && dismissedRoundReasonKey !== roundResultKey
        && (game.roundResult.reason === "Stock exhausted" || !viewerEndedHand)
    );
    const finalBoard = Boolean(game && (game.phase === "gameOver" || game.phase === "matchOver"));
    const hasLocalOverlay = knockChoices.length > 0 || showResultOverlay || showReasonOverlay;

    const runCommand = (command: Record<string, unknown>, baseGame = game): Promise<GinRummyGame | null> => {
        if (!baseGame) return Promise.resolve(null);
        return dispatch(runGinRummyCommand({ game: baseGame, command }))
            .unwrap()
            .catch(() => null);
    };

    const openPicker = (seat: number) => {
        dispatch(setActivePickerSeat(seat));
        void dispatch(loadGinRummyPlayers());
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
        dispatch(setFlyingCard(next));
        window.setTimeout(() => dispatch(clearFlyingCardByKey(next.key)), 500);
    };

    const chooseKnock = (choices: KnockChoice[]) => {
        if (choices.length === 0) return;
        if (choices.length === 1) {
            runKnockChoice(choices[0]);
        } else {
            dispatch(setKnockChoices(choices));
        }
    };

    const runKnockChoice = (choice: KnockChoice) => {
        const command = choice.type === "bigGin"
            ? { type: "bigGin", arrangement: choice.arrangement }
            : { type: choice.type, cardId: choice.cardId, arrangement: choice.arrangement };
        void runCommand(command).then((updated) => {
            if (updated) {
                dispatch(clearKnockChoicesAndPendingEndAction());
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
            const byId = new Map(afterHand.map((card) => [card.id, card]));
            setPendingHandView({ seat: bottomSeat, cards: nextOrder.map((cardId) => byId.get(cardId)).filter((card): card is Card => Boolean(card)) });
            await runCommand({ type: "reorderHand", seat: bottomSeat, cardIds: nextOrder }, drawn);
        }
    };

    useEffect(() => {
        if (!pendingHandView || !game) return;
        const actualHand = game.viewer?.hands[String(pendingHandView.seat)] ?? [];
        const pendingIds = pendingHandView.cards.map((card) => card.id);
        const actualIds = actualHand.map((card) => card.id);
        const sameOrder = pendingIds.join("|") === actualIds.join("|");
        const sameCards = pendingIds.length === actualIds.length && pendingIds.every((cardId) => actualIds.includes(cardId));
        if (sameOrder || !sameCards) {
            setPendingHandView(null);
        }
    }, [game, pendingHandView]);

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
        const isDealer = game.dealerSeat >= 0 && game.dealerSeat === seatIndex;
        const seatName = seat.displayName ? seatDisplayName(game, seatIndex) : null;
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

    const claimSeat = (seat: number | null, playerUserId: string | null, displayName: string) => {
        if (seat === null) return;
        dispatch(setActivePickerSeat(null));
        runCommand({ type: "claimSeat", seat, playerUserId, displayName });
    };

    if (!game) {
        return <section className="panel"><p>{message ?? "Loading Gin Rummy..."}</p></section>;
    }

    return (
        <section className="game-page gin-page">
            <h1 className="content-title">Gin Rummy</h1>
            <section className={`gin-board-shell ${finalBoard ? "gin-board-finished" : ""}`}>
                {finalBoard ? (
                    <FinishedGinRummyLayout game={game} />
                ) : (
                    <>
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
                                className={`gin-stock ${!canAct || game.phase !== "draw" ? "is-illegal" : ""}`}
                                disabled={!canAct || game.phase !== "draw"}
                                draggable={Boolean(canAct && game.phase === "draw")}
                                onDragStart={(event) => {
                                    dispatch(setActiveDragSource("stock"));
                                    event.dataTransfer.setData("text/plain", "stock");
                                    event.dataTransfer.setData("application/x-gin-source", "stock");
                                }}
                                onDragEnd={() => dispatch(setActiveDragSource(null))}
                                onClick={(event) => {
                                    void drawToHand("stock", bottomHand.length, event.clientX, event.clientY, null);
                                }}
                            >
                                <strong>{game.stockCount}</strong>
                            </button>
                            <button
                                ref={discardRef}
                                type="button"
                                className={`gin-discard ${game.discardTop && (activeDragSource !== "discard" || game.discardUnderTop) ? "" : "is-empty"} ${discardPileState.disabled ? "is-illegal" : ""} ${activeDragSource === "discard" ? "is-drag-source" : ""}`}
                                disabled={discardPileState.disabled}
                                draggable={canDrawDiscard}
                                onDragStart={(event) => {
                                    if (canDrawDiscard && game.discardTop) {
                                        const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        dragImage.classList.remove("is-drag-source");
                                        dragImage.style.position = "fixed";
                                        dragImage.style.top = "-1000px";
                                        dragImage.style.left = "-1000px";
                                        dragImage.style.width = `${rect.width}px`;
                                        dragImage.style.height = `${rect.height}px`;
                                        dragImage.style.margin = "0";
                                        dragImage.style.pointerEvents = "none";
                                        dragImage.style.setProperty("--gin-card-width", `${rect.width}px`);
                                        dragImage.style.setProperty("--gin-card-height", `${rect.height}px`);
                                        document.body.appendChild(dragImage);
                                        event.dataTransfer.setDragImage(dragImage, event.clientX - rect.left, event.clientY - rect.top);
                                        window.setTimeout(() => dragImage.remove(), 0);
                                        dispatch(setActiveDragSource("discard"));
                                        event.dataTransfer.setData("text/plain", game.discardTop.id);
                                        event.dataTransfer.setData("application/x-gin-source", "discard");
                                    }
                                }}
                                onDragEnd={() => dispatch(setActiveDragSource(null))}
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
                                    dispatch(clearDragState());
                                }}
                            >
                                {activeDragSource === "discard"
                                    ? game.discardUnderTop ? <CardView card={game.discardUnderTop} /> : null
                                    : game.discardTop ? <CardView card={game.discardTop} /> : null}
                            </button>
                            <div className="gin-end-actions">
                                {renderEndActionButton("knock", "Knock", visibleEndAction === "knock", () => dispatch(setPendingEndAction("knock")))}
                                {renderEndActionButton("gin", "Go Gin", visibleEndAction === "gin", () => dispatch(setPendingEndAction("gin")))}
                                {renderEndActionButton("bigGin", "Go Big Gin", visibleEndAction === "bigGin", () => {
                                    if (!bigGinChoice) return;
                                    dispatch(setPendingEndAction("bigGin"));
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
                                <button type="button" className="gin-show-cards" onClick={() => dispatch(setRevealedTurnKey(currentTurnKey))}>
                                    Show Cards
                                </button>
                            ) : null}
                            <div className="gin-deadwood">{bottomFaceUp ? `Deadwood: ${pointLabel(findBestDeadwood(bottomHand, game.config.aceHighAllowed))}` : " "}</div>
                            <Hand
                                handRef={bottomHandRef}
                                cards={visibleBottomHand}
                                count={game.handCounts[bottomSeat] ?? 0}
                                faceUp={bottomFaceUp}
                                position="bottom"
                                canDiscard={canAct && game.phase !== "draw" && game.phase !== "firstUpcard"}
                                canDrawToHand={canAct && (game.phase === "draw" || game.phase === "firstUpcard")}
                                canDiscardCard={canDiscardHandCard}
                                activeDragSource={activeDragSource}
                                onDragSourceChange={(source) => dispatch(setActiveDragSource(source))}
                                onDragCardChange={(cardId) => dispatch(setActiveDragCardId(cardId))}
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
                                onReorder={(cardIds) => {
                                    const byId = new Map(bottomHand.map((card) => [card.id, card]));
                                    setPendingHandView({ seat: bottomSeat, cards: cardIds.map((cardId) => byId.get(cardId)).filter((card): card is Card => Boolean(card)) });
                                    return runCommand({ type: "reorderHand", seat: bottomSeat, cardIds });
                                }}
                                interactive
                            />
                        </section>
                    </>
                )}
                {knockChoices.length > 0 ? (
                    <div className="gin-knock-positioner" role="presentation">
                        <section className="panel gin-knock-modal" role="dialog" aria-modal="true" aria-label="Choose knock arrangement">
                            <h2>Choose Layoff</h2>
                            {knockChoices.map((choice, index) => (
                                <button key={index} type="button" onClick={() => runKnockChoice(choice)}>
                                    {arrangementLabel(choice.arrangement)}
                                </button>
                            ))}
                        </section>
                    </div>
                ) : null}
            </section>

            <section className="gin-score-rules">
                <RulesReference config={game.config} />
            </section>

            {hasLocalOverlay ? <div className="gin-content-dim" aria-hidden="true" /> : null}

            {activePickerSeat !== null ? createPortal(
                <div className="seat-player-picker-backdrop" role="presentation">
                    <section className="panel seat-player-picker-modal" role="dialog" aria-modal="true" aria-label="Gin Rummy player picker">
                        <PlayerPicker
                            players={players.filter((player) => player.id !== currentUserId)}
                            bots={[]}
                            onAddMyself={() => {
                                claimSeat(activePickerSeat, currentUserId, currentUser?.displayName ?? "Player");
                            }}
                            onAddPlayer={(playerUserId) => {
                                const player = players.find((candidate) => candidate.id === playerUserId);
                                claimSeat(activePickerSeat, playerUserId, player?.displayName ?? "Player");
                            }}
                            onAddBot={() => {}}
                            onCancel={() => dispatch(setActivePickerSeat(null))}
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

            {showResultOverlay && game.roundResult && roundResultKey ? (
                <div className="gin-local-backdrop" role="presentation">
                    <section className="panel gin-result-modal" role="dialog" aria-modal="true" aria-label="Hand result">
                        <RoundResultBoard
                            game={game}
                            result={game.roundResult}
                            onNext={() => {
                                dispatch(setDismissedRoundResultKey(roundResultKey));
                                dispatch(setDismissedRoundReasonKey(roundResultKey));
                                if (game.phase === "gameOver" && game.config.playMode === "bestOfFiveMatch" && game.lifecycle !== "finished") {
                                    void runCommand({ type: "nextGame" });
                                }
                            }}
                        />
                    </section>
                </div>
            ) : null}

            {showReasonOverlay && game.roundResult && roundResultKey ? (
                <div className="gin-local-backdrop modal-backdrop-stacked" role="presentation">
                    <section className="panel gin-round-reason-modal" role="dialog" aria-modal="true" aria-label="Hand ended">
                        <h2>Hand Ended</h2>
                        <p>{handEndedMessage(game.roundResult.reason, game.roundResult.knockerSeat, game)}</p>
                        <button type="button" onClick={() => dispatch(setDismissedRoundReasonKey(roundResultKey))}>Continue</button>
                    </section>
                </div>
            ) : null}
        </section>
    );
};

const handEndedMessage = (reason: string, endingSeat: number | null, game: GinRummyGame): string => {
    if (reason === "Stock exhausted") return "Only two cards remained in stock, so the hand ended in a draw.";
    const name = endingSeat !== null ? seatDisplayName(game, endingSeat) : "The other player";
    return `${name} ended the hand with ${reason === "Gin" ? "Gin" : reason}.`;
};

const activeTurnPrompt = (phase: GinRummyGame["phase"], visibleEndAction: EndAction | null): string => {
    if (phase === "draw" || phase === "firstUpcard") return "Draw\na card";
    if (visibleEndAction === "bigGin") return "Discard\nor go big gin";
    if (visibleEndAction === "gin") return "Discard\nor go gin";
    if (visibleEndAction === "knock") return "Discard\nor knock";
    return "Discard\na card";
};

const parseStreamedGame = (event: Event): GinRummyGame | null => {
    if (!("data" in event) || typeof event.data !== "string") return null;
    try {
        const parsed = JSON.parse(event.data) as GinRummyGame;
        return parsed.gameSlug === "gin-rummy" ? parsed : null;
    } catch {
        return null;
    }
};
