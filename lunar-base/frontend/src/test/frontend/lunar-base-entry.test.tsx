import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lunarBaseGameEntry } from "../../main/frontend/lunar-base-entry";
import { setScaledDragImage } from "../../main/frontend/LunarBasePlayerBoard";
import { createDragAutoScrollState, dragAutoScrollDelta } from "../../main/frontend/lunar-base-game-logic";

let servedGame: Record<string, unknown>;

describe("lunarBaseGameEntry", () => {
    beforeEach(() => {
        servedGame = lunarBaseGame();
        vi.stubGlobal("EventSource", class {
            addEventListener = vi.fn();
            close = vi.fn();
            onerror: (() => void) | null = null;
        });
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
                servedGame = lunarBaseGameWithPlayedModule();
                return jsonResponse({});
            }
            if (url.includes("/view")) {
                return jsonResponse(servedGame);
            }
            if (url.includes("/api/auth/session")) {
                return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            }
            if (url.includes("/api/auth/users")) {
                return jsonResponse([]);
            }
            return jsonResponse({});
        }));
        window.history.pushState({}, "", "/g/lunar-1");
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = "";
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        window.history.pushState({}, "", "/");
    });

    it("submits player count and influence options from the create screen", async () => {
        const user = userEvent.setup();
        const onStartGame = vi.fn();
        const CreateScreen = lunarBaseGameEntry.components.CreateScreen;

        render(<CreateScreen gameName="Lunar Base" onStartGame={onStartGame} />);

        fireEvent.change(screen.getByLabelText("Player count"), { target: { value: "5" } });
        await user.click(screen.getByLabelText("Use Influences"));
        await user.click(screen.getByRole("button", { name: "Start" }));

        expect(onStartGame).toHaveBeenCalledWith({
            publiclyListed: true,
            playerCount: 5,
            useInfluences: true
        });
    });

    it("uses preset zoom steps for buttons and clips typed zoom values on blur", async () => {
        const user = userEvent.setup();
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const zoom = await screen.findByLabelText("Zoom");

        expect(zoom).toHaveValue("100%");

        await user.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(zoom).toHaveValue("110%");

        await user.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(zoom).toHaveValue("100%");

        await user.clear(zoom);
        await user.type(zoom, "21%");
        await user.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(zoom).toHaveValue("20%");

        await user.clear(zoom);
        await user.type(zoom, "599%");
        await user.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(zoom).toHaveValue("600%");

        await user.clear(zoom);
        await user.type(zoom, "abc5000x%");
        expect(zoom).toHaveValue("5000%");

        fireEvent.blur(zoom);
        expect(zoom).toHaveValue("1000%");
    });

    it("does not run layout animations when only the zoom changes", async () => {
        const animate = vi.fn();
        HTMLElement.prototype.animate = animate;
        const user = userEvent.setup();
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await screen.findByText("Solar Lab");

        await user.click(screen.getByRole("button", { name: "Zoom in" }));

        expect(animate).not.toHaveBeenCalled();
    });

    it("keeps the drag image anchored at the clicked point on the card", () => {
        const button = document.createElement("button");
        const card = document.createElement("span");
        const setDragImage = vi.fn();

        card.className = "lunar-card";
        card.getBoundingClientRect = vi.fn(() => ({
            x: 20,
            y: 40,
            left: 20,
            top: 40,
            right: 104,
            bottom: 208,
            width: 84,
            height: 168,
            toJSON: () => ({})
        }));
        button.appendChild(card);
        document.body.appendChild(button);

        const metrics = setScaledDragImage({
            currentTarget: button,
            clientX: 32,
            clientY: 66,
            dataTransfer: { setDragImage }
        } as unknown as DragEvent<HTMLElement>, 1);

        expect(setDragImage).toHaveBeenCalledWith(expect.any(HTMLElement), 12, 26);
        expect(setDragImage.mock.calls[0][0]).toHaveStyle({ opacity: "0" });
        expect(metrics).toEqual({ centerOffsetX: 30, centerOffsetY: 58 });
    });

    it("renders an empty stock pile like the empty discard pile", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const stock = await screen.findByRole("button", { name: "Stock, 0 cards" });
        const stockCard = stock.querySelector(".lunar-card");

        expect(stockCard).toHaveClass("is-empty");
        expect(stockCard).not.toHaveClass("is-back");
    });

    it("renders card colonist and achievement depictions", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        expect(await screen.findByLabelText("2 colonists; achievements 3, 14")).toHaveTextContent("🧑‍🚀🧑‍🚀❸⓮");
    });

    it("renders card costs as colored pips", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const cost = await screen.findByLabelText("Cost: blue, yellow, red, gray, red");
        expect(cost.querySelectorAll(".lunar-card-cost-row")).toHaveLength(2);
        expect(cost.querySelectorAll(".lunar-card-cost-row")[0].querySelectorAll(".lunar-card-cost-pip")).toHaveLength(3);
        expect(cost.querySelectorAll(".lunar-card-cost-row")[1].querySelectorAll(".lunar-card-cost-pip")).toHaveLength(2);
    });

    it("renders action badges and shows catalog-derived action text on hover", async () => {
        servedGame = lunarBaseGame({
            hand: [{
                id: "agent-1",
                type: "agent",
                name: "Field Medic",
                cardCost: ["yellow"],
                onPlayingText: "Draw 1 card\nBuild 1 module"
            }, {
                id: "influence-1",
                type: "influence",
                name: "Lunar Alliance",
                effectText: "Forbid stealing credits"
            }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const badge = await screen.findByLabelText("ON PLAYING");

        expect(badge).toHaveTextContent(/ON\s*PLAYING/);

        fireEvent.mouseEnter(badge, { clientX: 50, clientY: 60 });

        expect(await screen.findByRole("tooltip")).toHaveTextContent("ON PLAYING");
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip).toHaveTextContent("Draw 1 cardBuild 1 module");
        expect(tooltip.querySelectorAll("br")).toHaveLength(1);
        expect(tooltip.querySelectorAll(".lunar-card-action-tooltip-line")).toHaveLength(2);

        fireEvent.mouseLeave(badge);
        const effectBadge = screen.getByLabelText("EFFECT");
        expect(effectBadge).toHaveTextContent("EFFECT");

        fireEvent.mouseEnter(effectBadge, { clientX: 70, clientY: 80 });

        expect(await screen.findByRole("tooltip")).toHaveTextContent("EFFECT");
        expect(screen.getByRole("tooltip")).toHaveTextContent("Forbid stealing credits");
    });

    it("reveals the other side of only the viewer station without sending a command", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);

        vi.useFakeTimers();
        fireEvent.click(screen.getByRole("button", { name: "Reveal other station side" }));

        expect(screen.getByText("The Oasis")).toBeInTheDocument();
        expect(screen.getByLabelText("1 colonist; achievements 12")).toHaveTextContent("🧑‍🚀⓬");
        expect(screen.getByRole("button", { name: "Hide revealed station side" })).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByRole("button", { name: "Hide revealed station side" })).toBeInTheDocument();
        expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.anything()
        );

        fireEvent.click(screen.getByRole("button", { name: "Hide revealed station side" }));
        expect(screen.queryByRole("button", { name: "Hide revealed station side" })).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getAllByText("Terran Outpost")).toHaveLength(2);
    });

    it("reveals the Terran Outpost side when the viewer station is flipped", async () => {
        servedGame = lunarBaseGame({ stationFlipped: true });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await screen.findByText("The Oasis");

        vi.useFakeTimers();
        fireEvent.click(screen.getByRole("button", { name: "Reveal other station side" }));
        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getAllByText("Terran Outpost")).toHaveLength(2);
        expect(screen.queryByLabelText("1 colonist; achievements 12")).not.toBeInTheDocument();
    });

    it("shows the station flip control only on the viewer turn and sends a flip command", async () => {
        const animate = vi.fn();
        HTMLElement.prototype.animate = animate;
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);

        await userEvent.click(screen.getByRole("button", { name: "Flip station" }));

        expect(screen.getByText("The Oasis")).toBeInTheDocument();
        expect(animate).not.toHaveBeenCalled();
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "flipStation", expectedVersion: 1 })
            })
        ));
    });

    it("hides the station flip control when it is not the viewer turn", async () => {
        servedGame = lunarBaseGame({ currentPlayerIndex: 1 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);

        expect(screen.getByRole("button", { name: "Reveal other station side" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Flip station" })).not.toBeInTheDocument();
    });

    it("plays agents instead of discarding them", async () => {
        servedGame = lunarBaseGame({
            hand: [{ id: "agent-1", type: "agent", name: "Field Medic", cardCost: ["yellow"] }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await userEvent.click(await screen.findByText("Field Medic"));

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "playAgent", cardId: "agent-1", expectedVersion: 1 })
            })
        ));
    });

    it("takes a supply card when it is dragged to the viewer hand", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const supplySource = supplyButton as HTMLElement | null;
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        expect(supplyButton).not.toBeNull();
        expect(supplySource).not.toBeNull();
        expect(supplySource).toHaveAttribute("data-lunar-animate", "supply-supply-1");
        expect(hand).not.toBeNull();
        const supplyCard = supplyButton!.querySelector(".lunar-card");
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        await waitFor(() => expect(supplySource).toHaveClass("is-dragging-source"));
        fireDrop(hand!, { clientX: 300, clientY: 390, dataTransfer });
        const flyingCard = await screen.findByLabelText("drop supply card to hand");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "330px",
            "--lunar-fly-from-y": "448px"
        });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "takeSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("shows a snap rectangle when a supply card can be dropped into the viewer hand", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(hand!, { clientX: 300, clientY: 390, dataTransfer });

        const preview = document.querySelector<HTMLElement>(".lunar-drag-preview");
        expect(preview).not.toBeNull();
        expect(preview).toHaveTextContent("Supply Rover");
        expect(preview).toHaveStyle({
            "--lunar-drag-preview-x": "330px",
            "--lunar-drag-preview-y": "448px"
        });
        expectDropSnap(new DOMRect(280, 360, 84, 168));
        fireDragEnd(supplyButton!, { clientX: 300, clientY: 390, dataTransfer });
    });

    it("keeps the table scroll position when dropping a top-row supply card", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        let scrollLeft = 18;
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollLeft: {
                get: () => scrollLeft,
                set: (value: number) => {
                    scrollLeft = value;
                },
                configurable: true
            },
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            }
        });
        vi.useFakeTimers();

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(hand!, { clientX: 300, clientY: 390, dataTransfer });
        fireDrop(hand!, { clientX: 300, clientY: 390, dataTransfer });
        scrollTop = 0;
        fireEvent.scroll(scroll!);

        expect(scrollLeft).toBe(18);
        expect(scrollTop).toBe(96);

        act(() => {
            vi.advanceTimersByTime(300);
        });
        scrollTop = 0;
        fireEvent.scroll(scroll!);

        expect(scrollTop).toBe(0);
    });

    it("keeps the table scroll position when drag start reveals a partially clipped source card", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, -36, 84, 168);
        scroll!.getBoundingClientRect = () => new DOMRect(0, 0, 900, 700);
        let scrollLeft = 24;
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollLeft: {
                get: () => scrollLeft,
                set: (value: number) => {
                    scrollLeft = value;
                },
                configurable: true
            },
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            },
            scrollWidth: { value: 1200, configurable: true },
            scrollHeight: { value: 900, configurable: true },
            clientWidth: { value: 900, configurable: true },
            clientHeight: { value: 700, configurable: true }
        });
        dataTransfer.setDragImage.mockImplementation(() => {
            scrollTop = 0;
        });

        fireDragStart(supplyButton!, { clientX: 112, clientY: 18, dataTransfer });

        expect(scrollLeft).toBe(24);
        expect(scrollTop).toBe(96);
        fireDragEnd(supplyButton!, { clientX: 112, clientY: 18, dataTransfer });
    });

    it("keeps the table scroll position when pressing a partially clipped draggable card", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        let scrollLeft = 24;
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollLeft: {
                get: () => scrollLeft,
                set: (value: number) => {
                    scrollLeft = value;
                },
                configurable: true
            },
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            }
        });
        vi.useFakeTimers();

        fireEvent.pointerDown(supplyButton!, { clientX: 112, clientY: 18 });
        scrollTop = 0;
        act(() => {
            vi.runOnlyPendingTimers();
        });

        expect(scrollLeft).toBe(24);
        expect(scrollTop).toBe(96);
    });

    it("keeps restoring a clipped card press if the browser scrolls after the initial press", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        let scrollLeft = 24;
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollLeft: {
                get: () => scrollLeft,
                set: (value: number) => {
                    scrollLeft = value;
                },
                configurable: true
            },
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            }
        });
        vi.useFakeTimers();

        fireEvent.pointerDown(supplyButton!, { clientX: 112, clientY: 18 });
        act(() => {
            vi.runOnlyPendingTimers();
        });

        scrollTop = 0;
        fireEvent.scroll(scroll!);

        expect(scrollLeft).toBe(24);
        expect(scrollTop).toBe(96);

        fireEvent.pointerUp(window);
        scrollTop = 0;
        fireEvent.scroll(scroll!);

        expect(scrollTop).toBe(0);
    });

    it("keeps native drag available while restoring focus scroll from a clipped draggable card", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        let scrollLeft = 24;
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollLeft: {
                get: () => scrollLeft,
                set: (value: number) => {
                    scrollLeft = value;
                },
                configurable: true
            },
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            }
        });
        vi.useFakeTimers();

        const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
        fireEvent(supplyButton!, event);
        expect(event.defaultPrevented).toBe(false);

        scrollTop = 0;
        fireEvent.focus(supplyButton!);
        act(() => {
            vi.runOnlyPendingTimers();
        });

        expect(scrollLeft).toBe(24);
        expect(scrollTop).toBe(96);
    });

    it("restores the table scroll when clicking a card whose center is outside the viewport", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, -96, 84, 168);
        let scrollLeft = 24;
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollLeft: {
                get: () => scrollLeft,
                set: (value: number) => {
                    scrollLeft = value;
                },
                configurable: true
            },
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            }
        });
        vi.useFakeTimers();

        fireEvent.pointerDown(supplyButton!, { clientX: 112, clientY: 4 });
        scrollTop = 0;
        fireEvent.click(supplyButton!, { clientX: 112, clientY: 4 });
        act(() => {
            vi.runOnlyPendingTimers();
        });

        expect(scrollLeft).toBe(24);
        expect(scrollTop).toBe(96);
    });

    it("does not make the discard pile mouse click focus-scroll the table", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const discard = await screen.findByRole("button", { name: "Empty discard pile" });
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        expect(scroll).not.toBeNull();
        expect(discard).toHaveAttribute("tabindex", "-1");
        let scrollTop = 96;
        Object.defineProperties(scroll!, {
            scrollTop: {
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value;
                },
                configurable: true
            }
        });
        vi.useFakeTimers();

        fireEvent.pointerDown(discard, { clientX: 112, clientY: 4 });
        scrollTop = 0;
        fireEvent.click(discard, { clientX: 112, clientY: 4 });
        act(() => {
            vi.runOnlyPendingTimers();
        });

        expect(scrollTop).toBe(96);
    });

    it("scales the dragged card preview with the table zoom", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        await userEvent.click(await screen.findByRole("button", { name: "Zoom in" }));
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        scroll!.getBoundingClientRect = () => new DOMRect(0, 0, 900, 700);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 300, clientY: 390, dataTransfer });

        expect(document.querySelector<HTMLElement>(".lunar-drag-preview")).toHaveStyle({
            "--lunar-card-half-width": "46.2px",
            "--lunar-card-half-height": "92.4px",
            "--lunar-card-scale": "1.1"
        });
        fireDragEnd(supplyButton!, { clientX: 300, clientY: 390, dataTransfer });
    });

    it("drops a supply card on the hand destination while showing the destination snap rectangle", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(hand!, { clientX: 320, clientY: 342, dataTransfer });

        expectDropSnap(new DOMRect(280, 360, 84, 168));
        fireDrop(hand!, { clientX: 320, clientY: 342, dataTransfer });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "takeSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("does not stretch the hand target past the destination snap rectangle", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 520, 178);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(hand!, { clientX: 410, clientY: 342, dataTransfer });

        expect(document.querySelector(".lunar-drop-snap")).toBeNull();
        fireDrop(hand!, { clientX: 410, clientY: 342, dataTransfer });

        expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "takeSupply", slotIndex: 0, expectedVersion: 1 })
            })
        );
    });

    it("keeps the hand snap rectangle inside the table scroll port near the viewport edge", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const lastHandButton = (await screen.findByText("Solar Lab")).closest("[role=button]");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(lastHandButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        lastHandButton!.getBoundingClientRect = () => new DOMRect(820, 360, 84, 168);
        hand!.getBoundingClientRect = () => new DOMRect(760, 340, 300, 210);
        scroll!.getBoundingClientRect = () => new DOMRect(100, 50, 900, 700);
        Object.defineProperties(scroll!, {
            scrollLeft: { value: 20, configurable: true },
            scrollTop: { value: 30, configurable: true },
            clientWidth: { value: 880, configurable: true },
            clientHeight: { value: 680, configurable: true }
        });

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 924, clientY: 386, dataTransfer });

        const snap = document.querySelector<HTMLElement>(".lunar-drop-snap");
        expect(snap).not.toBeNull();
        expect(scroll!.contains(snap)).toBe(true);
        expect(snap).toHaveStyle({
            left: "832px",
            top: "340px",
            width: "84px",
            height: "168px"
        });
        fireDragEnd(supplyButton!, { clientX: 924, clientY: 386, dataTransfer });
    });

    it("opens supply click choices and sends the selected destination", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await userEvent.click(await screen.findByText("Supply Rover"));

        const dialog = await screen.findByRole("dialog", { name: "Supply card destination" });
        expect(dialog).toHaveTextContent("Supply Rover");

        await userEvent.click(screen.getByRole("button", { name: "Discard" }));

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "discardSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("takes a clicked supply card to hand when that choice is selected", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await userEvent.click(await screen.findByRole("button", { name: "Zoom in" }));
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const handButton = (await screen.findByText("Solar Lab")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        expect(supplyButton).not.toBeNull();
        expect(handButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        supplyButton!.getBoundingClientRect = () => new DOMRect(300, 150, 84, 168);
        handButton!.getBoundingClientRect = () => new DOMRect(640, 360, 84, 168);
        scroll!.getBoundingClientRect = () => new DOMRect(100, 50, 900, 700);
        Object.defineProperties(scroll!, {
            scrollLeft: { value: 20, configurable: true },
            scrollTop: { value: 30, configurable: true }
        });

        await userEvent.click(supplyButton!);
        await userEvent.click(await screen.findByRole("button", { name: "Hand" }));

        const flyingCard = await screen.findByLabelText("click supply card to hand");
        expect(scroll!.contains(flyingCard)).toBe(true);
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "262px",
            "--lunar-fly-from-y": "214px",
            "--lunar-fly-to-x": "694px",
            "--lunar-fly-to-y": "424px",
            "--lunar-card-half-width": "46.2px",
            "--lunar-card-half-height": "92.4px",
            "--lunar-card-scale": "1.1"
        });
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "takeSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("discards a supply card when it is dragged to the discard pile", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const supplySource = supplyButton as HTMLElement | null;
        const discard = screen.getByRole("button", { name: "Empty discard pile" });
        const supplyCard = supplyButton!.querySelector(".lunar-card");
        expect(supplySource).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        discard.getBoundingClientRect = () => new DOMRect(420, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDrop(discard, { clientX: 440, clientY: 160, dataTransfer });

        await waitFor(() => expect(supplySource).toHaveClass("is-animation-destination-hidden"));
        expect(await screen.findByLabelText("drop supply card to discard")).toBeInTheDocument();
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "discardSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("shows a snap rectangle when a supply card can be dropped on the discard pile", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const discard = screen.getByRole("button", { name: "Empty discard pile" });
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        discard.getBoundingClientRect = () => new DOMRect(420, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(discard, { clientX: 440, clientY: 160, dataTransfer });

        expectDropSnap(new DOMRect(420, 120, 84, 168));
        fireDragEnd(supplyButton!, { clientX: 440, clientY: 160, dataTransfer });
    });

    it("does not snap to discard unless the dragged card center is inside the discard pile", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const discard = screen.getByRole("button", { name: "Empty discard pile" });
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        discard.getBoundingClientRect = () => new DOMRect(420, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 180, clientY: 270, dataTransfer });
        fireDragOver(discard, { clientX: 430, clientY: 130, dataTransfer });

        expect(document.querySelector(".lunar-drop-snap")).toBeNull();
        fireDrop(discard, { clientX: 430, clientY: 130, dataTransfer });

        expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "discardSupply", slotIndex: 0, expectedVersion: 1 })
            })
        );
    });

    it("snaps to discard when the dragged card center is inside even if the pointer is outside", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const discard = screen.getByRole("button", { name: "Empty discard pile" });
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        discard.getBoundingClientRect = () => new DOMRect(420, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 420, clientY: 102, dataTransfer });

        expectDropSnap(new DOMRect(420, 120, 84, 168));
        fireDrop(scroll!, { clientX: 420, clientY: 102, dataTransfer });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "discardSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("drops a supply card into a crowded hand destination beyond the board surface", async () => {
        servedGame = lunarBaseGame({
            hand: [
                { id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue"], connectors: { topRight: "gray", bottomRight: "gray" } },
                { id: "module-2", type: "module", name: "Hydroponics", color: "yellow", cardCost: ["yellow"], connectors: { topRight: "gray", bottomRight: "gray" } }
            ],
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const lastHandButton = (await screen.findByText("Hydroponics")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(lastHandButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(surface).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        lastHandButton!.getBoundingClientRect = () => new DOMRect(700, 360, 84, 168);
        surface!.getBoundingClientRect = () => new DOMRect(28, 28, 360, 600);
        scroll!.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 700);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 804, clientY: 386, dataTransfer });

        expectDropSnap(new DOMRect(792, 360, 84, 168));
        fireDrop(scroll!, { clientX: 804, clientY: 386, dataTransfer });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "takeSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("returns an invalid supply drag to the supply source rect", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        const supplySource = supplyButton as HTMLElement | null;
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(surface).not.toBeNull();
        expect(supplySource).not.toBeNull();
        expect(supplySource).toHaveAttribute("data-lunar-animate", "supply-supply-1");
        expect(supplyCard).not.toBeNull();
        supplySource!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(surface!, { clientX: 210, clientY: 220, dataTransfer });
        fireDrop(surface!, { clientX: 0, clientY: 0, dataTransfer });

        const flyingCard = await screen.findByLabelText("return supply card to supply");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "240px",
            "--lunar-fly-from-y": "278px",
            "--lunar-fly-to-x": "142px",
            "--lunar-fly-to-y": "204px"
        });
    });

    it("continues dragging over empty table space beyond the content surface", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(surface).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        surface!.getBoundingClientRect = () => new DOMRect(28, 28, 360, 600);
        scroll!.getBoundingClientRect = () => new DOMRect(0, 0, 900, 700);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 760, clientY: 220, dataTransfer });

        const preview = document.querySelector<HTMLElement>(".lunar-drag-preview");
        expect(preview).not.toBeNull();
        expect(preview).toHaveStyle({
            "--lunar-drag-preview-x": "790px",
            "--lunar-drag-preview-y": "278px"
        });
        fireDragEnd(supplyButton!, { clientX: 760, clientY: 220, dataTransfer });
    });

    it("keeps the drag preview in the table scroll port at the scrollbar gutter", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        scroll!.getBoundingClientRect = () => new DOMRect(0, 0, 900, 700);
        Object.defineProperties(scroll!, {
            clientWidth: { value: 880, configurable: true },
            clientHeight: { value: 680, configurable: true }
        });

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 760, clientY: 220, dataTransfer });
        expect(document.querySelector(".lunar-drag-preview")).not.toBeNull();

        fireDragOver(scroll!, { clientX: 895, clientY: 220, dataTransfer });

        const preview = document.querySelector<HTMLElement>(".lunar-drag-preview");
        expect(preview).not.toBeNull();
        expect(scroll!.contains(preview)).toBe(true);
        expect(preview).toHaveStyle({
            "--lunar-drag-preview-x": "925px",
            "--lunar-drag-preview-y": "278px"
        });
        fireDragEnd(supplyButton!, { clientX: 895, clientY: 220, dataTransfer });
    });

    it("only starts one return animation when an invalid drop is followed by drag end", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(surface).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        supplyButton!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(surface!, { clientX: 210, clientY: 220, dataTransfer });
        fireDrop(surface!, { clientX: 0, clientY: 0, dataTransfer });
        fireDragEnd(supplyButton!, { clientX: 0, clientY: 0, dataTransfer });

        expect(await screen.findByLabelText("return supply card to supply")).toBeInTheDocument();
        expect(screen.getAllByLabelText("return supply card to supply")).toHaveLength(1);
    });

    it("keeps a card back in the stock source when dragging with several stock cards left", async () => {
        servedGame = lunarBaseGame({ stockCount: 3 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 3 cards" });
        const stockCard = stockButton.querySelector(".lunar-card");
        expect(stockCard).toHaveClass("is-back");
        expect(stockCard).not.toHaveClass("is-empty");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        expect(hand).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        stockCard!.getBoundingClientRect = () => new DOMRect(80, 90, 84, 168);

        fireDragStart(stockButton, { clientX: 98, clientY: 124, dataTransfer });

        await waitFor(() => expect(stockCard).toHaveClass("is-back"));
        expect(stockCard).not.toHaveClass("is-empty");
        fireDrop(hand!, { clientX: 300, clientY: 390, dataTransfer });
        const flyingCard = await screen.findByLabelText("drop stock card to hand");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "324px",
            "--lunar-fly-from-y": "440px"
        });
    });

    it("shows a snap rectangle when a stock card can be dropped into the viewer hand", async () => {
        servedGame = lunarBaseGame({ stockCount: 3 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 3 cards" });
        const stockCard = stockButton.querySelector<HTMLElement>(".lunar-card");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        expect(stockCard).not.toBeNull();
        expect(hand).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        stockCard!.getBoundingClientRect = () => new DOMRect(80, 90, 84, 168);

        fireDragStart(stockButton, { clientX: 98, clientY: 124, dataTransfer });
        fireDragOver(hand!, { clientX: 300, clientY: 390, dataTransfer });

        expectDropSnap(new DOMRect(280, 360, 84, 168));
        fireDragEnd(stockButton, { clientX: 300, clientY: 390, dataTransfer });
    });

    it("returns an invalid stock drag to the stock source rect", async () => {
        servedGame = lunarBaseGame({ stockCount: 3 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 3 cards" });
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        const stockSource = stockButton;
        const stockCard = stockButton.querySelector<HTMLElement>(".lunar-card");
        expect(surface).not.toBeNull();
        expect(stockSource).not.toBeNull();
        expect(stockSource).toHaveAttribute("data-lunar-animate", "stock");
        expect(stockCard).not.toBeNull();
        stockSource!.getBoundingClientRect = () => new DOMRect(80, 90, 84, 168);
        stockCard!.getBoundingClientRect = () => new DOMRect(80, 90, 84, 168);

        fireDragStart(stockButton, { clientX: 98, clientY: 124, dataTransfer });
        fireDrop(surface!, { clientX: 240, clientY: 260, dataTransfer });

        const flyingCard = await screen.findByLabelText("return stock card to stock");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "264px",
            "--lunar-fly-from-y": "310px",
            "--lunar-fly-to-x": "122px",
            "--lunar-fly-to-y": "174px"
        });
    });

    it("shows empty stock when dragging the last stock card", async () => {
        servedGame = lunarBaseGame({ stockCount: 1 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 1 cards" });
        const stockCard = stockButton.querySelector(".lunar-card");
        expect(stockCard).toHaveClass("is-back");
        expect(stockCard).not.toHaveClass("is-empty");

        fireEvent.dragStart(stockButton, { dataTransfer });

        await waitFor(() => expect(stockCard).toHaveClass("is-empty"));
        expect(stockCard).not.toHaveClass("is-back");
    });

    it("returns an invalid hand drag to the hand card rect", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const cardButton = (await screen.findByText("Solar Lab")).closest("[role=button]");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        expect(cardButton).not.toBeNull();
        expect(surface).not.toBeNull();
        const cardElement = cardButton!.querySelector(".lunar-card");
        expect(cardElement).not.toBeNull();
        cardButton!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);
        cardElement!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);

        fireDragStart(cardButton!, { clientX: 54, clientY: 430, dataTransfer });
        fireDragOver(surface!, { clientX: 300, clientY: 220, dataTransfer });
        fireDragEnd(cardButton!, { clientX: 0, clientY: 0, dataTransfer });

        const flyingCard = await screen.findByLabelText("return hand card to hand");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "318px",
            "--lunar-fly-from-y": "274px",
            "--lunar-fly-to-x": "72px",
            "--lunar-fly-to-y": "484px"
        });
        expect(cardButton).toHaveClass("is-animation-destination-hidden");
    });

    it("shows a snap rectangle when a hand card can be dropped on the discard pile", async () => {
        servedGame = lunarBaseGame({
            hand: [{ id: "influence-1", type: "influence", name: "Supply Pact" }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const cardButton = (await screen.findByText("Supply Pact")).closest("[role=button]");
        const discard = screen.getByRole("button", { name: "Empty discard pile" });
        const cardElement = cardButton?.querySelector<HTMLElement>(".lunar-card");
        expect(cardButton).not.toBeNull();
        expect(cardElement).not.toBeNull();
        discard.getBoundingClientRect = () => new DOMRect(420, 120, 84, 168);
        cardElement!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);

        fireDragStart(cardButton!, { clientX: 54, clientY: 430, dataTransfer });
        fireDragOver(discard, { clientX: 452, clientY: 164, dataTransfer });

        expectDropSnap(new DOMRect(420, 120, 84, 168));
        fireDragEnd(cardButton!, { clientX: 452, clientY: 164, dataTransfer });
    });

    it("dims and disables an unaffordable hand module on the current player's turn", async () => {
        servedGame = lunarBaseGame({
            credits: 0,
            hand: [{ id: "module-expensive", type: "module", name: "Costly Lab", color: "blue", cardCost: ["blue", "yellow"], connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Costly Lab");
        const cardButton = card.closest("[role=button]");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toHaveAttribute("aria-disabled", "true");
        expect(cardButton).toHaveClass("is-unplayable");

        fireEvent.click(cardButton!);
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(board).not.toBeNull();

        fireEvent.mouseMove(board!, { clientX: 10, clientY: 94 });

        expect(document.querySelector(".lunar-board-hover")).toBeNull();
    });

    it("dims and disables an affordable hand module with no legal board placement", async () => {
        servedGame = lunarBaseGame({
            credits: 5,
            hand: [{ id: "module-blocked", type: "module", name: "Blocked Lab", color: "blue", connectors: { top: "red" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const cardButton = (await screen.findByText("Blocked Lab")).closest("[role=button]");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toHaveAttribute("aria-disabled", "true");
        expect(cardButton).toHaveClass("is-unplayable");
    });

    it("does not dim the viewer's hand when it is another player's turn", async () => {
        servedGame = lunarBaseGame({ currentPlayerIndex: 1 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const cardButton = (await screen.findByText("Solar Lab")).closest("[role=button]");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toHaveAttribute("aria-disabled", "true");
        expect(cardButton).not.toHaveClass("is-unplayable");
    });

    it("orders player boards and panels with the viewer first instead of the current turn first", async () => {
        servedGame = lunarBaseGame({ currentPlayerIndex: 0, viewerSeat: 1, hand: [] });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        await waitFor(() => {
            const boardNames = Array.from(document.querySelectorAll(".lunar-player-area h2")).map((heading) => heading.textContent);
            const panelNames = Array.from(document.querySelectorAll(".lunar-player-panel strong")).map((name) => name.textContent);

            expect(boardNames).toEqual(["Ben", "Ada"]);
            expect(panelNames).toEqual(["Ben", "Ada"]);
        });
    });

    it("animates a newly played module with the shifted board", async () => {
        const animate = vi.fn();
        HTMLElement.prototype.animate = animate;
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        vi.useFakeTimers();
        vi.useFakeTimers();
        fireEvent.click(card);
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(board).not.toBeNull();

        fireEvent.click(board!, { clientX: 10, clientY: 94 });
        await act(async () => {});
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(animate).toHaveBeenCalledWith(
            [
                { transform: expect.stringMatching(/^translate\((?!0px, 0px\))/) },
                { transform: "translate(0, 0)" }
            ],
            { duration: 500, easing: "ease" }
        );
    });

    it("keeps a played hand module hidden while the play animation is pending", async () => {
        let resolveCommand: (response: Response) => void = () => {};
        const commandResponse = new Promise<Response>((resolve) => {
            resolveCommand = resolve;
        });
        let commandCalls = 0;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
                commandCalls += 1;
                return commandResponse;
            }
            if (url.includes("/view")) {
                return jsonResponse(servedGame);
            }
            if (url.includes("/api/auth/session")) {
                return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            }
            if (url.includes("/api/auth/users")) {
                return jsonResponse([]);
            }
            return jsonResponse({});
        }));
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const cardText = await screen.findByText("Solar Lab");
        const cardButton = cardText.closest("[role=button]");
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(cardButton).not.toBeNull();
        expect(board).not.toBeNull();

        await act(async () => {
            fireEvent.click(cardText);
        });
        await waitFor(() => expect(cardButton).toHaveClass("is-selected"));
        await act(async () => {
            fireEvent.click(board!, { clientX: 10, clientY: 94 });
        });
        expect(commandCalls).toBe(1);

        await waitFor(() => expect(cardButton).toHaveClass("is-animation-destination-hidden"));

        await act(async () => {
            servedGame = lunarBaseGameWithPlayedModule();
            resolveCommand(jsonResponse({}));
        });
    });

    it("keeps a dragged hand module hidden until the updated board removes the source", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();
        servedGame = lunarBaseGame();
        const viewerStation = ((servedGame.players as Array<Record<string, unknown>>)[0].board as Array<Record<string, unknown>>)[0].card as Record<string, unknown>;
        viewerStation.connectors = { top: "gray", bottom: "gray" };

        render(<PlayScreen />);
        const cardText = await screen.findByText("Solar Lab");
        const cardButton = cardText.closest("[role=button]");
        const cardElement = cardButton?.querySelector<HTMLElement>(".lunar-card");
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(cardButton).not.toBeNull();
        expect(cardElement).not.toBeNull();
        expect(board).not.toBeNull();
        cardElement!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);
        board!.getBoundingClientRect = () => new DOMRect(0, 0, 336, 336);

        fireEvent.click(cardText);
        fireEvent.click(cardText);
        fireEvent.click(cardText);
        fireEvent.click(cardText);
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "270deg" });

        fireDragStart(cardButton!, { clientX: 54, clientY: 430, dataTransfer });
        fireDrop(board!, { clientX: 66, clientY: 240, dataTransfer });

        await waitFor(() => expect(cardButton).toHaveClass("is-animation-destination-hidden"));
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "270deg" });
        await waitFor(() => expect(document.querySelector('[data-lunar-animate="hand-0-module-1"]')).toBeNull());
    });

    it("snaps a horizontal module from table-surface drag events near the viewer board", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();
        servedGame = lunarBaseGame();
        const viewerStation = ((servedGame.players as Array<Record<string, unknown>>)[0].board as Array<Record<string, unknown>>)[0].card as Record<string, unknown>;
        viewerStation.connectors = { top: "gray" };

        render(<PlayScreen />);
        const cardText = await screen.findByText("Solar Lab");
        const cardButton = cardText.closest("[role=button]");
        const cardElement = cardButton?.querySelector<HTMLElement>(".lunar-card");
        const board = document.querySelector<HTMLElement>(".lunar-board");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        expect(cardButton).not.toBeNull();
        expect(cardElement).not.toBeNull();
        expect(board).not.toBeNull();
        expect(surface).not.toBeNull();
        cardElement!.getBoundingClientRect = () => new DOMRect(30, 400, 168, 84);
        board!.getBoundingClientRect = () => new DOMRect(0, 0, 336, 336);

        fireEvent.click(cardText);
        fireEvent.click(cardText);
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "90deg" });

        fireDragStart(cardButton!, { clientX: 114, clientY: 442, dataTransfer });
        fireDragOver(surface!, { clientX: 84, clientY: 42, dataTransfer });

        expect(document.querySelector(".lunar-board-hover.horizontal")).toBeInTheDocument();
        expect(document.querySelector<HTMLElement>(".lunar-drag-preview")).toHaveStyle({
            "--lunar-drag-preview-x": "84px",
            "--lunar-drag-preview-y": "42px"
        });

        fireDrop(surface!, { clientX: 84, clientY: 42, dataTransfer });

        expect(document.querySelector(".lunar-board-hover")).toBeNull();
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "playModule", cardId: "module-1", x: -1, y: -1, rotation: 90, expectedVersion: 1 })
            })
        ));
    });

    it("normalizes a selected module back to negative ninety rotation after passing 270 degrees", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        vi.useFakeTimers();

        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);

        const cardElement = card.closest(".lunar-card");
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "270deg" });

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "-90deg" });
    });

    it("keeps rapid rotations smooth and snaps back instantly on deselect", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const animationFrames: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        }));

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");

        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);

        const cardElement = card.closest(".lunar-card");
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "450deg" });

        fireEvent.click(document.querySelector<HTMLElement>(".lunar-table-surface")!);

        expect(cardElement).toHaveClass("is-rotation-instant");
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "90deg" });

        act(() => {
            while (animationFrames.length > 0) {
                animationFrames.shift()?.(0);
            }
        });

        expect(cardElement).not.toHaveClass("is-rotation-instant");
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "0deg" });
    });

    it("deselects a selected card when the board click does not hit a snap rectangle", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(board).not.toBeNull();
        board!.getBoundingClientRect = () => new DOMRect(0, 0, 336, 336);

        fireEvent.click(card);
        expect(card.closest("[role=button]")).toHaveClass("is-selected");

        fireEvent.click(board!, { clientX: 300, clientY: 300 });

        expect(card.closest("[role=button]")).not.toHaveClass("is-selected");
    });

    it("removes the manual end game button", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await screen.findByText("Solar Lab");

        expect(screen.queryByRole("button", { name: "End Game" })).not.toBeInTheDocument();
    });

    it("shows game over details, reveal all hands, and disables finished card actions", async () => {
        servedGame = lunarBaseGame({
            lifecycle: "finished",
            hand: [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", connectors: { topRight: "gray", bottomRight: "gray" } }],
            revealedHands: [
                [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", connectors: { topRight: "gray", bottomRight: "gray" } }],
                [{ id: "ben-card", type: "module", name: "Ben Habitat", color: "blue", connectors: { topRight: "gray", bottomRight: "gray" } }]
            ],
            endGameResult: {
                label: "Epic Victory",
                winningPlayerIndexes: [0],
                playerConditions: [{ playerIndex: 0, conditions: ["20/20 lunar credits", "10/10 colonists housed"] }]
            }
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const dialog = await screen.findByRole("dialog", { name: "Lunar Base game over" });
        expect(dialog).toHaveTextContent("Epic Victory for Ada!");
        expect(dialog).toHaveTextContent("20/20 lunar credits");
        expect(dialog).toHaveTextContent("10/10 colonists housed");
        expect(screen.getByText("(Epic Victory)")).toBeInTheDocument();
        expect(screen.queryByText("(Current player)")).not.toBeInTheDocument();
        expect(screen.getByText("Ben Habitat")).toBeInTheDocument();
        expect(screen.getAllByText("Influences in hand: 0/4")).toHaveLength(2);
        expect(screen.getByText("Solar Lab").closest("[role=button]")).toHaveAttribute("aria-disabled", "true");
        expect(screen.getAllByRole("button", { name: "Reveal other station side" })).toHaveLength(2);
        expect(screen.queryByRole("button", { name: "Flip station" })).not.toBeInTheDocument();
    });

    it("shows regular victory game over text", async () => {
        servedGame = lunarBaseGame({
            lifecycle: "finished",
            endGameResult: {
                label: "Victory",
                winningPlayerIndexes: [0],
                playerConditions: [{ playerIndex: 0, conditions: ["10/10 colonists housed"] }]
            }
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const dialog = await screen.findByRole("dialog", { name: "Lunar Base game over" });
        expect(dialog).toHaveTextContent("Victory for Ada");
        expect(dialog).toHaveTextContent("10/10 colonists housed");
    });

    it("shows draw game over text grouped by drawing player", async () => {
        servedGame = lunarBaseGame({
            lifecycle: "finished",
            endGameResult: {
                label: "Draw",
                winningPlayerIndexes: [0, 1],
                playerConditions: [
                    { playerIndex: 0, conditions: ["10/10 colonists housed"] },
                    { playerIndex: 1, conditions: ["5/5 scientific achievements"] }
                ]
            }
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const dialog = await screen.findByRole("dialog", { name: "Lunar Base game over" });
        expect(dialog).toHaveTextContent("Draw between Ada and Ben");
        expect(dialog).toHaveTextContent("Ada:10/10 colonists housed");
        expect(dialog).toHaveTextContent("Ben:5/5 scientific achievements");
    });

    it("arms drag auto-scroll only after leaving an edge where the drag started", () => {
        const box = {
            left: 0,
            right: 300,
            top: 0,
            bottom: 300,
            scrollLeft: 100,
            scrollTop: 0,
            scrollWidth: 900,
            scrollHeight: 300,
            clientWidth: 300,
            clientHeight: 300
        };
        const state = createDragAutoScrollState(box, 20, 150, 84);

        expect(dragAutoScrollDelta(state, box, 20, 150, 84)).toEqual({ dx: 0, dy: 0 });
        expect(dragAutoScrollDelta(state, box, 120, 150, 84)).toEqual({ dx: 0, dy: 0 });
        expect(dragAutoScrollDelta(state, box, 20, 150, 84)).toEqual({ dx: -8, dy: 0 });
    });
});

const jsonResponse = (body: unknown): Response => ({
    ok: true,
    json: async () => body
}) as Response;

const dragDataTransfer = () => {
    const values = new Map<string, string>();
    return {
        effectAllowed: "all",
        setData: vi.fn((key: string, value: string) => {
            values.set(key, value);
        }),
        getData: vi.fn((key: string) => values.get(key) ?? ""),
        setDragImage: vi.fn()
    };
};

const fireDragStart = (
    element: Element,
    { clientX, clientY, dataTransfer }: { clientX: number; clientY: number; dataTransfer: ReturnType<typeof dragDataTransfer> }
) => {
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        dataTransfer: { value: dataTransfer }
    });
    fireEvent(element, event);
};

const fireDragOver = (
    element: Element,
    { clientX, clientY, dataTransfer }: { clientX: number; clientY: number; dataTransfer: ReturnType<typeof dragDataTransfer> }
) => {
    const event = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        dataTransfer: { value: dataTransfer }
    });
    fireEvent(element, event);
};

const fireDrop = (
    element: Element,
    { clientX, clientY, dataTransfer }: { clientX: number; clientY: number; dataTransfer: ReturnType<typeof dragDataTransfer> }
) => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        dataTransfer: { value: dataTransfer }
    });
    fireEvent(element, event);
};

