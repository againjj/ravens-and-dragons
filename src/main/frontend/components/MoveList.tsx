import { useEffect, useRef } from "react";

import { useAppSelector } from "../app/hooks.js";
import { getTurnHistoryRows } from "../game.js";
import { selectSnapshot } from "../features/game/gameSelectors.js";

export const MoveList = () => {
    const snapshot = useAppSelector(selectSnapshot);
    const turnHistoryRows = getTurnHistoryRows(snapshot?.turns ?? []);
    const moveRows = turnHistoryRows.filter((row) => row.type === "move");
    const gameOverRow = turnHistoryRows.find((row) => row.type === "gameOver");
    const hasHistory = moveRows.length > 0 || !!gameOverRow;
    const endOfHistoryRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!hasHistory) {
            return;
        }

        endOfHistoryRef.current?.scrollIntoView?.({ block: "end" });
    }, [hasHistory, turnHistoryRows]);

    return (
        <section className="turns">
            <h2>Move List</h2>
            <div className="turn-history">
                {moveRows.length > 0 ? (
                    <ol id="move-list">
                        {moveRows.map((row) => (
                            <li key={row.key}>{row.label}</li>
                        ))}
                    </ol>
                ) : (
                    <p className="turns-empty">Moves will appear here once play begins.</p>
                )}
                {gameOverRow ? <div id="game-over-entry">{gameOverRow.label}</div> : null}
                <div ref={endOfHistoryRef} aria-hidden="true"></div>
                <div className={`turns-spacer${hasHistory ? "" : " is-empty"}`} aria-hidden="true"></div>
            </div>
        </section>
    );
};
