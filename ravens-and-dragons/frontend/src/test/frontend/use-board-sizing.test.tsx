import { act, render } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { useRef } from "react";

import { useBoardSizing } from "../../main/frontend/hooks/useBoardSizing.js";

const observeMock = vi.fn();
const disconnectMock = vi.fn();
let resizeObserverCallback: (() => void) | undefined;

class ResizeObserverMock {
    constructor(callback: () => void) {
        resizeObserverCallback = callback;
    }

    observe = observeMock;
    disconnect = disconnectMock;
}

const HookHarness = ({ isEnabled }: { isEnabled: boolean }) => {
    const boardShellRef = useRef<HTMLDivElement | null>(null);

    useBoardSizing(boardShellRef, isEnabled);
    return isEnabled ? (
        <section data-testid="board-panel">
            <div ref={boardShellRef}></div>
        </section>
    ) : null;
};

describe("useBoardSizing", () => {
    beforeEach(() => {
        observeMock.mockReset();
        disconnectMock.mockReset();
        resizeObserverCallback = undefined;
        vi.stubGlobal("ResizeObserver", ResizeObserverMock);
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn()
        }));
    });

    test("attaches sizing observers when the board becomes active after starting disabled", () => {
        const addEventListenerSpy = vi.spyOn(window, "addEventListener");

        const { rerender } = render(<HookHarness isEnabled={false} />);

        expect(observeMock).not.toHaveBeenCalled();

        act(() => {
            rerender(<HookHarness isEnabled={true} />);
        });

        expect(observeMock).toHaveBeenCalledTimes(1);
        expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    });

    test("re-expands the board when the parent container grows after a shrink", () => {
        let panelWidth = 420;
        let panelHeight = 420;
        let shellWidth = 260;
        let shellHeight = 260;

        const { getByTestId } = render(<HookHarness isEnabled={true} />);
        const boardPanel = getByTestId("board-panel");
        const boardShell = boardPanel.firstElementChild as HTMLDivElement;

        const getComputedStyleSpy = vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
            if (element === boardPanel) {
                return {
                    paddingLeft: "14px",
                    paddingRight: "14px",
                    paddingTop: "14px",
                    paddingBottom: "14px",
                    getPropertyValue: () => ""
                } as CSSStyleDeclaration;
            }

            return {
                getPropertyValue: (property: string) => {
                    switch (property) {
                        case "--label-col-width":
                        case "--label-row-height":
                            return "30";
                        case "--board-label-gap":
                            return "8";
                        default:
                            return "";
                    }
                }
            } as CSSStyleDeclaration;
        });

        Object.defineProperty(boardPanel, "clientWidth", { get: () => panelWidth, configurable: true });
        Object.defineProperty(boardPanel, "clientHeight", { get: () => panelHeight, configurable: true });
        Object.defineProperty(boardShell, "clientWidth", { get: () => shellWidth, configurable: true });
        Object.defineProperty(boardShell, "clientHeight", { get: () => shellHeight, configurable: true });

        act(() => {
            resizeObserverCallback?.();
        });

        expect(boardShell.style.getPropertyValue("--board-size")).toBe("354px");

        panelWidth = 620;
        panelHeight = 620;
        shellWidth = 260;
        shellHeight = 260;

        act(() => {
            window.dispatchEvent(new Event("resize"));
        });

        expect(boardShell.style.getPropertyValue("--board-size")).toBe("554px");

        getComputedStyleSpy.mockRestore();
    });
});
