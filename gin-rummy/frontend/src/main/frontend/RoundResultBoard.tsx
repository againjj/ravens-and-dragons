import { CardView } from "./CardView";
import { deckById } from "./gin-rummy-cards";
import type { GinRummyConfig, GinRummyGame, RoundResult } from "./gin-rummy-types";
import { buildScoreSummary, groupLayoffsByMeld, pointLabel, seatDisplayName } from "./gin-rummy-rules";
export const RoundResultBoard = ({ game, result, onNext }: { game: GinRummyGame; result: RoundResult; onNext: () => void }) => {
    const knockerSeat = result.knockerSeat ?? game.currentSeat;
    const defenderSeat = knockerSeat === 0 ? 1 : 0;
    const layoffGroups = groupLayoffsByMeld(result.layoffs, result.selectedMelds, game.config.aceHighAllowed);
    const scoreSummary = buildScoreSummary(game, result, knockerSeat, defenderSeat);
    const resultRowCount = Math.max(result.selectedMelds.length, layoffGroups.length, result.defenderMelds.length, 1);
    const nextLabel = game.phase === "roundOver"
        ? "Next Hand"
        : game.phase === "gameOver" && game.config.playMode === "bestOfFiveMatch"
            ? "Next Game"
            : game.phase === "matchOver"
                ? "Close"
                : game.phase === "gameOver"
                    ? "Close"
                    : "Close";
    const gameScoreLines = result.scoreLines?.slice(1) ?? [];
    const showGameScoreSummary = game.phase === "gameOver" || game.phase === "matchOver";
    return (
        <section className="gin-result-board">
            <div className="gin-result-melds gin-result-knocker">
                <strong>{seatDisplayName(game, knockerSeat, "Knocker")}</strong>
                <div className="gin-result-card-rows">
                    {Array.from({ length: resultRowCount }, (_, index) => (
                        <div key={index} className="gin-result-row">
                            <ResultCardRun cards={result.selectedMelds[index] ?? []} emptyLabel="" />
                        </div>
                    ))}
                    <div className="gin-result-row gin-result-deadwood">
                        <span>Deadwood: {pointLabel(result.knockerDeadwood ?? 0)}</span>
                        <ResultCardRun cards={result.selectedDeadwood} />
                    </div>
                </div>
            </div>
            <div className="gin-result-melds gin-result-layoffs">
                <strong>{seatDisplayName(game, defenderSeat, "Opponent")} layoffs</strong>
                <div className="gin-result-card-rows">
                    {Array.from({ length: resultRowCount }, (_, index) => (
                        <div key={index} className="gin-result-row">
                            <ResultCardRun cards={layoffGroups[index] ?? []} emptyLabel="" />
                        </div>
                    ))}
                    <div className="gin-result-row gin-result-deadwood gin-result-deadwood-spacer" aria-hidden="true" />
                </div>
            </div>
            <div className="gin-result-melds gin-result-defender">
                <strong>{seatDisplayName(game, defenderSeat, "Opponent")} melds</strong>
                <div className="gin-result-card-rows">
                    {Array.from({ length: resultRowCount }, (_, index) => (
                        <div key={index} className="gin-result-row">
                            <ResultCardRun cards={result.defenderMelds[index] ?? []} emptyLabel="" />
                        </div>
                    ))}
                    <div className="gin-result-row gin-result-deadwood">
                        <span>Deadwood: {pointLabel(result.defenderDeadwood ?? 0)}</span>
                        <ResultCardRun cards={result.defenderDeadwoodCards} />
                    </div>
                </div>
            </div>
            <aside className="gin-result-tally">
                <strong>{scoreSummary.title}</strong>
                {scoreSummary.lines.map((line, index) => (
                    <span key={index}>
                        <span>{line.label}</span>
                        <strong>{line.value}</strong>
                    </span>
                ))}
                <hr />
                <span>
                    <span>{scoreSummary.totalLabel}</span>
                    <strong>{result.points}</strong>
                </span>
                {showGameScoreSummary ? (
                    <>
                        <strong>Game Score</strong>
                        {gameScoreLines.map((line, index) => (
                            <span key={`${line.reason}-${index}`}>
                                <span>{line.reason}:</span>
                                <strong>{line.points}</strong>
                            </span>
                        ))}
                        <span>
                            <span>{seatDisplayName(game, 0)}:</span>
                            <strong>{game.scores.gamePoints[0]}</strong>
                        </span>
                        <span>
                            <span>{seatDisplayName(game, 1)}:</span>
                            <strong>{game.scores.gamePoints[1]}</strong>
                        </span>
                    </>
                ) : null}
                <button type="button" onClick={onNext}>{nextLabel}</button>
            </aside>
        </section>
    );
};

