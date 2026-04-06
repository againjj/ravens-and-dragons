import { useEffect, type RefObject } from "react";

export const useBoardSizing = (boardShellRef: RefObject<HTMLDivElement | null>): void => {
    useEffect(() => {
        const boardShell = boardShellRef.current;
        if (!boardShell) {
            return;
        }

        const updateBoardSize = (): void => {
            const shellStyles = window.getComputedStyle(boardShell);
            const labelColumnWidth = Number.parseFloat(shellStyles.getPropertyValue("--label-col-width")) || 30;
            const labelRowHeight = Number.parseFloat(shellStyles.getPropertyValue("--label-row-height")) || 30;
            const boardLabelGap = Number.parseFloat(shellStyles.getPropertyValue("--board-label-gap")) || 8;
            const narrowLayout = window.matchMedia("(max-width: 900px), (max-aspect-ratio: 4 / 5)").matches;

            const availableWidth = boardShell.clientWidth - labelColumnWidth - boardLabelGap;
            const availableHeight = narrowLayout
                ? availableWidth
                : boardShell.clientHeight - labelRowHeight - boardLabelGap;
            const nextBoardSize = Math.max(180, Math.floor(Math.min(availableWidth, availableHeight)));
            const nextBoardSizeValue = `${nextBoardSize}px`;

            if (boardShell.style.getPropertyValue("--board-size") !== nextBoardSizeValue) {
                boardShell.style.setProperty("--board-size", nextBoardSizeValue);
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            updateBoardSize();
        });

        resizeObserver.observe(boardShell);
        window.addEventListener("resize", updateBoardSize);
        updateBoardSize();

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", updateBoardSize);
        };
    }, [boardShellRef]);
};
