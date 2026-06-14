import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lunarBaseGameEntry } from "../../main/frontend/lunar-base-entry";
import { setScaledDragImage } from "../../main/frontend/LunarBasePlayerBoard";

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
        const revealedMainAction = screen.getAllByLabelText("MAIN ACTION")
            .find((badge) => badge.closest(".lunar-board-card")?.textContent?.includes("The Oasis"));
        expect(revealedMainAction).toBeDefined();
        expect(revealedMainAction!.closest(".lunar-board-card")).toHaveClass("is-station-revealed");
        expect(revealedMainAction!.closest(".lunar-board-card")).not.toHaveClass("is-card-dimmed");
        expect(revealedMainAction!.closest(".lunar-board-card")).not.toHaveClass("can-choose-main-action");
        fireEvent.mouseEnter(revealedMainAction!, { clientX: 50, clientY: 60 });
        expect(screen.getByRole("tooltip")).toHaveTextContent("Draft 2 cards");
        fireEvent.mouseLeave(revealedMainAction!);
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

    it("shows flip controls for every targetable station and sends a flip command", async () => {
        const animate = vi.fn();
        HTMLElement.prototype.animate = animate;
        servedGame = lunarBaseGame({ actionState: flipActionState() });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);

        const flipButtons = screen.getAllByRole("button", { name: "Flip station" });
        expect(flipButtons).toHaveLength(2);
        await userEvent.click(flipButtons[0]);

        expect(screen.getByText("The Oasis")).toBeInTheDocument();
        expect(animate).not.toHaveBeenCalled();
        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "flipStation", cardId: "station-1", playerIndex: 0, expectedVersion: 1 })
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
            actionState: draftActionState(),
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const user = userEvent.setup();
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        await user.click(await screen.findByRole("button", { name: "Zoom in" }));
        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
        const supplySource = supplyButton as HTMLElement | null;
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        expect(supplyButton).not.toBeNull();
        expect(supplySource).not.toBeNull();
        expect(supplySource).toHaveAttribute("data-lunar-animate", "supply-supply-1");
        expect(hand).not.toBeNull();
        const supplyCard = supplyButton!.querySelector(".lunar-card");
        expect(supplyCard).not.toBeNull();
        supplyCard!.getBoundingClientRect = () => new DOMRect(100, 120, 84, 168);

        fireDragStart(supplyButton!, { clientX: 112, clientY: 146, dataTransfer });
        await waitFor(() => expect(supplySource).toHaveClass("is-dragging-source"));
        fireDrop(hand!, { clientX: 210, clientY: 220, dataTransfer });
        const flyingCard = await screen.findByLabelText("drop supply card to hand");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "240px",
            "--lunar-fly-from-y": "278px",
            "--lunar-fly-half-width": "46.2px",
            "--lunar-fly-half-height": "92.4px",
            "--lunar-fly-zoom": "1.1"
        });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "draftSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("keeps action text in the status area and interaction text beside buttons", async () => {
        servedGame = lunarBaseGame({
            actionState: {
                phase: "resolvingAction",
                mainActionChosen: true,
                statusText: "Draw 1 card",
                interaction: {
                    kind: "chooseOne",
                    actorIndex: 0,
                    text: "",
                    buttons: [{ label: "Build 1 module", value: "0" }]
                }
            }
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        await screen.findByText("Solar Lab");

        const panel = document.querySelector(".lunar-action-panel");
        const status = document.querySelector(".lunar-action-status");
        const interaction = document.querySelector(".lunar-action-interaction");
        expect(panel?.parentElement).toHaveClass("lunar-game-ports");
        expect(status).toHaveTextContent("Draw 1 card");
        expect(status).not.toHaveTextContent("Build 1 module");
        expect(interaction).not.toHaveTextContent("Choose one");
        expect(screen.getByRole("button", { name: "Build 1 module" })).toBeInTheDocument();
    });

    it("dims supply cards while choosing actions that cannot target the supply", async () => {
        servedGame = lunarBaseGame({
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
        expect(supplyButton).not.toBeNull();
        expect(supplyButton).toBeDisabled();
        expect(supplyButton).toHaveClass("is-card-dimmed");
    });

    it("dims supply cards during choose one interactions", async () => {
        servedGame = lunarBaseGame({
            actionState: chooseOneActionState(),
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
        expect(supplyButton).not.toBeNull();
        expect(supplyButton).toBeDisabled();
        expect(supplyButton).toHaveClass("is-card-dimmed");
        expect(screen.getByRole("button", { name: "Draw 1 card" })).toBeInTheDocument();
    });

    it("does not dim cards during another actor's choose one interaction", async () => {
        servedGame = lunarBaseGame({
            actionState: {
                ...chooseOneActionState(),
                interaction: {
                    ...chooseOneActionState().interaction,
                    actorIndex: 1
                }
            },
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
        expect(supplyButton).not.toBeNull();
        expect(supplyButton).toBeDisabled();
        expect(document.querySelectorAll(".is-card-dimmed")).toHaveLength(0);
    });

    it("formats waiting-for-turn status like action waiting status", async () => {
        servedGame = lunarBaseGame({ currentPlayerIndex: 1 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        await screen.findByText("Solar Lab");
        const status = document.querySelector(".lunar-action-status");
        expect(status).toHaveTextContent("Waiting for Ben");
        expect(status).toHaveTextContent("Play an agent or choose a main action");
        expect(status).not.toHaveTextContent("Ben is playing");
    });

    it("renders end game popup titles and condition lines with panel wording", async () => {
        servedGame = {
            ...lunarBaseGame(),
            version: 3,
            lifecycle: "finished",
            endGameResult: {
                label: "Draw",
                playerIndexes: [0, 1],
                conditions: [
                    { playerIndex: 0, conditions: ["6/4 influences in hand"] },
                    { playerIndex: 1, conditions: ["11/10 colonists housed"] }
                ]
            },
            viewer: {
                userId: "player-1",
                seatIndex: 0,
                hand: [],
                hands: [[], []]
            }
        };
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        expect(await screen.findByRole("heading", { name: "Draw between Ada, Ben" })).toBeInTheDocument();
        expect(document.querySelector(".lunar-action-status")).toHaveTextContent("Draw between Ada, Ben");
        expect(screen.getByText("Ada: 6/4 influences in hand")).toBeInTheDocument();
        expect(screen.getByText("Ben: 11/10 colonists housed")).toBeInTheDocument();
    });

    it("animates automatic draws from stock before showing the drawn hand card", async () => {
        servedGame = lunarBaseGame({ actionState: chooseOneActionState(), hand: [], stockCount: 1 });
        const drawnGame = lunarBaseGame({
            actionState: choosingMainActionState(),
            hand: [{ id: "drawn-1", type: "module", name: "Drawn Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
            stockCount: 0
        });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
                servedGame = drawnGame;
                return jsonResponse({});
            }
            if (url.includes("/view")) return jsonResponse(servedGame);
            if (url.includes("/api/auth/session")) return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            if (url.includes("/api/auth/users")) return jsonResponse([]);
            return jsonResponse({});
        }));
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const stock = await screen.findByRole("button", { name: "Stock, 1 cards" });
        stock.getBoundingClientRect = () => new DOMRect(100, 100, 84, 168);
        vi.useFakeTimers();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Draw 1 card" }));
        });

        expect(screen.getByLabelText("draw stock card to hand")).toBeInTheDocument();
        expect(screen.queryByText("Drawn Rover")).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText("Drawn Rover")).toBeInTheDocument();
    });

    it("shows automatic draw step status before each draw animation completes", async () => {
        let resolveCommand: (response: Response) => void = () => {};
        const firstCommandResponse = new Promise<Response>((resolve) => {
            resolveCommand = resolve;
        });
        let commandCalls = 0;
        servedGame = lunarBaseGame({ actionState: drawActionState(2), hand: [], stockCount: 2 });
        const afterFirstDraw = {
            ...lunarBaseGame({
                actionState: drawActionState(2, 1),
                hand: [{ id: "drawn-1", type: "module", name: "Drawn Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
                stockCount: 1
            }),
            version: 2
        };
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
                commandCalls += 1;
                return commandCalls === 1 ? firstCommandResponse : new Promise<Response>(() => {});
            }
            if (url.includes("/view")) return jsonResponse(servedGame);
            if (url.includes("/api/auth/session")) return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            if (url.includes("/api/auth/users")) return jsonResponse([]);
            return jsonResponse({});
        }));
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const stock = await screen.findByRole("button", { name: "Stock, 2 cards" });
        stock.getBoundingClientRect = () => new DOMRect(100, 100, 84, 168);

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "completeAutomaticAction", expectedVersion: 1 })
            })
        ));
        const status = document.querySelector(".lunar-action-status");
        expect(status).toHaveTextContent("Draw 2 cards (2 left)");

        vi.useFakeTimers();
        await act(async () => {
            servedGame = afterFirstDraw;
            resolveCommand(jsonResponse({}));
        });

        expect(screen.getByLabelText("draw stock card to hand")).toBeInTheDocument();
        expect(status).toHaveTextContent("Draw 2 cards (2 left)");
        expect(screen.queryByText("Drawn Rover")).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText("Drawn Rover")).toBeInTheDocument();
        expect(document.querySelector(".lunar-action-status")).toHaveTextContent("Draw 2 cards (1 left)");
    });

    it("animates draws from stock after the discard pile refills the stock", async () => {
        let resolveCommand: (response: Response) => void = () => {};
        const commandResponse = new Promise<Response>((resolve) => {
            resolveCommand = resolve;
        });
        servedGame = {
            ...lunarBaseGame({ actionState: drawActionState(1), hand: [], stockCount: 0 }),
            discardCount: 2,
            discardTop: { id: "discard-top", type: "module", name: "Discard Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }
        };
        const drawnGame = {
            ...lunarBaseGame({
                actionState: choosingMainActionState(),
                hand: [{ id: "drawn-1", type: "module", name: "Drawn Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }],
                stockCount: 1
            }),
            version: 2,
            discardCount: 0,
            discardTop: null
        };
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) return commandResponse;
            if (url.includes("/view")) return jsonResponse(servedGame);
            if (url.includes("/api/auth/session")) return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            if (url.includes("/api/auth/users")) return jsonResponse([]);
            return jsonResponse({});
        }));
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const stock = await screen.findByRole("button", { name: "Stock, 0 cards" });
        stock.getBoundingClientRect = () => new DOMRect(100, 100, 84, 168);

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "completeAutomaticAction", expectedVersion: 1 })
            })
        ));

        vi.useFakeTimers();
        await act(async () => {
            servedGame = drawnGame;
            resolveCommand(jsonResponse({}));
        });

        expect(screen.getByLabelText("draw stock card to hand")).toBeInTheDocument();
        expect(screen.queryByText("Drawn Rover")).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText("Drawn Rover")).toBeInTheDocument();
    });

    it("animates automatic station flips before showing the new station side", async () => {
        servedGame = lunarBaseGame({ actionState: chooseOneActionState() });
        const flippedGame = lunarBaseGame({ stationFlipped: true, actionState: choosingMainActionState() });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
                servedGame = flippedGame;
                return jsonResponse({});
            }
            if (url.includes("/view")) return jsonResponse(servedGame);
            if (url.includes("/api/auth/session")) return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            if (url.includes("/api/auth/users")) return jsonResponse([]);
            return jsonResponse({});
        }));
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        expect(await screen.findAllByText("Terran Outpost")).toHaveLength(2);
        vi.useFakeTimers();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Draw 1 card" }));
        });

        expect(document.querySelector(".lunar-flip-stage")).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText("The Oasis")).toBeInTheDocument();
    });

    it("hides a clicked resell card at the supply source while the command is pending", async () => {
        let resolveCommand: (response: Response) => void = () => {};
        const commandResponse = new Promise<Response>((resolve) => {
            resolveCommand = resolve;
        });
        servedGame = lunarBaseGame({
            actionState: resellActionState(),
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) {
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
        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
        expect(supplyButton).not.toBeNull();

        fireEvent.click(supplyButton!);

        await waitFor(() => expect(supplyButton).toHaveClass("is-animation-destination-hidden"));
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "resellSupply", slotIndex: 0, expectedVersion: 1 })
            })
        );

        await act(async () => {
            resolveCommand(jsonResponse({}));
        });
    });

    it("returns an invalid supply drag to the supply source rect", async () => {
        servedGame = lunarBaseGame({
            actionState: draftActionState(),
            supply: [{ id: "supply-1", type: "module", name: "Supply Rover", color: "yellow", connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
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
        fireDrop(surface!, { clientX: 210, clientY: 220, dataTransfer });

        const flyingCard = await screen.findByLabelText("return supply card to supply");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "240px",
            "--lunar-fly-from-y": "278px",
            "--lunar-fly-to-x": "142px",
            "--lunar-fly-to-y": "204px"
        });
    });

    it("renders stock as a passive pile during action selection", async () => {
        servedGame = lunarBaseGame({ stockCount: 3 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 3 cards" });
        const stockCard = stockButton.querySelector(".lunar-card");
        expect(stockCard).toHaveClass("is-back");
        expect(stockCard).not.toHaveClass("is-empty");
        expect(stockButton).toBeDisabled();
        expect(stockButton).toHaveAttribute("draggable", "false");
    });

    it("does not start stock drags", async () => {
        servedGame = lunarBaseGame({ stockCount: 3 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 3 cards" });

        fireDragStart(stockButton, { clientX: 98, clientY: 124, dataTransfer });

        expect(document.querySelector(".is-dragging-source")).toBeNull();
    });

    it("keeps the last stock card visible because stock is passive", async () => {
        servedGame = lunarBaseGame({ stockCount: 1 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const stockButton = await screen.findByRole("button", { name: "Stock, 1 cards" });
        const stockCard = stockButton.querySelector(".lunar-card");
        expect(stockCard).toHaveClass("is-back");
        expect(stockCard).not.toHaveClass("is-empty");
    });

    it("returns an invalid hand drag to the hand card rect", async () => {
        servedGame = lunarBaseGame({ actionState: buildActionState() });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const cardButton = (await screen.findByText("Solar Lab")).closest("button");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        expect(cardButton).not.toBeNull();
        expect(surface).not.toBeNull();
        const cardElement = cardButton!.querySelector(".lunar-card");
        expect(cardElement).not.toBeNull();
        cardButton!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);
        cardElement!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);

        const dragStartEvent = new Event("dragstart", { bubbles: true, cancelable: true });
        Object.defineProperties(dragStartEvent, {
            clientX: { value: 54 },
            clientY: { value: 430 },
            dataTransfer: { value: dataTransfer }
        });
        fireEvent(cardButton!, dragStartEvent);
        const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperties(dropEvent, {
            clientX: { value: 300 },
            clientY: { value: 220 },
            dataTransfer: { value: dataTransfer }
        });
        fireEvent(surface!, dropEvent);

        const flyingCard = await screen.findByLabelText("return hand card to hand");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "318px",
            "--lunar-fly-from-y": "274px",
            "--lunar-fly-to-x": "72px",
            "--lunar-fly-to-y": "484px"
        });
        expect(cardButton).toHaveClass("is-animation-destination-hidden");
    });

    it("dims and disables an unaffordable hand module on the current player's turn", async () => {
        servedGame = lunarBaseGame({
            credits: 0,
            hand: [{ id: "module-expensive", type: "module", name: "Costly Lab", color: "blue", cardCost: ["blue", "yellow"], connectors: { topRight: "gray", bottomRight: "gray" } }]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Costly Lab");
        const cardButton = card.closest("button");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toBeDisabled();
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

        const cardButton = (await screen.findByText("Blocked Lab")).closest("button");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toBeDisabled();
        expect(cardButton).toHaveClass("is-unplayable");
    });

    it("does not dim the viewer's hand when it is another player's turn", async () => {
        servedGame = lunarBaseGame({ currentPlayerIndex: 1 });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);

        const cardButton = (await screen.findByText("Solar Lab")).closest("button");
        expect(cardButton).not.toBeNull();
        expect(cardButton).toBeDisabled();
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
        servedGame = lunarBaseGame({ actionState: buildActionState() });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        vi.useFakeTimers();
        fireEvent.click(card);
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(board).not.toBeNull();

        fireEvent.click(board!, { clientX: 10, clientY: 94 });
        await act(async () => {});
        const flyingCard = screen.getByLabelText("click selected module to board");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-to-x": "42px",
            "--lunar-fly-to-y": "84px"
        });
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

    it("selects an opponent module during steal module actions and submits the stolen placement", async () => {
        servedGame = lunarBaseGame({
            hand: [],
            actionState: stealSatelliteActionState(),
            opponentBoard: [
                {
                    card: { id: "station-2", type: "station", name: "Terran Outpost", connectors: { topLeft: "gray", bottomLeft: "gray" }, stationBackName: "The Crater", stationBackOrbs: ["yellow", "gray"] },
                    x: 0,
                    y: 0,
                    rotation: 0
                },
                {
                    card: { id: "satellite-1", type: "module", name: "Satellite", color: "blue", connectors: { topRight: "gray", bottomRight: "gray" } },
                    x: -1,
                    y: 0,
                    rotation: 0
                }
            ]
        });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const satellite = await screen.findByText("Satellite");
        const satelliteBoardCard = satellite.closest(".lunar-board-card");
        expect(satelliteBoardCard).toHaveClass("is-card-target");
        expect(satelliteBoardCard).not.toHaveClass("is-card-dimmed");

        fireEvent.click(satellite);
        const viewerBoard = document.querySelector<HTMLElement>(".lunar-board");
        expect(viewerBoard).not.toBeNull();
        fireEvent.click(viewerBoard!, { clientX: 10, clientY: 94 });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "stealModule", sourcePlayerIndex: 1, cardId: "satellite-1", x: -1, y: -1, rotation: 0, expectedVersion: 1 })
            })
        ));
    });

    it("keeps a played hand module hidden while the play animation is pending", async () => {
        let resolveCommand: (response: Response) => void = () => {};
        const commandResponse = new Promise<Response>((resolve) => {
            resolveCommand = resolve;
        });
        let commandCalls = 0;
        servedGame = lunarBaseGame({ actionState: buildActionState() });
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
        const cardButton = cardText.closest("button");
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

    it("keeps a dragged build module hidden after a legal drop while the command is pending", async () => {
        let resolveCommand: (response: Response) => void = () => {};
        const commandResponse = new Promise<Response>((resolve) => {
            resolveCommand = resolve;
        });
        servedGame = lunarBaseGame({ actionState: buildActionState() });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/commands")) return commandResponse;
            if (url.includes("/view")) return jsonResponse(servedGame);
            if (url.includes("/api/auth/session")) return jsonResponse({ user: { id: "player-1", displayName: "Ada" } });
            if (url.includes("/api/auth/users")) return jsonResponse([]);
            return jsonResponse({});
        }));
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const cardButton = (await screen.findByText("Solar Lab")).closest("button");
        const board = document.querySelector<HTMLElement>(".lunar-board");
        expect(cardButton).not.toBeNull();
        expect(board).not.toBeNull();

        fireDragStart(cardButton!, { clientX: 20, clientY: 40, dataTransfer });
        await waitFor(() => expect(cardButton).toHaveClass("is-dragging"));
        fireDrop(board!, { clientX: 10, clientY: 94, dataTransfer });
        fireEvent.dragEnd(cardButton!, { dataTransfer });

        await waitFor(() => expect(cardButton).toHaveClass("is-dragging"));
        expect(cardButton).toHaveClass("is-animation-destination-hidden");

        vi.useFakeTimers();
        await act(async () => {
            servedGame = lunarBaseGameWithPlayedModule();
            resolveCommand(jsonResponse({}));
        });
        expect(screen.getAllByLabelText("drop hand module to board").length).toBeGreaterThan(0);
        expect(cardButton).toHaveClass("is-animation-destination-hidden");

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(cardButton).not.toBeInTheDocument();
    });

    it("normalizes a selected module back to zero rotation after a full spin", async () => {
        servedGame = lunarBaseGame({ actionState: buildActionState() });
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
        vi.useFakeTimers();

        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);
        fireEvent.click(card);

        const cardElement = card.closest(".lunar-card");
        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "360deg" });

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(cardElement).toHaveStyle({ "--lunar-card-rotation": "0deg" });
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

