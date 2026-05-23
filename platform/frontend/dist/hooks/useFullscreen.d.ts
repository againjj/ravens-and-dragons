import { type RefObject } from "react";
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
export declare const useFullscreen: (targetRef: RefObject<HTMLElement | null>) => FullscreenControls;
