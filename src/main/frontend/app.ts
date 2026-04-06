type Piece = "dragon" | "raven" | "gold";
type Side = "dragons" | "ravens";
type Phase = "setup" | "move" | "capture";

interface MoveRecord {
    from: string;
    to: string;
    captured?: string;
}

interface GameState {
    board: Map<string, Piece>;
    phase: Phase;
    activeSide: Side;
    selectedSquare: string | null;
    pendingMove: MoveRecord | null;
    turns: MoveRecord[];
}

const boardElement = document.querySelector<HTMLDivElement>("#board");
const boardShellElement = document.querySelector<HTMLDivElement>(".board-shell");
const pageElement = document.querySelector<HTMLElement>(".page");
const statusElement = document.querySelector<HTMLParagraphElement>("#status");
const moveListElement = document.querySelector<HTMLOListElement>("#move-list");
const startButton = document.querySelector<HTMLButtonElement>("#start-button");
const fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-button");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");
const captureSkipButton = document.querySelector<HTMLButtonElement>("#capture-skip-button");
const columnLabelsBottom = document.querySelector<HTMLDivElement>("#column-labels-bottom");
const rowLabelsLeft = document.querySelector<HTMLDivElement>("#row-labels-left");

if (
    !boardElement ||
    !boardShellElement ||
    !pageElement ||
    !statusElement ||
    !moveListElement ||
    !startButton ||
    !fullscreenButton ||
    !resetButton ||
    !captureSkipButton ||
    !columnLabelsBottom ||
    !rowLabelsLeft
) {
    throw new Error("Required DOM elements are missing.");
}

const rowLetters = ["i", "h", "g", "f", "e", "d", "c", "b", "a"];
const bottomToTopLetters = [...rowLetters].reverse();

const createInitialBoard = (): Map<string, Piece> => {
    const board = new Map<string, Piece>();
    board.set("e5", "gold");
    return board;
};

const state: GameState = {
    board: createInitialBoard(),
    phase: "setup",
    activeSide: "dragons",
    selectedSquare: null,
    pendingMove: null,
    turns: []
};

const getSquareName = (rowIndex: number, colIndex: number): string => `${rowLetters[rowIndex]}${colIndex + 1}`;

const pieceGlyph: Record<Piece, string> = {
    dragon: "D",
    raven: "R",
    gold: "G"
};

const oppositeSide = (side: Side): Side => (side === "dragons" ? "ravens" : "dragons");

const sideOwnsPiece = (side: Side, piece: Piece): boolean => {
    if (piece === "gold") {
        return side === "dragons";
    }
    return side === "dragons" ? piece === "dragon" : piece === "raven";
};

const canCapturePiece = (side: Side, piece: Piece): boolean => {
    return side === "dragons" ? piece === "raven" : piece === "dragon" || piece === "gold";
};

const cycleSetupPiece = (square: string): void => {
    if (square === "e5") {
        return;
    }

    const currentPiece = state.board.get(square);
    if (!currentPiece) {
        state.board.set(square, "dragon");
        return;
    }

    if (currentPiece === "dragon") {
        state.board.set(square, "raven");
        return;
    }

    state.board.delete(square);
};

const beginGame = (): void => {
    state.phase = "move";
    state.activeSide = "dragons";
    state.selectedSquare = null;
    state.pendingMove = null;
};

const resetGame = (): void => {
    state.board = createInitialBoard();
    state.phase = "setup";
    state.activeSide = "dragons";
    state.selectedSquare = null;
    state.pendingMove = null;
    state.turns = [];
};

const commitTurn = (capturedSquare?: string): void => {
    if (!state.pendingMove) {
        return;
    }

    const completedMove: MoveRecord = {
        ...state.pendingMove,
        ...(capturedSquare ? { captured: capturedSquare } : {})
    };

    state.turns.push(completedMove);
    state.pendingMove = null;
    state.phase = "move";
    state.selectedSquare = null;
    state.activeSide = oppositeSide(state.activeSide);
};

const handleMove = (origin: string, destination: string): void => {
    if (origin === destination) {
        return;
    }

    const piece = state.board.get(origin);
    if (!piece || state.board.has(destination)) {
        return;
    }

    state.board.delete(origin);
    state.board.set(destination, piece);
    state.selectedSquare = null;
    state.pendingMove = { from: origin, to: destination };

    const hasCapturablePiece = [...state.board.entries()].some(([, boardPiece]) =>
        canCapturePiece(state.activeSide, boardPiece)
    );

    if (hasCapturablePiece) {
        state.phase = "capture";
        return;
    }

    commitTurn();
};

const handleCapture = (square: string): void => {
    const piece = state.board.get(square);
    if (!piece || !canCapturePiece(state.activeSide, piece)) {
        return;
    }

    state.board.delete(square);
    commitTurn(square);
};

const handleSquareClick = (square: string): void => {
    if (state.phase === "setup") {
        cycleSetupPiece(square);
        render();
        return;
    }

    if (state.phase === "capture") {
        handleCapture(square);
        render();
        return;
    }

    const currentPiece = state.board.get(square);
    if (!state.selectedSquare) {
        if (currentPiece && sideOwnsPiece(state.activeSide, currentPiece)) {
            state.selectedSquare = square;
        }
        render();
        return;
    }

    if (state.selectedSquare === square) {
        state.selectedSquare = null;
        render();
        return;
    }

    if (currentPiece && sideOwnsPiece(state.activeSide, currentPiece)) {
        state.selectedSquare = square;
        render();
        return;
    }

    handleMove(state.selectedSquare, square);
    render();
};

