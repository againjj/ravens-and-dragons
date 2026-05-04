import { useEffect, useRef } from "react";

import { useAppSelector } from "../app/hooks.js";
import { selectSnapshot } from "../features/game/gameSelectors.js";
import { getGroupedMoveHistoryRows, getGameOverHistoryLabel, getLatestGameOverTurn, getTurnHistoryRows } from "../move-history.js";

export const MoveList = () => {
    const snapshot = useAppSelector(selectSnapshot);
    const turnHistoryRows = getTurnHistoryRows(snapshot?.turns ?? []);
    const moveRows = getGroupedMoveHistoryRows(turnHistoryRows);
    const gameOverTurn = snapshot ? getLatestGameOverTurn(snapshot.turns) : null;
    const gameOverRow = gameOverTurn ? getGameOverHistoryLabel(gameOverTurn.outcome) : null;
    const hasHistory = moveRows.length > 0 || !!gameOverRow;
    const historyContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!hasHistory) {
            return;
        }

        const historyContainer = historyContainerRef.current;
        if (!historyContainer) {
            return;
        }

        historyContainer.scrollTop = historyContainer.scrollHeight;
    }, [hasHistory, turnHistoryRows]);

    return (
        <div ref={historyContainerRef} className="turn-history">
            {moveRows.length > 0 ? (
                <ol id="move-list" className="move-list">
                    {moveRows.map((row) => (
                        <li key={row.key} className="move-list-row" value={row.moveNumber}>
                            <span className="move-list-number">{row.moveNumber}.</span>
                            <span className="move-list-cell">{row.leftLabel}</span>
                            <span className="move-list-cell">{row.rightLabel ?? ""}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="turns-empty">Moves will appear here once play begins.</p>
            )}
            {gameOverRow ? <div id="game-over-entry">{gameOverRow}</div> : null}
            <div className={`turns-spacer${hasHistory ? "" : " is-empty"}`} aria-hidden="true"></div>
        </div>
    );
};
