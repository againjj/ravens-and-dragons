import {
    getCapturableSquares,
    getPieceAtSquare,
    getSquareName,
    getTargetableSquares,
    moveToNotation,
    normalizeSelectedSquare,
    rowLetters,
    sideOwnsPiece,
    type GameCommandRequest,
    type Piece,
    type ServerGameSession,
    type ServerGameSnapshot
} from "./game.js";
import {
    fetchGameSession,
    isSameServerGame,
    openGameStream,
    sendGameCommandRequest
} from "./game-client.js";

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

let serverGame: ServerGameSession | null = null;
let selectedSquare: string | null = null;
let closeGameStream: (() => void) | null = null;
let isSubmitting = false;
let loadingMessage = "Loading shared game...";

const pieceGlyph: Record<Piece, string> = {
    dragon: "D",
    raven: "R",
    gold: "G"
};

const getSnapshot = (): ServerGameSnapshot | null => serverGame?.snapshot ?? null;

const updateSelectedSquare = (nextSquare: string | null): void => {
    selectedSquare = nextSquare;
    render();
};

const render = (): void => {
    updateBoardSize();
    renderBoard();
    renderMoveList();
    renderControls();
    updateStatus();
};

const applyServerGame = (nextGame: ServerGameSession): void => {
    if (isSameServerGame(serverGame, nextGame)) {
        return;
    }

    serverGame = nextGame;
    selectedSquare = normalizeSelectedSquare(nextGame.snapshot, selectedSquare);
    render();
};

const fetchGame = async (): Promise<void> => {
    applyServerGame(await fetchGameSession());
};

const sendCommand = async (
    partialCommand: Omit<GameCommandRequest, "expectedVersion">
): Promise<void> => {
    if (!serverGame || isSubmitting) {
        return;
    }

    isSubmitting = true;
    renderControls();

    try {
        const result = await sendGameCommandRequest(serverGame, partialCommand);
        if (result.game) {
            applyServerGame(result.game);
            return;
        }

        statusElement.textContent = result.errorMessage ?? "Unable to apply that action right now.";
    } finally {
        isSubmitting = false;
        renderControls();
    }
};

const connectStream = (): void => {
    closeGameStream?.();
    closeGameStream = openGameStream(
        (url) => new EventSource(url),
        applyServerGame,
        () => {
            loadingMessage = "Loading shared game...";
            render();
        },
        () => {
            loadingMessage = "Connection lost. Trying to reconnect...";
            render();
        }
    );
};

const handleSquareClick = (square: string): void => {
    const snapshot = getSnapshot();
    if (!snapshot) {
        return;
    }

    if (snapshot.phase === "setup") {
        void sendCommand({ type: "cycle-setup", square });
        return;
    }

    if (snapshot.phase === "capture") {
        if (getCapturableSquares(snapshot).includes(square)) {
            void sendCommand({ type: "capture-piece", square });
        }
        return;
    }

    const currentPiece = getPieceAtSquare(snapshot, square);
    if (!selectedSquare) {
        if (currentPiece && sideOwnsPiece(snapshot.activeSide, currentPiece)) {
            updateSelectedSquare(square);
            return;
        }
        return;
    }

    if (selectedSquare === square) {
        updateSelectedSquare(null);
        return;
    }

    if (currentPiece && sideOwnsPiece(snapshot.activeSide, currentPiece)) {
        updateSelectedSquare(square);
        return;
    }

    const origin = selectedSquare;
    updateSelectedSquare(null);
    void sendCommand({ type: "move-piece", origin, destination: square });
};

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
    const nextBoardSizeValue = `${nextBoardSize}px`;

    if (boardShellElement.style.getPropertyValue("--board-size") !== nextBoardSizeValue) {
        boardShellElement.style.setProperty("--board-size", nextBoardSizeValue);
    }
};

const updateStatus = (): void => {
    const snapshot = getSnapshot();
    if (!snapshot) {
        statusElement.textContent = loadingMessage;
        return;
    }

    if (snapshot.phase === "setup") {
        statusElement.textContent = "Setup phase: click a square to place dragon, raven, or empty. Gold stays at e5.";
        return;
    }

    if (snapshot.phase === "capture") {
        const opposingLabel = snapshot.activeSide === "dragons" ? "raven" : "dragon or gold";
        statusElement.textContent = `${snapshot.activeSide === "dragons" ? "Dragons" : "Ravens"} moved. Capture one ${opposingLabel}, or skip the capture.`;
        return;
    }

    const moverLabel = snapshot.activeSide === "dragons" ? "Dragons" : "Ravens";
    const extra = snapshot.activeSide === "dragons" ? " Dragons may also move the gold." : "";
    statusElement.textContent = `${moverLabel} to move.${extra}`;
};

const initializeLabels = (): void => {
    const columnsMarkup = Array.from({ length: 9 }, (_, index) => `<span>${index + 1}</span>`).join("");
    columnLabelsBottom.innerHTML = columnsMarkup;
    rowLabelsLeft.innerHTML = rowLetters.map((letter) => `<span>${letter}</span>`).join("");
};

const renderBoard = (): void => {
    const snapshot = getSnapshot();
    const validCaptureSquares = new Set(snapshot?.phase === "capture" ? getCapturableSquares(snapshot) : []);
    const targetableSquares = new Set(snapshot ? getTargetableSquares(snapshot, selectedSquare) : []);

    boardElement.innerHTML = "";

    for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
        for (let colIndex = 0; colIndex < 9; colIndex += 1) {
            const squareName = getSquareName(rowIndex, colIndex);
            const piece = snapshot ? getPieceAtSquare(snapshot, squareName) : undefined;
            const squareButton = document.createElement("button");
            squareButton.type = "button";
            squareButton.className = "square";
            squareButton.dataset.square = squareName;
            squareButton.setAttribute("aria-label", `Square ${squareName}`);

            if (selectedSquare === squareName) {
                squareButton.classList.add("selected");
            }

            if (targetableSquares.has(squareName)) {
                squareButton.classList.add("targetable");
            }

            if (validCaptureSquares.has(squareName)) {
                squareButton.classList.add("capture-target");
            }

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
    const snapshot = getSnapshot();
    moveListElement.innerHTML = (snapshot?.turns ?? [])
        .map((move) => `<li>${moveToNotation(move)}</li>`)
        .join("");
};

const renderControls = (): void => {
    const snapshot = getSnapshot();
    const disabled = !snapshot || isSubmitting;

    startButton.disabled = disabled || snapshot.phase !== "setup";
    captureSkipButton.disabled = disabled || snapshot.phase !== "capture";
    resetButton.disabled = disabled;
};

boardElement.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const squareButton = target.closest<HTMLButtonElement>(".square[data-square]");
    const squareName = squareButton?.dataset.square;
    if (!squareName) {
        return;
    }

    handleSquareClick(squareName);
});

startButton.addEventListener("click", () => {
    selectedSquare = null;
    void sendCommand({ type: "begin-game" });
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
    selectedSquare = null;
    void sendCommand({ type: "reset-game" });
});

captureSkipButton.addEventListener("click", () => {
    void sendCommand({ type: "skip-capture" });
});

const resizeObserver = new ResizeObserver(() => {
    updateBoardSize();
});

resizeObserver.observe(boardShellElement);
window.addEventListener("resize", updateBoardSize);

initializeLabels();
render();
void fetchGame()
    .then(() => {
        connectStream();
    })
    .catch(() => {
        loadingMessage = "Unable to load shared game.";
        render();
    });
