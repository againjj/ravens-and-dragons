import type { ConnectorPosition } from "./lunar-base-types";

export const playRoutePattern = /^\/g\/([^/]+)$/;
export const emptyLifecycle = () => undefined;
export const cardWidth = 84;
export const gridSquare = cardWidth;
export const zoomSteps = [10, 20, 35, 50, 65, 80, 90, 100, 110, 125, 150, 200, 250, 300, 400, 600, 1000];
export const minZoomPercent = 10;
export const maxZoomPercent = 1000;
export const minZoom = minZoomPercent / 100;
export const maxZoom = maxZoomPercent / 100;
export const portalRoot = () => document.fullscreenElement ?? document.body;
export const rectCenter = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
export const cardGap = 8;
export const layoutAnimationSelector = "[data-lunar-animate]";
export const cardAnimationDurationMs = 500;
export const connectorPositions: ConnectorPosition[] = ["top", "topLeft", "topRight", "bottomLeft", "bottomRight", "bottom"];
