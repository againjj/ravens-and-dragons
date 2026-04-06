import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { getPieceAtSquare, getSquareName, rowLetters, sideOwnsPiece, type Piece } from "../game.js";
import { selectCapturableSquares, selectSelectedSquare, selectSnapshot, selectTargetableSquares } from "../features/game/gameSelectors.js";
import { capturePiece, cycleSetup, movePiece } from "../features/game/gameThunks.js";
import { uiActions } from "../features/ui/uiSlice.js";

type BoardClickAction =
    | { type: "none" }
    | { type: "cycle-setup"; square: string }
    | { type: "capture-piece"; square: string }
    | { type: "select"; square: string | null }
    | { type: "move-piece"; origin: string; destination: string };

const pieceGlyph: Record<Piece, string> = {
    dragon: "D",
    raven: "R",
    gold: "G"
};

const getBoardClickAction = (
    square: string,
    snapshot: NonNullable<ReturnType<typeof selectSnapshot>>,
    selectedSquare: string | null,
    capturableSquares: string[]
): BoardClickAction => {
    if (snapshot.phase === "setup") {
        return { type: "cycle-setup", square };
    }

    if (snapshot.phase === "capture") {
        return capturableSquares.includes(square) ? { type: "capture-piece", square } : { type: "none" };
    }

    const currentPiece = getPieceAtSquare(snapshot, square);
    if (!selectedSquare) {
        return currentPiece && sideOwnsPiece(snapshot.activeSide, currentPiece)
            ? { type: "select", square }
            : { type: "none" };
    }

    if (selectedSquare === square) {
        return { type: "select", square: null };
    }

    if (currentPiece && sideOwnsPiece(snapshot.activeSide, currentPiece)) {
        return { type: "select", square };
    }

    return { type: "move-piece", origin: selectedSquare, destination: square };
};

export const Board = () => {
    const dispatch = useAppDispatch();
    const snapshot = useAppSelector(selectSnapshot);
    const selectedSquare = useAppSelector(selectSelectedSquare);
    const capturableSquares = useAppSelector(selectCapturableSquares);
    const targetableSquares = useAppSelector(selectTargetableSquares);

    const handleSquareClick = (square: string): void => {
        if (!snapshot) {
            return;
        }

        const action = getBoardClickAction(square, snapshot, selectedSquare, capturableSquares);
        switch (action.type) {
            case "cycle-setup":
                void dispatch(cycleSetup(action.square));
                return;
            case "capture-piece":
                void dispatch(capturePiece(action.square));
                return;
            case "select":
                dispatch(uiActions.selectedSquareSet(action.square));
                return;
            case "move-piece":
                dispatch(uiActions.selectedSquareSet(null));
                void dispatch(movePiece(action.origin, action.destination));
                return;
            case "none":
                return;
        }
    };

    return (
        <div className="board-row">
            <div className="row-labels left" id="row-labels-left">
                {rowLetters.map((letter) => (
                    <span key={letter}>{letter}</span>
                ))}
            </div>
            <div id="board" className="board" aria-label="9 by 9 game board">
                {Array.from({ length: 9 }, (_, rowIndex) =>
                    Array.from({ length: 9 }, (_, colIndex) => {
                        const squareName = getSquareName(rowIndex, colIndex);
                        const piece = snapshot ? getPieceAtSquare(snapshot, squareName) : undefined;
                        const classNames = ["square"];

                        if (selectedSquare === squareName) {
                            classNames.push("selected");
                        }

                        if (targetableSquares.includes(squareName)) {
                            classNames.push("targetable");
                        }

                        if (capturableSquares.includes(squareName) && snapshot?.phase === "capture") {
                            classNames.push("capture-target");
                        }

                        return (
                            <button
                                key={squareName}
                                type="button"
                                className={classNames.join(" ")}
                                data-square={squareName}
                                aria-label={`Square ${squareName}`}
                                onClick={() => {
                                    handleSquareClick(squareName);
                                }}
                            >
                                <span className="square-label">{squareName}</span>
                                {piece ? <div className={`piece ${piece}`}>{pieceGlyph[piece]}</div> : null}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
};
