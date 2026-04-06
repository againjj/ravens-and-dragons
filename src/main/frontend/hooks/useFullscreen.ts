import type { RefObject } from "react";

export interface FullscreenResult {
    message: string | null;
}

export const useFullscreen = (pageRef: RefObject<HTMLElement | null>): { toggleFullscreen: () => Promise<FullscreenResult> } => {
    const toggleFullscreen = async (): Promise<FullscreenResult> => {
        const pageElement = pageRef.current;
        if (!pageElement || !document.fullscreenEnabled) {
            return { message: "Fullscreen is not available in this browser." };
        }

        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return { message: null };
        }

        await pageElement.requestFullscreen();
        return { message: null };
    };

    return { toggleFullscreen };
};
