import { useAppSelector } from "../app/hooks.js";
import { moveToNotation, type MoveRecord } from "../game.js";
import { selectSnapshot } from "../features/game/gameSelectors.js";

export const MoveList = () => {
    const snapshot = useAppSelector(selectSnapshot);

    return (
        <section className="turns">
            <h2>Move List</h2>
            <ol id="move-list">
                {(snapshot?.turns ?? []).map((move: MoveRecord, index: number) => (
                    <li key={`${move.from}-${move.to}-${move.captured ?? "none"}-${index}`}>
                        {moveToNotation(move)}
                    </li>
                ))}
            </ol>
        </section>
    );
};
