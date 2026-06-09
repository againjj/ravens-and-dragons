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

const lunarBaseGame = ({
    credits = 5,
    hand = [{ id: "module-1", type: "module", name: "Solar Lab", color: "blue", cardCost: ["blue", "yellow", "red", "gray", "red"], connectors: { topRight: "gray", bottomRight: "gray" }, colonists: 2, achievements: [3, 14] }]
}: { credits?: number; hand?: Array<Record<string, unknown>> } = {}) => ({
    id: "lunar-1",
    gameSlug: "lunar-base",
    version: 1,
    lifecycle: "active",
    config: { playerCount: 2, useInfluences: false },
    seats: [
        { userId: "player-1", displayName: "Ada" },
        { userId: "player-2", displayName: "Ben" }
    ],
    currentPlayerIndex: 0,
    players: [
        {
            orbs: { red: 0, blue: 0, yellow: 0, gray: 0 },
            credits,
            colonists: 0,
            achievements: 0,
            handCount: 1,
            influenceHandCount: 0,
            board: [{
                card: { id: "station-1", type: "station", name: "Station", connectors: { topLeft: "gray", bottomLeft: "gray" } },
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
                card: { id: "station-2", type: "station", name: "Station", connectors: { topLeft: "gray", bottomLeft: "gray" } },
                x: 0,
                y: 0,
                rotation: 0
            }]
        }
    ],
    supply: [],
    stockCount: 0,
    discardTop: null,
    discardCount: 0,
    message: null,
    viewer: {
        userId: "player-1",
        seatIndex: 0,
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
