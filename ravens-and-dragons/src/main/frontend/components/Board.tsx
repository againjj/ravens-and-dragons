import type { CSSProperties } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks.js";
import { getBoardDimension, getRowNumbers, getSquareName, isHighlightedBoardSquare } from "../board-geometry.js";
import { selectCanViewerAct, selectCapturableSquares, selectSelectedSquare, selectSnapshot, selectTargetableSquares } from "../features/game/gameSelectors.js";
import { capturePiece, movePiece } from "../features/game/gameThunks.js";
import { uiActions } from "../features/ui/uiSlice.js";
import { getPieceAtSquare, normalizeSelectedSquare, sideOwnsPiece } from "../game-rules-client.js";
import type { ServerGameSnapshot, Piece } from "../game-types.js";

type BoardClickAction =
    | { type: "none" }
    | { type: "edit-draft"; square: string }
    | { type: "capture-piece"; square: string }
    | { type: "select"; square: string | null }
    | { type: "move-piece"; origin: string; destination: string };

const pieceGlyph: Record<Piece, string> = {
    dragon: "D",
    raven: "R",
    gold: "G"
};

export interface BoardViewProps {
    snapshot: ServerGameSnapshot | null;
    selectedSquare: string | null;
    canViewerAct: boolean;
    capturableSquares: string[];
    targetableSquares: string[];
    onCycleSetupSquare?: (square: string) => void;
    onCapturePiece?: (square: string) => void;
    onSelectSquare?: (square: string | null) => void;
    onMovePiece?: (origin: string, destination: string) => void;
}

const getSquareClassName = (
    squareName: string,
    options: {
        selectedSquare: string | null;
        targetableSquares: Set<string>;
        capturableSquares: Set<string>;
        snapshot: ServerGameSnapshot | null;
        canViewerAct: boolean;
        isDraftEditable: boolean;
    }
): string => {
    const classNames = ["square"];
    const currentPiece = options.snapshot ? getPieceAtSquare(options.snapshot, squareName) : undefined;
    const isClickable =
        !options.snapshot
            ? false
            : !options.canViewerAct
              ? false
              : options.isDraftEditable
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

    if (options.snapshot && isHighlightedBoardSquare(squareName, options.snapshot)) {
        classNames.push("special-square");
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

    if (options.snapshot?.phase === "capture" && options.capturableSquares.has(squareName)) {
        classNames.push("capture-target");
    }

    return classNames.join(" ");
};

const getBoardClickAction = (
    square: string,
    snapshot: ServerGameSnapshot,
    selectedSquare: string | null,
    capturableSquares: string[],
    canViewerAct: boolean,
    isDraftEditable: boolean
): BoardClickAction => {
    if (!canViewerAct) {
        return { type: "none" };
    }

    if (snapshot.phase === "none") {
        return { type: "none" };
    }

    if (isDraftEditable) {
        return { type: "edit-draft", square };
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

export const BoardView = ({
    snapshot,
    selectedSquare,
    canViewerAct,
    capturableSquares,
    targetableSquares,
    onCycleSetupSquare,
    onCapturePiece,
    onSelectSquare,
    onMovePiece
}: BoardViewProps) => {
    const isDraftEditable = !!onCycleSetupSquare;
    const normalizedSelectedSquare = snapshot && canViewerAct ? normalizeSelectedSquare(snapshot, selectedSquare) : null;
    const capturableSquareSet = new Set(canViewerAct ? capturableSquares : []);
    const targetableSquareSet = new Set(canViewerAct ? targetableSquares : []);
    const boardDimension = getBoardDimension(snapshot);
    const rowNumbers = getRowNumbers(boardDimension);
    const boardStyle = { "--board-dimension": String(boardDimension) } as CSSProperties;

    const handleSquareClick = (square: string): void => {
        if (!snapshot) {
            return;
        }

        const action = getBoardClickAction(square, snapshot, selectedSquare, capturableSquares, canViewerAct, isDraftEditable);
        switch (action.type) {
            case "edit-draft":
                onCycleSetupSquare?.(action.square);
                return;
            case "capture-piece":
                onCapturePiece?.(action.square);
                return;
            case "select":
                onSelectSquare?.(action.square);
                return;
            case "move-piece":
                onMovePiece?.(action.origin, action.destination);
                return;
            case "none":
                return;
        }
    };

    return (
        <div className="board-row">
            <div className="row-labels left" id="row-labels-left" style={boardStyle}>
                {rowNumbers.map((number) => (
                    <span key={number}>{number}</span>
                ))}
            </div>
            <div id="board" className="board" style={boardStyle} aria-label={`${boardDimension} by ${boardDimension} game board`}>
                {Array.from({ length: boardDimension }, (_, rowIndex) =>
                    Array.from({ length: boardDimension }, (_, colIndex) => {
                        const squareName = getSquareName(rowIndex, colIndex, boardDimension);
                        const piece = snapshot ? getPieceAtSquare(snapshot, squareName) : undefined;

                        return (
                            <button
                                key={squareName}
                                type="button"
                                className={getSquareClassName(squareName, {
                                    selectedSquare: normalizedSelectedSquare,
                                    targetableSquares: targetableSquareSet,
                                    capturableSquares: capturableSquareSet,
                                    snapshot,
                                    canViewerAct,
                                    isDraftEditable
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

export const Board = () => {
    const dispatch = useAppDispatch();
    const snapshot = useAppSelector(selectSnapshot);
    const selectedSquare = useAppSelector(selectSelectedSquare);
    const canViewerAct = useAppSelector(selectCanViewerAct);
    const capturableSquares = useAppSelector(selectCapturableSquares);
    const targetableSquares = useAppSelector(selectTargetableSquares);

    return (
        <BoardView
            snapshot={snapshot}
            selectedSquare={selectedSquare}
            canViewerAct={canViewerAct}
            capturableSquares={capturableSquares}
            targetableSquares={targetableSquares}
            onCapturePiece={(square) => {
                void dispatch(capturePiece(square));
            }}
            onSelectSquare={(square) => {
                dispatch(uiActions.selectedSquareSet(square));
            }}
            onMovePiece={(origin, destination) => {
                dispatch(uiActions.selectedSquareSet(null));
                void dispatch(movePiece(origin, destination));
            }}
        />
    );
};
