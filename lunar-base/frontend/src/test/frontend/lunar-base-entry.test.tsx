import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lunarBaseGameEntry } from "../../main/frontend/lunar-base-entry";

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
        const supplyButton = (await screen.findByText("Supply Rover")).closest("button");
        const hand = document.querySelector<HTMLElement>(".lunar-hand");
        expect(supplyButton).not.toBeNull();
        expect(hand).not.toBeNull();

        fireEvent.dragStart(supplyButton!, { dataTransfer });
        fireEvent.drop(hand!, { clientX: 210, clientY: 220, dataTransfer });

        await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            "/api/games/lunar-1/commands",
            expect.objectContaining({
                body: JSON.stringify({ type: "takeSupply", slotIndex: 0, expectedVersion: 1 })
            })
        ));
    });

    it("returns an invalid hand drag to the hand card rect", async () => {
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;
        const dataTransfer = dragDataTransfer();

        render(<PlayScreen />);
        const cardButton = (await screen.findByText("Solar Lab")).closest("button");
        const surface = document.querySelector<HTMLElement>(".lunar-table-surface");
        expect(cardButton).not.toBeNull();
        expect(surface).not.toBeNull();
        cardButton!.getBoundingClientRect = () => new DOMRect(30, 400, 84, 168);

        fireEvent.dragStart(cardButton!, { dataTransfer });
        const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperties(dropEvent, {
            clientX: { value: 300 },
            clientY: { value: 220 },
            dataTransfer: { value: dataTransfer }
        });
        fireEvent(surface!, dropEvent);

        const flyingCard = await screen.findByLabelText("return hand card to hand");
        expect(flyingCard).toHaveStyle({
            "--lunar-fly-from-x": "300px",
            "--lunar-fly-from-y": "220px",
            "--lunar-fly-to-x": "72px",
            "--lunar-fly-to-y": "484px"
        });
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
        const PlayScreen = lunarBaseGameEntry.components.PlayScreen;

        render(<PlayScreen />);
        const card = await screen.findByText("Solar Lab");
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

    it("normalizes a selected module back to zero rotation after a full spin", async () => {
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

const lunarBaseGame = ({
    credits = 5,
    hand = [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue", "yellow", "red", "gray", "red"], connectors: { topRight: "gray", bottomRight: "gray" }, colonists: 2, achievements: [3, 14] }],
    supply = [],
    currentPlayerIndex = 0,
    viewerSeat = 0,
    stationFlipped = false
}: { credits?: number; hand?: Array<Record<string, unknown>>; supply?: Array<Record<string, unknown> | null>; currentPlayerIndex?: number; viewerSeat?: number; stationFlipped?: boolean } = {}) => ({
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
            board: [{
                card: { id: "station-2", type: "station", name: "Terran Outpost", connectors: { topLeft: "gray", bottomLeft: "gray" }, stationBackName: "The Crater", stationBackOrbs: ["yellow", "gray"] },
                x: 0,
                y: 0,
                rotation: 0
            }]
        }
    ],
    supply,
    stockCount: 0,
    discardTop: null,
    discardCount: 0,
    message: null,
    viewer: {
        userId: `player-${viewerSeat + 1}`,
        seatIndex: viewerSeat,
        hand
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
