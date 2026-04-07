import { useAppSelector } from "../app/hooks.js";
import { getTurnHistoryRows } from "../game.js";
import { selectSnapshot } from "../features/game/gameSelectors.js";

export const MoveList = () => {
    const snapshot = useAppSelector(selectSnapshot);
    const turnHistoryRows = getTurnHistoryRows(snapshot?.turns ?? []);
    const moveRows = turnHistoryRows.filter((row) => row.type === "move");
    const gameOverRow = turnHistoryRows.find((row) => row.type === "gameOver");

    return (
        <section className="turns">
            <h2>Move List</h2>
            <div className="turn-history">
                <ol id="move-list">
                    {moveRows.map((row) => (
                        <li key={row.key}>{row.label}</li>
                    ))}
                </ol>
                {gameOverRow ? <div id="game-over-entry">{gameOverRow.label}</div> : null}
                <div className="turns-spacer" aria-hidden="true"></div>
            </div>
        </section>
    );
};