const lunarBaseGame = ({
    credits = 5,
    hand = [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue", "yellow", "red", "gray", "red"], connectors: { topRight: "gray", bottomRight: "gray" }, colonists: 2, achievements: [3, 14] }],
    supply = [],
    stockCount = 0,
    currentPlayerIndex = 0,
    viewerSeat = 0,
    stationFlipped = false,
    actionState = choosingMainActionState(),
    opponentBoard
}: { credits?: number; hand?: Array<Record<string, unknown>>; supply?: Array<Record<string, unknown> | null>; stockCount?: number; currentPlayerIndex?: number; viewerSeat?: number; stationFlipped?: boolean; actionState?: Record<string, unknown>; opponentBoard?: Array<Record<string, unknown>> } = {}) => ({
    id: "lunar-1",
    gameSlug: "lunar-base",
    version: 1,
    lifecycle: "active",
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
            board: opponentBoard ?? [{
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
    actionState,
    endGameResult: null,
    message: null,
    viewer: {
        userId: `player-${viewerSeat + 1}`,
        seatIndex: viewerSeat,
        hand
    }
});

const choosingMainActionState = () => ({
    phase: "choosingMainAction",
    mainActionChosen: false,
    interaction: null
});

const buildActionState = () => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: "Build 1 module (1 left)",
    interaction: { kind: "build", actorIndex: 0, text: "", buttons: [{ label: "Skip Build", value: "skip" }], remaining: 1 }
});

const chooseOneActionState = () => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: "Choose one:\nDraw 1 card\nBuild 1 module",
    interaction: {
        kind: "chooseOne",
        actorIndex: 0,
        text: "",
        buttons: [
            { label: "Draw 1 card", value: "0" },
            { label: "Build 1 module", value: "1" }
        ]
    }
});

const drawActionState = (amount: number, remaining = amount) => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: `Draw ${amount} ${amount === 1 ? "card" : "cards"} (${remaining} left)`,
    interaction: { kind: "draw", actorIndex: 0, text: "", buttons: [], remaining }
});

const draftActionState = () => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: "Draft 1 card (1 left)",
    interaction: { kind: "draft", actorIndex: 0, text: "", buttons: [], remaining: 1 }
});

const resellActionState = () => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: "Resell 1 card (1 left)",
    interaction: { kind: "resell", actorIndex: 0, text: "", buttons: [], remaining: 1 }
});

const flipActionState = () => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: "Flip 1 station (1 left)",
    interaction: { kind: "flipStation", actorIndex: 0, text: "", buttons: [], remaining: 1 }
});

const stealSatelliteActionState = () => ({
    phase: "resolvingAction",
    mainActionChosen: true,
    statusText: "Steal a Satellite",
    interaction: { kind: "stealModule", actorIndex: 0, text: "", buttons: [], action: { kind: "stealModule", moduleName: "Satellite" } }
});

const lunarBaseGameWithPlayedModule = () => {
    const game = lunarBaseGame();
    return {
        ...game,
        version: 2,
        actionState: choosingMainActionState(),
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
