import { useEffect, type RefObject } from "react";

export const useBoardSizing = (
    boardShellRef: RefObject<HTMLDivElement | null>,
    isEnabled = true
): void => {
    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        const boardShell = boardShellRef.current;
        if (!boardShell) {
            return;
        }

        const sizingContainer = boardShell.parentElement ?? boardShell;

        const updateBoardSize = (): void => {
            const shellStyles = window.getComputedStyle(boardShell);
            const containerStyles = window.getComputedStyle(sizingContainer);
            const labelColumnWidth = Number.parseFloat(shellStyles.getPropertyValue("--label-col-width")) || 30;
            const labelRowHeight = Number.parseFloat(shellStyles.getPropertyValue("--label-row-height")) || 30;
            const boardLabelGap = Number.parseFloat(shellStyles.getPropertyValue("--board-label-gap")) || 8;
            const horizontalPadding =
                (Number.parseFloat(containerStyles.paddingLeft) || 0) +
                (Number.parseFloat(containerStyles.paddingRight) || 0);
            const verticalPadding =
                (Number.parseFloat(containerStyles.paddingTop) || 0) +
                (Number.parseFloat(containerStyles.paddingBottom) || 0);
            const narrowLayout = window.matchMedia("(max-width: 900px), (max-aspect-ratio: 4 / 5)").matches;

            const availableWidth = sizingContainer.clientWidth - horizontalPadding - labelColumnWidth - boardLabelGap;
            const availableHeight = narrowLayout
                ? availableWidth
                : sizingContainer.clientHeight - verticalPadding - labelRowHeight - boardLabelGap;
            const nextBoardSize = Math.max(180, Math.floor(Math.min(availableWidth, availableHeight)));
            const nextBoardSizeValue = `${nextBoardSize}px`;

            if (boardShell.style.getPropertyValue("--board-size") !== nextBoardSizeValue) {
                boardShell.style.setProperty("--board-size", nextBoardSizeValue);
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            updateBoardSize();
        });

        resizeObserver.observe(sizingContainer);
        window.addEventListener("resize", updateBoardSize);
        updateBoardSize();

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", updateBoardSize);
        };
    }, [boardShellRef, isEnabled]);
};
