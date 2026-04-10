import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { boardDimension, getPieceAtSquare, getSquareName, rowNumbers, sideOwnsPiece, type Piece } from "../game.js";
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

const getSquareClassName = (
    squareName: string,
    options: {
        selectedSquare: string | null;
        targetableSquares: Set<string>;
        capturableSquares: Set<string>;
        snapshot: NonNullable<ReturnType<typeof selectSnapshot>> | null;
        isCapturePhase: boolean;
    }
): string => {
    const classNames = ["square"];
    const currentPiece = options.snapshot ? getPieceAtSquare(options.snapshot, squareName) : undefined;
    const isClickable =
        !options.snapshot
            ? false
            : options.snapshot.phase === "setup"
              ? true
              : options.snapshot.phase === "capture"
                ? options.capturableSquares.has(squareName)
                : options.snapshot.phase === "move"
                  ? options.targetableSquares.has(squareName) ||
                    (!!currentPiece && sideOwnsPiece(options.snapshot.activeSide, currentPiece))
                  : false;

    if (options.selectedSquare === squareName) {
        classNames.push("selected");
    }

    if (options.snapshot?.phase === "none") {
        classNames.push("is-inactive");
    }

    if (isClickable) {
        classNames.push("is-clickable");
    }

    if (options.targetableSquares.has(squareName)) {
        classNames.push("targetable");
    }

    if (options.isCapturePhase && options.capturableSquares.has(squareName)) {
        classNames.push("capture-target");
    }

    return classNames.join(" ");
};

const getBoardClickAction = (
    square: string,
    snapshot: NonNullable<ReturnType<typeof selectSnapshot>>,
    selectedSquare: string | null,
    capturableSquares: string[]
): BoardClickAction => {
    if (snapshot.phase === "none") {
        return { type: "none" };
    }

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
    const capturableSquareSet = new Set(capturableSquares);
    const targetableSquareSet = new Set(targetableSquares);

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
                {rowNumbers.map((number) => (
                    <span key={number}>{number}</span>
                ))}
            </div>
            <div id="board" className="board" aria-label={`${boardDimension} by ${boardDimension} game board`}>
                {Array.from({ length: boardDimension }, (_, rowIndex) =>
                    Array.from({ length: boardDimension }, (_, colIndex) => {
                        const squareName = getSquareName(rowIndex, colIndex);
                        const piece = snapshot ? getPieceAtSquare(snapshot, squareName) : undefined;

                        return (
                            <button
                                key={squareName}
                                type="button"
                                className={getSquareClassName(squareName, {
                                    selectedSquare,
                                    targetableSquares: targetableSquareSet,
                                    capturableSquares: capturableSquareSet,
                                    snapshot,
                                    isCapturePhase: snapshot?.phase === "capture"
                                })}
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
