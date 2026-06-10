import { useState } from "react";
import { cardWidth, maxZoomPercent, minZoom, minZoomPercent, zoomSteps } from "./lunar-base-constants";

export const sanitizeZoomText = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    return digits ? `${digits}${value.trim().endsWith("%") ? "%" : ""}` : "";
};

export const zoomTextToPercent = (value: string): number | null => {
    const digits = value.replace(/\D/g, "");
    return digits ? Number(digits) : null;
};

export const clipZoomPercent = (value: number): number =>
    Math.min(maxZoomPercent, Math.max(minZoomPercent, value));

export const zoomPercentToZoom = (value: number): number =>
    clipZoomPercent(value) / 100;

export const zoomToPercent = (zoom: number): number =>
    Math.round(zoom * 100);

export const nextZoomStep = (zoom: number, direction: -1 | 1): number => {
    const currentPercent = zoomToPercent(zoom);
    if (direction > 0) {
        return (zoomSteps.find((step) => step > currentPercent) ?? zoomSteps[zoomSteps.length - 1]) / 100;
    }
    return ([...zoomSteps].reverse().find((step) => step < currentPercent) ?? zoomSteps[0]) / 100;
};

const initialZoom = () => Math.min(1, Math.max(minZoom, window.innerWidth / (cardWidth * 10 + 48)));

export const useLunarBaseZoom = () => {
    const [zoom, setZoom] = useState(initialZoom);
    const [zoomText, setZoomText] = useState(() => `${zoomToPercent(initialZoom())}%`);

    return { zoom, setZoom, zoomText, setZoomText };
};
