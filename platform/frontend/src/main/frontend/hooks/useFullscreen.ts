import { useCallback, useEffect, useState, type RefObject } from "react";

const getFullscreenElement = () => document.fullscreenElement;

export interface FullscreenResult {
    ok: boolean;
    message?: string;
}

export interface FullscreenControls {
    isFullscreen: boolean;
    enterFullscreen: () => Promise<FullscreenResult>;
    exitFullscreen: () => Promise<FullscreenResult>;
    toggleFullscreen: () => Promise<FullscreenResult>;
}

export const useFullscreen = (targetRef: RefObject<HTMLElement | null>): FullscreenControls => {
    const [isFullscreen, setIsFullscreen] = useState(() => getFullscreenElement() != null);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(getFullscreenElement() != null);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    const enterFullscreen = useCallback(async () => {
        const target = targetRef.current;
        if (!target || !target.requestFullscreen) {
            return { ok: false, message: "Fullscreen is not available in this browser." };
        }
        if (getFullscreenElement()) {
            return { ok: true };
        }

        try {
            await target.requestFullscreen();
            setIsFullscreen(true);
            return { ok: true };
        } catch {
            return { ok: false, message: "Unable to enter fullscreen." };
        }
    }, [targetRef]);

    const exitFullscreen = useCallback(async () => {
        if (!getFullscreenElement()) {
            return { ok: true };
        }
        if (!document.exitFullscreen) {
            return { ok: false, message: "Fullscreen is not available in this browser." };
        }

        try {
            await document.exitFullscreen();
            setIsFullscreen(false);
            return { ok: true };
        } catch {
            return { ok: false, message: "Unable to exit fullscreen." };
        }
    }, []);

    const toggleFullscreen = useCallback(
        async () => (getFullscreenElement() ? exitFullscreen() : enterFullscreen()),
        [enterFullscreen, exitFullscreen]
    );

    return {
        isFullscreen,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen
    };
};