const moveToNotation = (move: MoveRecord): string =>
    `${move.from}-${move.to}${move.captured ? `x${move.captured}` : ""}`;

const updateBoardSize = (): void => {
    const shellStyles = window.getComputedStyle(boardShellElement);
    const labelColumnWidth = Number.parseFloat(shellStyles.getPropertyValue("--label-col-width")) || 30;
    const labelRowHeight = Number.parseFloat(shellStyles.getPropertyValue("--label-row-height")) || 30;
    const boardLabelGap = Number.parseFloat(shellStyles.getPropertyValue("--board-label-gap")) || 8;
    const narrowLayout = window.matchMedia("(max-width: 900px), (max-aspect-ratio: 4 / 5)").matches;

    const availableWidth = boardShellElement.clientWidth - labelColumnWidth - boardLabelGap;
    const availableHeight = narrowLayout
        ? availableWidth
        : boardShellElement.clientHeight - labelRowHeight - boardLabelGap;
    const nextBoardSize = Math.max(180, Math.floor(Math.min(availableWidth, availableHeight)));

    boardShellElement.style.setProperty("--board-size", `${nextBoardSize}px`);
};

const updateStatus = (): void => {
    if (state.phase === "setup") {
        statusElement.textContent = "Setup phase: click a square to place dragon, raven, or empty. Gold stays at e5.";
        return;
    }

    if (state.phase === "capture") {
        const opposingLabel = state.activeSide === "dragons" ? "raven" : "dragon or gold";
        statusElement.textContent = `${state.activeSide === "dragons" ? "Dragons" : "Ravens"} moved. Capture one ${opposingLabel}, or skip the capture.`;
        return;
    }

    const moverLabel = state.activeSide === "dragons" ? "Dragons" : "Ravens";
    const extra = state.activeSide === "dragons" ? " Dragons may also move the gold." : "";
    statusElement.textContent = `${moverLabel} to move.${extra}`;
};

const renderLabels = (): void => {
    const columnsMarkup = Array.from({ length: 9 }, (_, index) => `<span>${index + 1}</span>`).join("");
    columnLabelsBottom.innerHTML = columnsMarkup;
    rowLabelsLeft.innerHTML = bottomToTopLetters
        .slice()
        .reverse()
        .map((letter) => `<span>${letter}</span>`)
        .join("");
};

const renderBoard = (): void => {
    const validCaptureSquares = new Set(
        state.phase === "capture"
            ? [...state.board.entries()]
                  .filter(([, piece]) => canCapturePiece(state.activeSide, piece))
                  .map(([square]) => square)
            : []
    );

    const targetableSquares = new Set<string>();
    if (state.phase === "move" && state.selectedSquare) {
        for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
            for (let colIndex = 0; colIndex < 9; colIndex += 1) {
                const square = getSquareName(rowIndex, colIndex);
                if (!state.board.has(square) && square !== state.selectedSquare) {
                    targetableSquares.add(square);
                }
            }
        }
    }

    boardElement.innerHTML = "";

    for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
        for (let colIndex = 0; colIndex < 9; colIndex += 1) {
            const squareName = getSquareName(rowIndex, colIndex);
            const piece = state.board.get(squareName);
            const squareButton = document.createElement("button");
            squareButton.type = "button";
            squareButton.className = "square";
            squareButton.dataset.square = squareName;
            squareButton.setAttribute("aria-label", `Square ${squareName}`);

            if (state.selectedSquare === squareName) {
                squareButton.classList.add("selected");
            }

            if (targetableSquares.has(squareName)) {
                squareButton.classList.add("targetable");
            }

            if (validCaptureSquares.has(squareName)) {
                squareButton.classList.add("capture-target");
            }

            squareButton.addEventListener("click", () => handleSquareClick(squareName));

            const label = document.createElement("span");
            label.className = "square-label";
            label.textContent = squareName;
            squareButton.append(label);

            if (piece) {
                const pieceElement = document.createElement("div");
                pieceElement.className = `piece ${piece}`;
                pieceElement.textContent = pieceGlyph[piece];
                squareButton.append(pieceElement);
            }

            boardElement.append(squareButton);
        }
    }
};

const renderMoveList = (): void => {
    moveListElement.innerHTML = state.turns
        .map((move) => `<li>${moveToNotation(move)}</li>`)
        .join("");
};

const renderControls = (): void => {
    startButton.disabled = state.phase !== "setup";
    captureSkipButton.disabled = state.phase !== "capture";
};

const render = (): void => {
    updateBoardSize();
    renderLabels();
    renderBoard();
    renderMoveList();
    renderControls();
    updateStatus();
};

startButton.addEventListener("click", () => {
    beginGame();
    render();
});

fullscreenButton.addEventListener("click", async () => {
    if (!document.fullscreenEnabled) {
        statusElement.textContent = "Fullscreen is not available in this browser.";
        return;
    }

    if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
    }

    await pageElement.requestFullscreen();
});

resetButton.addEventListener("click", () => {
    resetGame();
    render();
});

captureSkipButton.addEventListener("click", () => {
    commitTurn();
    render();
});

const resizeObserver = new ResizeObserver(() => {
    updateBoardSize();
});

resizeObserver.observe(boardShellElement);
window.addEventListener("resize", updateBoardSize);

render();
