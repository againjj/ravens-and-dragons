import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCommand } from "../../main/frontend/lunar-base-api";
import { lunarBaseGameEntry } from "../../main/frontend/lunar-base-entry";
import { setScaledDragImage } from "../../main/frontend/LunarBasePlayerBoard";
import { boardBounds, snapDraggedCardFromCenter, snapSelectedCardFromPointer } from "../../main/frontend/lunar-base-board-rules";
import { resolveLunarCardInteraction } from "../../main/frontend/lunar-base-card-interactions";
import { createDragAutoScrollState, dragAutoScrollDelta, stationOppositeSideCard } from "../../main/frontend/lunar-base-game-logic";
import type { LunarBaseActionState, LunarBaseGame } from "../../main/frontend/lunar-base-types";

let servedGame: Record<string, unknown>;
let eventSourceListeners: Map<string, () => void>;

describe("lunarBaseGameEntry", () => {
    beforeEach(() => {
        servedGame = lunarBaseGame();
        eventSourceListeners = new Map();
        vi.stubGlobal("EventSource", class {
            addEventListener = vi.fn((event: string, listener: () => void) => {
                eventSourceListeners.set(event, listener);
            });
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
                return jsonResponse(servedGame);
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

    it("documents selected-pointer and dragged-center board snap parity", () => {
        const station = {
            card: { id: "station-1", type: "station" as const, name: "Terran Outpost", connectors: { topLeft: "gray" as const, bottomLeft: "gray" as const } },
            x: 0,
            y: 0,
            rotation: 0 as const
        };
        const module = { id: "module-1", type: "module" as const, name: "Solar Lab", connectors: { topRight: "gray" as const, bottomRight: "gray" as const } };
        const board = [station];
        const bounds = boardBounds(board);
        const element = document.createElement("div");
        element.getBoundingClientRect = () => new DOMRect(0, 0, 336, 336);

        const selectedSnap = snapSelectedCardFromPointer(board, bounds, 42, 168, 0, module, element, 1);
        const draggedSnap = snapDraggedCardFromCenter(board, bounds, 42, 168, 0, module, element, 1);

        expect(selectedSnap).toEqual({ x: -1, y: 0 });
        expect(draggedSnap).toEqual(selectedSnap);
    });

    it("resolves card interactions from source and target facts", () => {
        const supplyCard = { id: "supply-1", type: "module" as const, name: "Supply Rover" };
        const agentCard = { id: "agent-1", type: "agent" as const, name: "Field Medic" };
        const moduleCard = { id: "module-1", type: "module" as const, name: "Solar Lab" };
        const context = (kind: string, canPlayAgents = false) => ({
            game: lunarBaseGame({ actionState: lunarActionState(kind) }) as unknown as LunarBaseGame,
            viewerSeat: 0,
            canPlayAgents
        });

        expect(resolveLunarCardInteraction({ type: "stock" }, { type: "hand" }, "click", context("draw"))).toMatchObject({
            command: { type: "drawStock" },
            animation: { annotation: "click stock card to hand", faceDown: true, destination: { type: "viewerHandEnd" } }
        });
        expect(resolveLunarCardInteraction({ type: "supply", slotIndex: 2, card: supplyCard }, { type: "discard" }, "modal", context("resell"))).toMatchObject({
            command: { type: "resellSupply", slotIndex: 2 },
            animation: { annotation: "click supply card to discard", sourceKey: "supply-supply-1", destination: { type: "discard" }, hiddenDestinationKey: "discard" }
        });
        expect(resolveLunarCardInteraction({ type: "hand", viewerSeat: 0, card: agentCard }, { type: "discard" }, "drop", context("build", true))).toMatchObject({
            command: { type: "playAgent", cardId: "agent-1" },
            animation: { annotation: "drop hand agent to play", sourceKey: "hand-0-agent-1", destination: { type: "discard" } }
        });
        expect(resolveLunarCardInteraction({ type: "hand", viewerSeat: 0, card: moduleCard }, { type: "board", x: -1, y: 0, rotation: 90, to: { x: 84, y: 42 } }, "drop", context("build"))).toMatchObject({
            command: { type: "buildModule", cardId: "module-1", x: -1, y: 0, rotation: 90 },
            animation: { annotation: "drop hand module to board", sourceKey: "hand-0-module-1", rotation: 90, destination: { type: "boardCard", cardId: "module-1" }, toX: 84, toY: 42 }
        });
        expect(resolveLunarCardInteraction({ type: "hand", viewerSeat: 0, card: moduleCard }, { type: "discard" }, "click", context("discard"))).toMatchObject({
            command: { type: "discardHandCard", cardId: "module-1" },
            animation: { annotation: "click hand module to discard", sourceKey: "hand-0-module-1", destination: { type: "discard" } }
        });
        expect(resolveLunarCardInteraction({ type: "hand", viewerSeat: 0, card: agentCard }, { type: "discard" }, "click", context("discard", true))).toMatchObject({
            command: { type: "discardHandCard", cardId: "agent-1" },
            animation: { annotation: "click hand agent to discard", sourceKey: "hand-0-agent-1", destination: { type: "discard" } }
        });
        expect(resolveLunarCardInteraction({ type: "stock" }, { type: "discard" }, "drop", context("draw"))).toBeNull();
        expect(resolveLunarCardInteraction({ type: "hand", viewerSeat: 0, card: moduleCard }, { type: "discard" }, "drop", context("build"))).toBeNull();
    });

    it("maps a revealed station preview to the opposite side's main action", () => {
        const preview = stationOppositeSideCard({
            id: "station-1",
            type: "station",
            name: "Terran Outpost",
            flipped: false,
            stationFrontName: "Terran Outpost",
            stationFrontMainActionText: "Choose one:\nBuild 1 module\nDraw 1 card",
            stationBackName: "The Oasis",
            stationBackMainActionText: "Draft 2 cards",
            mainActionText: "Choose one:\nBuild 1 module\nDraw 1 card"
        });

        expect(preview.flipped).toBe(true);
        expect(preview.name).toBe("The Oasis");
        expect(preview.mainActionText).toBe("Draft 2 cards");
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
        expect(badge).toHaveClass("is-targetable-badge");

        fireEvent.mouseEnter(badge, { clientX: 50, clientY: 60 });

        expect(await screen.findByRole("tooltip")).toHaveTextContent("ON PLAYING");
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip).toHaveTextContent("Draw 1 cardBuild 1 module");
        expect(tooltip.querySelectorAll("br")).toHaveLength(1);
        expect(tooltip.querySelectorAll(".lunar-card-action-tooltip-line")).toHaveLength(2);

        fireEvent.mouseLeave(badge);
        const effectBadge = screen.getByLabelText("EFFECT");
        expect(effectBadge).toHaveTextContent("EFFECT");
        expect(effectBadge).not.toHaveClass("is-targetable-badge");

        fireEvent.mouseEnter(effectBadge, { clientX: 70, clientY: 80 });

        expect(await screen.findByRole("tooltip")).toHaveTextContent("EFFECT");
        expect(screen.getByRole("tooltip")).toHaveTextContent("Forbid stealing credits");
    });

    it("opens action text from badge long press and swallows the follow-up click", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: query === "(pointer: coarse)",
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn()
            }))
        });

        servedGame = lunarBaseGame({
            supply: [{
                id: "supply-1",
                type: "influence",
                name: "Supply Alliance",
                color: "yellow",
                connectors: { topRight: "gray", bottomRight: "gray" },
                effectText: "Forbid stealing credits"
            }],
            actionState: lunarActionState("draft")
        });
        render(<PlayScreen />);
        expect((await screen.findByText("Supply Alliance")).closest("[role=button]")).toHaveAttribute("aria-disabled", "false");
        const effectBadge = await screen.findByLabelText("EFFECT");
        expect(effectBadge).not.toHaveClass("is-actionable-card");
        expect(effectBadge).toHaveClass("is-targetable-badge");

        fireEvent.click(effectBadge, { clientX: 70, clientY: 80 });

        expect(screen.queryByRole("dialog", { name: "EFFECT text" })).not.toBeInTheDocument();

        vi.useFakeTimers();
        fireEvent.pointerDown(effectBadge, { pointerId: 1, pointerType: "touch", clientX: 70, clientY: 80 });
        act(() => {
            vi.advanceTimersByTime(550);
        });
        const effectPopup = screen.getByRole("dialog", { name: "EFFECT text" });
        expect(effectPopup).toHaveClass("lunar-card-action-popup");
        expect(effectPopup).toHaveTextContent("Forbid stealing credits");
        expect(document.querySelector(".lunar-card-action-popup-backdrop")).toBeInTheDocument();
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        fireEvent.click(effectBadge, { clientX: 70, clientY: 80 });
        expect(screen.getByRole("dialog", { name: "EFFECT text" })).toBeInTheDocument();

        fireEvent.click(document.body);

        expect(screen.queryByRole("dialog", { name: "EFFECT text" })).not.toBeInTheDocument();
        vi.useRealTimers();

        cleanup();
        servedGame = lunarBaseGame({ stockCount: 3 });
        render(<PlayScreen />);
        expect(await screen.findByRole("button", { name: "Stock, 3 cards" })).toHaveAttribute("aria-disabled", "false");

        cleanup();
        servedGame = lunarBaseGame({
            hand: [{
                id: "agent-1",
                type: "agent",
                name: "Field Medic",
                onPlayingText: "Draw 1 card"
            }],
            actionState: lunarChoosingActionState()
        });
        render(<PlayScreen />);
        expect((await screen.findByText("Field Medic")).closest("[role=button]")).toHaveAttribute("aria-disabled", "false");
        const onPlayingBadge = await screen.findByLabelText("ON PLAYING");
        expect(onPlayingBadge).not.toHaveClass("is-actionable-card");

        vi.useFakeTimers();
        fireEvent.pointerDown(onPlayingBadge, { pointerId: 2, pointerType: "touch", clientX: 90, clientY: 100 });
        act(() => {
            vi.advanceTimersByTime(550);
        });

        expect(screen.getByRole("dialog", { name: "ON PLAYING text" })).toHaveTextContent("Draw 1 card");
        vi.useRealTimers();

        cleanup();
        servedGame = lunarBaseGame({ actionState: lunarChoosingActionState() });
        render(<PlayScreen />);
        const mainActionBadge = await screen.findByLabelText("MAIN ACTION");
        expect(mainActionBadge).not.toHaveClass("is-clickable");
        expect(mainActionBadge).toHaveClass("is-targetable-badge");
        expect(fireEvent.mouseDown(mainActionBadge)).toBe(false);

        vi.useFakeTimers();
        fireEvent.pointerDown(mainActionBadge, { pointerId: 3, pointerType: "touch", clientX: 110, clientY: 120 });
        act(() => {
            vi.advanceTimersByTime(550);
        });
        fireEvent.click(mainActionBadge, { clientX: 110, clientY: 120 });

        expect(screen.getByRole("dialog", { name: "MAIN ACTION text" })).toHaveTextContent("Build 1 moduleDraw 1 card");
        expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: expect.stringContaining("chooseMainAction")
            })
        );
        vi.useRealTimers();

        fireEvent.click(document.body);
        expect(screen.queryByRole("dialog", { name: "MAIN ACTION text" })).not.toBeInTheDocument();
        fireEvent.click(mainActionBadge);

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "chooseMainAction", cardId: "station-1", expectedVersion: 1 })
            })
        ));
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

    it("shows the main action tooltip while the station's other side is revealed", async () => {
        servedGame = lunarBaseGame({ actionState: lunarChoosingActionState() });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const revealButton = await screen.findByRole("button", { name: "Reveal other station side" });
        vi.useFakeTimers();
        fireEvent.click(revealButton);
        act(() => {
            vi.advanceTimersByTime(500);
        });
        vi.useRealTimers();

        const revealedBadge = screen.getAllByLabelText("MAIN ACTION").find((badge) =>
            badge.closest(".lunar-board-card")?.classList.contains("is-station-revealed")
        );
        expect(revealedBadge).toBeDefined();
        const revealedCard = revealedBadge!.closest(".lunar-board-card");
        expect(revealedCard).toBeDefined();

        fireEvent.mouseEnter(revealedBadge!, { clientX: 50, clientY: 60 });

        expect(screen.getByRole("tooltip")).toHaveTextContent("Draft 2 cards");

        vi.useFakeTimers();
        fireEvent.click(revealedBadge!);

        expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: expect.stringContaining("chooseMainAction")
            })
        );
        act(() => {
            vi.advanceTimersByTime(500);
        });
        vi.useRealTimers();
        expect(screen.queryByRole("button", { name: "Hide revealed station side" })).not.toBeInTheDocument();
    });

    it("shows station flip controls on every station for non-self flip actions", async () => {
        const animate = vi.fn();
        HTMLElement.prototype.animate = animate;
        servedGame = lunarBaseGame({ actionState: lunarActionState("flipStation") });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);
        const flipButtons = screen.getAllByRole("button", { name: "Flip station" });

        expect(flipButtons).toHaveLength(2);
        expect(flipButtons[0]).toHaveClass("is-flip-control");
        expect(flipButtons[1]).toHaveClass("is-flip-control");
        await userEvent.click(flipButtons[1]);

        expect(animate).not.toHaveBeenCalled();
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "flipStation", playerIndex: 1, cardId: "station-2", expectedVersion: 1 })
            })
        ));
    });

    it("shows the station flip control only on the viewer station for self flip actions", async () => {
        servedGame = lunarBaseGame({ actionState: lunarActionState("flipStation", 0, "self") });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);

        const flipButtons = screen.getAllByRole("button", { name: "Flip station" });
        expect(flipButtons).toHaveLength(1);

        await userEvent.click(flipButtons[0]);

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "flipStation", playerIndex: 0, cardId: "station-1", expectedVersion: 1 })
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

    it("uses viewer-aware command responses instead of refetching the public game view", async () => {
        const commandGame = lunarBaseGame({ viewerSeat: 1, viewerUserId: "player-2", hand: [] });
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
                return jsonResponse(commandGame);
            }
            if (url.includes("/view")) {
                throw new Error("Expected sendCommand to use the command response.");
            }
            return jsonResponse({});
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await sendCommand(lunarBaseGame({ viewerSeat: null, viewerUserId: "player-2" }) as unknown as LunarBaseGame, {
            type: "claimSeat",
            seatIndex: 1,
            playerUserId: "player-2",
            displayName: "Ben"
        });

        expect(result.viewer?.seatIndex).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/games/lunar-1/commands");
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

    it("discards a clicked module during a discard action instead of selecting it for build", async () => {
        servedGame = lunarBaseGame({
            hand: [{ id: "module-discard", type: "module", name: "Helium Factory", color: "blue", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("discard")
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Helium Factory");
        const handCard = card.closest("[role=button]");
        expect(handCard).not.toBeNull();

        await userEvent.click(card);

        expect(handCard).not.toHaveClass("is-selected");
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "discardHandCard", cardId: "module-discard", expectedVersion: 1 })
            })
        ));
    });

    it("selects a different clicked module after clearing the selected card", async () => {
        servedGame = lunarBaseGame({
            hand: [
                { id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue"], connectors: { topRight: "gray", bottomRight: "gray" } },
                { id: "module-2", type: "module", name: "Hydroponics", color: "yellow", cardCost: ["yellow"], connectors: { topRight: "gray", bottomRight: "gray" } }
            ]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const module = await screen.findByText("Solar Lab");
        const secondModule = await screen.findByText("Hydroponics");

        fireEvent.click(module);
        expect(module.closest("[role=button]")).toHaveClass("is-selected");
        fireEvent.click(secondModule);

        expect(module.closest("[role=button]")).not.toHaveClass("is-selected");
        expect(secondModule.closest("[role=button]")).toHaveClass("is-selected");
    });

    it("takes a supply card when it is dragged to the viewer hand", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("draft")
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
                body: JSON.stringify({ type: "draftSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("shows a snap rectangle when a supply card can be dropped into the viewer hand", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("draft")
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

    it("keeps transient snap and preview visuals out of the table sizing surface", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("draft")
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("[role=button]");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        const overlay = document.querySelector<HTMLElement>(".lunar-drag-overlay");
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(surface).not.toBeNull();
        expect(scroll).not.toBeNull();
        expect(overlay).not.toBeNull();
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(hand!, { clientX: 300, clientY: 390, dataTransfer });

        const preview = document.querySelector<HTMLElement>(".lunar-drag-preview");
        const snap = document.querySelector<HTMLElement>(".lunar-drop-snap");
        expect(preview).not.toBeNull();
        expect(snap).not.toBeNull();
        expect(overlay).toContainElement(preview);
        expect(overlay).toContainElement(snap);
        expect(overlay!.parentElement).toBe(scroll);
        expect(surface).not.toContainElement(preview);
        expect(surface).not.toContainElement(snap);
        expect(overlay).toHaveClass("lunar-drag-overlay");
        fireDragEnd(supplyButton!, { clientX: 300, clientY: 390, dataTransfer });
    });

    it("sizes the drag overlay to the full scrollable table area", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
            clientWidth: { value: 900, configurable: true },
            clientHeight: { value: 700, configurable: true },
            scrollWidth: { value: 1400, configurable: true },
            scrollHeight: { value: 980, configurable: true },
            scrollBy: { value: vi.fn(), configurable: true }
        });

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(scroll!, { clientX: 600, clientY: 220, dataTransfer });

        expect(document.querySelector<HTMLElement>(".lunar-drag-overlay")).toHaveStyle({
            width: "1400px",
            height: "980px"
        });
        fireDragEnd(supplyButton!, { clientX: 600, clientY: 220, dataTransfer });
    });

    it("keeps the table scroll position when dropping a top-row supply card", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
                body: JSON.stringify({ type: "draftSupply", slotIndex: 0, expectedVersion: 1 })
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
                body: JSON.stringify({ type: "draftSupply", slotIndex: 0, expectedVersion: 1 })
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

    it("resells a clicked supply card during a resell action", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await userEvent.click(await screen.findByText("Supply Rover"));

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "resellSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("takes a clicked supply card to hand during a draft action", async () => {
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
                body: JSON.stringify({ type: "draftSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("discards a supply card when it is dragged to the discard pile", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
                body: JSON.stringify({ type: "resellSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("shows a snap rectangle when a supply card can be dropped on the discard pile", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
                body: JSON.stringify({ type: "resellSupply", slotIndex: 0, expectedVersion: 1 })
            })
        );
    });

    it("snaps to discard when the dragged card center is inside even if the pointer is outside", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            actionState: lunarActionState("resell")
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
                body: JSON.stringify({ type: "resellSupply", slotIndex: 0, expectedVersion: 1 })
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
                body: JSON.stringify({ type: "draftSupply", slotIndex: 0, expectedVersion: 1 })
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
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        const supplySource = supplyButton as HTMLElement | null;
        const supplyCard = supplyButton?.querySelector<HTMLElement>(".lunar-card");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();
        expect(supplySource).not.toBeNull();
        expect(supplySource).toHaveAttribute("data-lunar-animate", "supply-supply-1");
        expect(supplyCard).not.toBeNull();
        hand!.getBoundingClientRect = () => new DOMRect(280, 360, 192, 178);
        supplySource!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        fireDragOver(hand!, { clientX: 320, clientY: 342, dataTransfer });
        expectDropSnap(new DOMRect(280, 360, 84, 168));
        fireDragEnd(supplyButton!, { clientX: 0, clientY: 0, dataTransfer });

        const flyingCard = await screen.findByLabelText("return supply card to supply");
        expect(document.querySelector(".lunar-drop-snap")).toBeNull();
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "350px",
            "--lunar-fly-from-y": "400px",
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
        const overlay = document.querySelector<HTMLElement>(".lunar-drag-overlay");
        expect(preview).not.toBeNull();
        expect(overlay).toContainElement(preview);
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
            hand: [{ id: "influence-1", type: "influence", name: "Supply Pact" }],
            actionState: lunarActionState("discard")
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

    it("disables but does not dim an unaffordable hand module on the current player's turn", async () => {
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
        expect(cardButton).not.toHaveClass("is-unplayable");

        fireEvent.click(cardButton!);
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(board).not.toBeNull();

        fireEvent.mouseMove(board!, { clientX: 10, clientY: 94 });

        expect(document.querySelector(".lunar-board-hover")).toBeNull();
    });

    it("disables but does not dim an affordable hand module with no legal board placement", async () => {
        servedGame = lunarBaseGame({
            credits: 5,
            hand: [{ id: "module-blocked", type: "module", name: "Blocked Lab", color: "blue", connectors: { top: "red" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const cardButton = (await screen.findByText("Blocked Lab")).closest("[role=button]");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toHaveAttribute("aria-disabled", "true");
        expect(cardButton).not.toHaveClass("is-unplayable");
    });

    it("does not dim disabled cards when it is another player's turn", async () => {
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

    it("animates a remote supply discard from the supply slot to the discard pile", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const supplyCard = await screen.findByText("Supply Rover");
        supplyCard.closest<HTMLElement>("[data-lunar-animate]")!.getBoundingClientRect = () => new DOMRect(20, 30, 84, 168);
        document.querySelector<HTMLElement>('[data-lunar-animate="discard"]')!.getBoundingClientRect = () => new DOMRect(220, 40, 84, 168);

        servedGame = lunarBaseGame({
            supply: [],
            discardTop: { id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } },
            discardCount: 1,
            version: 2
        });
        await act(async () => {
            eventSourceListeners.get("game")?.();
        });

        const flyingCard = await screen.findByLabelText("remote discard supply to discard");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "62px",
            "--lunar-fly-from-y": "114px",
            "--lunar-fly-to-x": "262px",
            "--lunar-fly-to-y": "124px"
        });
    });

    it("animates a remote station flip", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);

        vi.useFakeTimers();
        servedGame = lunarBaseGame({ stationFlipped: true, version: 2 });
        await act(async () => {
            eventSourceListeners.get("game")?.();
        });

        expect(screen.getByText("The Oasis")).toBeInTheDocument();
        expect(screen.getAllByText("Terran Outpost")).toHaveLength(2);

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText("The Oasis")).toBeInTheDocument();
        expect(screen.getAllByText("Terran Outpost")).toHaveLength(1);
    });

    it("animates a same-seat remote hand module play from the hand card to the board", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const handCard = await screen.findByText("Solar Lab");
        handCard.closest<HTMLElement>("[data-lunar-animate]")!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);

        servedGame = { ...lunarBaseGameWithPlayedModule(), version: 2 };
        await act(async () => {
            eventSourceListeners.get("game")?.();
        });

        const flyingCard = await screen.findByLabelText("remote play module from hand to board");
        expect(flyingCard).toBeInTheDocument();
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
            resolveCommand(jsonResponse(servedGame));
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
        expect(document.querySelector(".lunar-drag-preview")).toBeNull();
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "buildModule", cardId: "module-1", x: -1, y: -1, rotation: 90, expectedVersion: 1 })
            })
        ));
        expect(await screen.findByLabelText("drop hand module to board")).toBeInTheDocument();
        expect(document.querySelector(".lunar-board-hover")).toBeNull();
        expect(document.querySelector(".lunar-drag-preview")).toBeNull();
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

    it("keeps a deselected rotated module fully visible while it resets", async () => {
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

        servedGame = lunarBaseGame({ credits: 0 });
        await act(async () => {
            eventSourceListeners.get("game")?.();
        });

        const handCard = card.closest(".lunar-hand-card");
        expect(handCard).toHaveClass("is-selected");
        expect(handCard).not.toHaveClass("is-unplayable");

        fireEvent.click(document.querySelector<HTMLElement>(".lunar-table-surface")!);

        expect(handCard).toHaveClass("is-rotation-resetting");
        expect(handCard).not.toHaveClass("is-unplayable");

        act(() => {
            while (animationFrames.length > 0) {
                animationFrames.shift()?.(0);
            }
        });

        expect(handCard).not.toHaveClass("is-selected");
        expect(handCard).toHaveClass("is-rotation-resetting");
        expect(handCard).not.toHaveClass("is-unplayable");
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

    it("deselects a selected card from empty scroll-port space outside the table surface", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        const scroll = document.querySelector<HTMLElement>(".lunar-table-scroll");
        expect(scroll).not.toBeNull();

        fireEvent.click(card);
        expect(card.closest("[role=button]")).toHaveClass("is-selected");

        fireEvent.click(scroll!);

        expect(card.closest("[role=button]")).not.toHaveClass("is-selected");
    });

    it("deselects a selected card when clicking its surrounding hand-card space", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        const handCard = card.closest<HTMLElement>(".lunar-hand-card");
        expect(handCard).not.toBeNull();

        fireEvent.click(card);
        expect(handCard).toHaveClass("is-selected");

        fireEvent.click(handCard!);

        expect(handCard).not.toHaveClass("is-selected");
    });

    it("deselects a selected card when clicking a disabled hand card", async () => {
        servedGame = lunarBaseGame({
            hand: [
                { id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue"], connectors: { topRight: "gray", bottomRight: "gray" } },
                { id: "module-expensive", type: "module", name: "Costly Lab", color: "blue", cardCost: ["blue", "yellow", "red", "gray", "red", "blue"], connectors: { topRight: "gray", bottomRight: "gray" } }
            ]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const selectedCard = await screen.findByText("Solar Lab");
        const disabledCard = await screen.findByText("Costly Lab");
        const selectedHandCard = selectedCard.closest<HTMLElement>(".lunar-hand-card");
        const disabledHandCard = disabledCard.closest<HTMLElement>(".lunar-hand-card");
        expect(selectedHandCard).not.toBeNull();
        expect(disabledHandCard).not.toBeNull();

        fireEvent.click(selectedCard);
        expect(selectedHandCard).toHaveClass("is-selected");
        expect(disabledHandCard).not.toHaveClass("is-unplayable");

        fireEvent.click(disabledCard);

        expect(selectedHandCard).not.toHaveClass("is-selected");
    });

    it("removes the manual end game button", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await screen.findByText("Solar Lab");

        expect(screen.queryByRole("button", { name: "End Game" })).not.toBeInTheDocument();
    });

    it("flashes the credit text when credits change", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await screen.findByText("Solar Lab");
        const creditValue = document.querySelector<HTMLElement>(".lunar-credit-value");
        expect(creditValue).not.toBeNull();
        expect(creditValue).toHaveTextContent("5/20");
        expect(creditValue).not.toHaveClass("is-credit-changing");

        servedGame = lunarBaseGame({ credits: 7 });
        await act(async () => {
            eventSourceListeners.get("game")?.();
        });

        const updatedCreditValue = document.querySelector<HTMLElement>(".lunar-credit-value");
        expect(updatedCreditValue).not.toBeNull();
        expect(updatedCreditValue).toHaveTextContent("7/20");
        expect(updatedCreditValue).toHaveClass("is-credit-changing");
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
        expect(screen.getByLabelText("Action panel")).toHaveTextContent("Epic Victory for Ada!");
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

const lunarActionState = (kind = "build", actorIndex = 0, flipAmountKind = "literal"): LunarBaseActionState => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    interaction: {
        kind,
        actorIndex,
        text: kind === "build" ? "Build 1 module (1 left)" : `${kind} action`,
        buttons: kind === "build" ? [{ label: "Skip Build", value: "skip" }] : [],
        remaining: 1,
        action: kind === "flipStation" ? { flipAmountKind } : null,
        flippedStationIds: []
    },
    statusText: kind === "build" ? "Build 1 module (1 left)" : `${kind} action`
});

const lunarChoosingActionState = (): LunarBaseActionState => ({
    phase: "choosingMainAction",
    mainActionChosen: false,
    interaction: null,
    statusText: null
});

const defaultLunarActionState = (
    hand: Array<Record<string, unknown>>,
    supply: Array<Record<string, unknown> | null>,
    stockCount: number,
    currentPlayerIndex: number
): LunarBaseActionState => {
    if (stockCount > 0) return lunarActionState("draw", currentPlayerIndex);
    if (supply.some(Boolean)) return lunarActionState("draft", currentPlayerIndex);
    if (hand.some((card) => card.type === "agent")) return lunarChoosingActionState();
    return lunarActionState("build", currentPlayerIndex);
};

const lunarBaseGame = ({
    version = 1,
    credits = 5,
    hand = [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue", "yellow", "red", "gray", "red"], connectors: { topRight: "gray", bottomRight: "gray" }, colonists: 2, achievements: [3, 14] }],
    supply = [],
    stockCount = 0,
    discardTop = null,
    discardCount = 0,
    currentPlayerIndex = 0,
    viewerSeat = 0,
    viewerUserId,
    seats = [
        { userId: "player-1", displayName: "Ada" },
        { userId: "player-2", displayName: "Ben" }
    ],
    stationFlipped = false,
    lifecycle = "active",
    endGameResult = null,
    revealedHands,
    actionState = defaultLunarActionState(hand, supply, stockCount, currentPlayerIndex)
}: { version?: number; credits?: number; hand?: Array<Record<string, unknown>>; supply?: Array<Record<string, unknown> | null>; stockCount?: number; discardTop?: Record<string, unknown> | null; discardCount?: number; currentPlayerIndex?: number; viewerSeat?: number | null; viewerUserId?: string | null; seats?: Array<{ userId: string | null; displayName: string | null }>; stationFlipped?: boolean; lifecycle?: string; endGameResult?: Record<string, unknown> | null; revealedHands?: Array<Array<Record<string, unknown>>>; actionState?: LunarBaseActionState } = {}) => ({
    id: "lunar-1",
    gameSlug: "lunar-base",
    version,
    lifecycle,
    config: { playerCount: 2, useInfluences: false },
    seats,
    currentPlayerIndex,
    actionState,
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
    discardTop,
    discardCount,
    endGameResult,
    message: null,
    viewer: {
        userId: viewerUserId ?? (viewerSeat === null ? null : `player-${viewerSeat + 1}`),
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