const ResultCardRun = ({ cards, emptyLabel = "None" }: { cards: string[]; emptyLabel?: string }) => (
    <div className="gin-result-card-run">
        {cards.length > 0 ? cards.map((cardId, index) => {
            const card = deckById.get(cardId);
            return (
                <div key={cardId} className="gin-result-card-slot" style={{ zIndex: index + 1 }}>
                    {card ? <CardView card={card} /> : <span>{cardId}</span>}
                </div>
            );
        }) : <span>{emptyLabel}</span>}
    </div>
);

export const FinishedGinRummyLayout = ({ game }: { game: GinRummyGame }) => {
    const winnerSeat = game.winnerSeat ?? 0;
    const winnerName = seatDisplayName(game, winnerSeat);
    const isMatch = game.config.playMode === "bestOfFiveMatch";
    return (
        <section className="gin-finished-layout">
            <h1>{winnerName} Wins!</h1>
            <div className="gin-finished-scores">
                {[0, 1].map((seat) => (
                    <span key={seat}>
                        <strong>{seatDisplayName(game, seat)}</strong>
                        {isMatch ? ` ${game.scores.gamesWon[seat]} games won` : ` ${game.scores.gamePoints[seat]} game score`}
                    </span>
                ))}
            </div>
        </section>
    );
};

export const RulesReference = ({ config }: { config: GinRummyConfig }) => (
    <section className="panel gin-rules">
        <h2>Rules</h2>
        <section>
            <h3>Goal</h3>
            <p>Two players play hands until someone reaches {pointLabel(config.targetScore)}. {config.playMode === "singleGame" ? "This table is a single game, so no game bonus is awarded." : "This table is a best-of-five match, so games won and running total points are tracked."}</p>
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
            <p>A card drawn from the discard pile cannot be discarded immediately on the same turn. After a turn ends, if only two cards remain in stock and no one went out, the hand ends in a draw and no points are awarded.</p>
        </section>
        <section>
            <h3>Knocking And Go Gin</h3>
            <p>You may knock when your chosen meld arrangement leaves {pointLabel(10)} or fewer after the discard. When multiple legal arrangements exist, the knocker chooses the arrangement to reveal.</p>
            <p>After a knock, the defender reveals melds and may lay off deadwood onto the knocker's melds. The defender's deadwood is automatically minimized. The knocker never lays off onto the defender's melds.</p>
            <p>Go Gin means ending with zero deadwood. The defender cannot lay off against Go Gin. {config.bigGinAllowed ? "Go Big Gin is enabled: after drawing, an 11-card hand that all melds may end the hand for the Go Big Gin bonus." : "Go Big Gin is disabled at this table."}</p>
        </section>
        <section>
            <h3>Hand Scoring</h3>
            <p>Successful knock: the knocker scores the defender's deadwood after layoffs minus the knocker's deadwood.</p>
            <p>Undercut: if the defender's deadwood is less than or equal to the knocker's deadwood, the defender scores 25 plus the deadwood difference.</p>
            <p>Go Gin scores 25 plus the defender's deadwood. {config.bigGinAllowed ? "Go Big Gin scores 31 plus the defender's deadwood." : ""}</p>
        </section>
        <section>
            <h3>Game Scoring</h3>
            {config.playMode === "singleGame" ? (
                <p>The first player to reach {pointLabel(config.targetScore)} wins this single game. Game bonus and line/box bonus are not applied in single-game play.</p>
            ) : (
                <>
                    <p>The first player to reach {pointLabel(config.targetScore)} wins the game. Game points are recorded as a running sum across the best-of-five match.</p>
                    <p>The game winner receives a 100-point game bonus. {config.lineBonusEnabled ? "Line/box bonus is enabled: each hand won in the game adds 25 points." : "Line/box bonus is disabled."} Shutout doubling is always enabled.</p>
                </>
            )}
        </section>
    </section>
);