const fireDragEnd = (
    element: Element,
    { clientX, clientY, dataTransfer }: { clientX: number; clientY: number; dataTransfer: ReturnType<typeof dragDataTransfer> }
) => {
    const event = new Event("dragend", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        dataTransfer: { value: dataTransfer }
    });
    fireEvent(element, event);
};

const expectDropSnap = (rect: DOMRect) => {
    const snap = document.querySelector<HTMLElement>(".lunar-drop-snap");
    expect(snap).not.toBeNull();
    expect(snap).toHaveStyle({
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
    });
};

const lunarBaseGame = ({
    credits = 5,
    hand = [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue", "yellow", "red", "gray", "red"], connectors: { topRight: "gray", bottomRight: "gray" }, colonists: 2, achievements: [3, 14] }],
    supply = [],
    stockCount = 0,
    currentPlayerIndex = 0,
    viewerSeat = 0,
    stationFlipped = false,
    lifecycle = "active",
    endGameResult = null,
    revealedHands
}: { credits?: number; hand?: Array<Record<string, unknown>>; supply?: Array<Record<string, unknown> | null>; stockCount?: number; currentPlayerIndex?: number; viewerSeat?: number; stationFlipped?: boolean; lifecycle?: string; endGameResult?: Record<string, unknown> | null; revealedHands?: Array<Array<Record<string, unknown>>> } = {}) => ({
    id: "lunar-1",
    gameSlug: "lunar-base",
    version: 1,
    lifecycle,
    config: { playerCount: 2, useInfluences: false },
    seats: [
        { userId: "player-1", displayName: "Ada" },
        { userId: "player-2", displayName: "Ben" }
    ],
    currentPlayerIndex,
    players: [
        {
            orbs: { red: 0, blue: 0, yellow: 0, gray: 0 },
            credits,
            colonists: 0,
            achievements: 0,
            handCount: 1,
            influenceHandCount: 0,
            board: [{
                card: {
                    id: "station-1",
                    type: "station",
                    name: stationFlipped ? "The Oasis" : "Terran Outpost",
                    connectors: { topLeft: "gray", bottomLeft: "gray" },
                    orbs: stationFlipped ? ["blue", "red"] : [],
                    colonists: stationFlipped ? 1 : 0,
                    achievements: stationFlipped ? [12] : [],
                    flipped: stationFlipped,
                    stationFrontName: "Terran Outpost",
                    stationFrontMainActionText: "Choose one:\nBuild 1 module\nDraw 1 card",
                    stationBackName: "The Oasis",
                    stationBackOrbs: ["blue", "red"],
                    stationBackColonists: 1,
                    stationBackAchievements: [12],
                    stationBackMainActionText: "Draft 2 cards",
                    mainActionText: stationFlipped ? "Draft 2 cards" : "Choose one:\nBuild 1 module\nDraw 1 card"
                },
                x: 0,
                y: 0,
                rotation: 0
            }]
        },
        {
            orbs: { red: 0, blue: 0, yellow: 0, gray: 0 },
            credits: 0,
            colonists: 0,
            achievements: 0,
            handCount: 0,
            influenceHandCount: 0,
            board: [{
                card: { id: "station-2", type: "station", name: "Terran Outpost", connectors: { topLeft: "gray", bottomLeft: "gray" }, stationBackName: "The Crater", stationBackOrbs: ["yellow", "gray"] },
                x: 0,
                y: 0,
                rotation: 0
            }]
        }
    ],
    supply,
    stockCount,
    discardTop: null,
    discardCount: 0,
    endGameResult,
    message: null,
    viewer: {
        userId: `player-${viewerSeat + 1}`,
        seatIndex: viewerSeat,
        hand,
        revealedHands
    }
});

const lunarBaseGameWithPlayedModule = () => {
    const game = lunarBaseGame();
    return {
        ...game,
        version: 2,
        players: game.players.map((player, index) => index === 0 ? {
            ...player,
            handCount: 0,
            board: [
                ...player.board,
                {
                    card: { id: "module-1", type: "module" as const, name: "Solar Lab", color: "blue" as const, cardCost: ["blue" as const, "yellow" as const, "red" as const, "gray" as const, "red" as const], connectors: { topRight: "gray" as const, bottomRight: "gray" as const }, colonists: 2, achievements: [3, 14] },
                    x: -1,
                    y: 0,
                    rotation: 0 as const
                }
            ]
        } : player),
        viewer: {
            userId: "player-1",
            seatIndex: 0,
            hand: []
        }
    };
};
