import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Hand } from "../../main/frontend/Hand";
import { buildScoreSummary, canDiscardCardToPile, discardPileInteractionState, endActionButtonState, findArrangements } from "../../main/frontend/gin-rummy-rules";
import type { Card, Suit } from "../../main/frontend/gin-rummy-types";

type DragStore = Record<string, string>;

const cards = [
    { id: "A_spades", rank: "A", suit: "spades" as const },
    { id: "2_spades", rank: "2", suit: "spades" as const },
    { id: "3_spades", rank: "3", suit: "spades" as const },
    { id: "4_spades", rank: "4", suit: "spades" as const }
];

const card = (rank: string, suit: Suit): Card => ({ id: `${rank}_${suit}`, rank, suit });

const renderHand = (overrides: Partial<Parameters<typeof Hand>[0]> = {}) => {
    const props: Parameters<typeof Hand>[0] = {
        cards,
        count: cards.length,
        faceUp: true,
        position: "bottom",
        canDiscard: true,
        canDrawToHand: true,
        activeDragSource: null,
        interactive: true,
        onDiscard: vi.fn(),
        onDrawToHand: vi.fn(),
        onReorder: vi.fn(),
        onDragSourceChange: vi.fn(),
        onDragCardChange: vi.fn(),
        ...overrides
    };
    return {
        ...render(<Hand {...props} />),
        props
    };
};

const dragData = () => {
    const store: DragStore = {};
    return {
        setData: vi.fn((type: string, value: string) => {
            store[type] = value;
        }),
        getData: vi.fn((type: string) => store[type] ?? ""),
        setDragImage: vi.fn()
    };
};

const handCards = () =>
    screen.getByLabelText("bottom hand").querySelectorAll<HTMLButtonElement>(".gin-card-button:not(.gin-card-placeholder)");

const visibleHandCards = () =>
    Array.from(handCards()).filter((element) => !element.classList.contains("is-dragged"));

const renderedCardIds = () =>
    Array.from(screen.getByLabelText("bottom hand").querySelectorAll<HTMLElement>(".gin-card-button"))
        .filter((element) => !element.classList.contains("is-dragged"))
        .map((element) => element.dataset.cardId);

const mockSlotRects = (leftByCardId: Record<string, number>) =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const visibleSiblings = Array.from(this.parentElement?.querySelectorAll<HTMLElement>(".gin-card-button:not(.gin-card-placeholder):not(.is-dragged)") ?? []);
        const siblingIndex = visibleSiblings.indexOf(this);
        const left = leftByCardId[this.getAttribute("data-card-id") ?? ""] ?? (siblingIndex >= 0 ? siblingIndex * 40 : 0);
        return {
            x: left,
            y: 0,
            left,
            top: 0,
            right: left + 100,
            bottom: 140,
            width: 100,
            height: 140,
            toJSON: () => ({})
        };
    });

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("Gin Rummy hand dragging", () => {
    it("discards a hand card when it is clicked while discarding is legal", () => {
        const { props } = renderHand();

        fireEvent.click(handCards()[1], { clientX: 24, clientY: 32 });

        expect(props.onDiscard).toHaveBeenCalledWith("2_spades", 24, 32);
    });

    it("keeps the discard pile enabled as a drop target while discarding", () => {
        expect(discardPileInteractionState(true, "discard", true)).toMatchObject({
            canDrawDiscard: false,
            canDiscardToPile: true,
            disabled: false
        });
        expect(discardPileInteractionState(true, "discardOnly", false)).toMatchObject({
            canDrawDiscard: false,
            canDiscardToPile: true,
            disabled: false
        });
    });

    it("does not discard a card that was just drawn from the discard pile", () => {
        const { props } = renderHand({
            canDiscardCard: (cardId) => cardId !== "A_spades"
        });

        fireEvent.click(handCards()[0], { clientX: 24, clientY: 32 });

        expect(props.onDiscard).not.toHaveBeenCalled();
        expect(canDiscardCardToPile(true, "A_spades", "A_spades", null, new Set())).toBe(false);
        expect(canDiscardCardToPile(true, "2_spades", "A_spades", null, new Set())).toBe(true);
    });

    it("starts hand-card drags with a real card drag image and then shows the outline slot", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        const dataTransfer = dragData();
        const { props } = renderHand();
        const firstCard = handCards()[0];

        act(() => {
            fireEvent.dragStart(firstCard, { dataTransfer, clientX: 12, clientY: 18 });
        });

        expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "A_spades");
        expect(dataTransfer.setData).toHaveBeenCalledWith("application/x-gin-source", "hand");
        expect(dataTransfer.setDragImage).toHaveBeenCalledOnce();
        expect(dataTransfer.setDragImage.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
        expect(props.onDragSourceChange).toHaveBeenCalledWith("hand");
        expect(screen.getByLabelText("bottom hand").querySelector(".gin-card-placeholder")).not.toBeNull();
        expect(screen.getByLabelText("bottom hand").querySelector("[data-card-id='A_spades']")?.classList.contains("is-dragged")).toBe(true);
    });

    it("reorders a hand card when it is dropped over another hand slot", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        mockSlotRects({
            "2_spades": 0,
            "3_spades": 40,
            "4_spades": 80
        });
        const dataTransfer = dragData();
        const { props } = renderHand();

        act(() => {
            fireEvent.dragStart(handCards()[0], { dataTransfer, clientX: 10, clientY: 10 });
        });
        act(() => {
            fireEvent.dragOver(visibleHandCards()[1], { dataTransfer, clientX: 75, clientY: 10 });
        });
        act(() => {
            fireEvent.drop(visibleHandCards()[1], { dataTransfer, clientX: 75, clientY: 10 });
        });

        expect(props.onReorder).toHaveBeenCalledWith(["2_spades", "3_spades", "4_spades", "A_spades"]);
    });

    it("places the rearrange outline at the rightward insertion point", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        mockSlotRects({
            "2_spades": 0,
            "3_spades": 40,
            "4_spades": 80
        });
        const dataTransfer = dragData();
        renderHand();

        act(() => {
            fireEvent.dragStart(handCards()[0], { dataTransfer, clientX: 10, clientY: 10 });
        });
        act(() => {
            fireEvent.dragOver(visibleHandCards()[1], { dataTransfer, clientX: 75, clientY: 10 });
        });

        expect(renderedCardIds()).toEqual(["2_spades", "3_spades", "4_spades", "hand-placeholder"]);
    });

    it("keeps the rearrange outline open when the cursor is over the outline gap", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        mockSlotRects({
            "2_spades": 0,
            "3_spades": 40,
            "4_spades": 80
        });
        const dataTransfer = dragData();
        renderHand();

        act(() => {
            fireEvent.dragStart(handCards()[0], { dataTransfer, clientX: 10, clientY: 10 });
        });
        act(() => {
            fireEvent.dragOver(visibleHandCards()[1], { dataTransfer, clientX: 95, clientY: 10 });
        });
        const beforeGapHover = renderedCardIds();
        act(() => {
            fireEvent.dragOver(screen.getByLabelText("bottom hand"), { dataTransfer, clientX: 95, clientY: 10 });
        });

        expect(renderedCardIds()).toEqual(beforeGapHover);
        expect(beforeGapHover[0]).not.toBe("hand-placeholder");
    });

    it("keeps the rearrange outline stable in the far-right insertion slot", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        mockSlotRects({
            "2_spades": 0,
            "3_spades": 40,
            "4_spades": 80
        });
        const dataTransfer = dragData();
        renderHand();

        act(() => {
            fireEvent.dragStart(handCards()[0], { dataTransfer, clientX: 10, clientY: 10 });
        });
        act(() => {
            fireEvent.dragOver(visibleHandCards()[2], { dataTransfer, clientX: 115, clientY: 10 });
        });
        const farRightOrder = renderedCardIds();
        act(() => {
            fireEvent.dragOver(screen.getByLabelText("bottom hand"), { dataTransfer, clientX: 115, clientY: 10 });
        });

        expect(farRightOrder).toEqual(["2_spades", "3_spades", "4_spades", "hand-placeholder"]);
        expect(renderedCardIds()).toEqual(farRightOrder);
    });

    it("keeps the far-right outline stable when the cursor returns over the last card edge", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        mockSlotRects({
            "2_spades": 0,
            "3_spades": 40,
            "4_spades": 80
        });
        const dataTransfer = dragData();
        renderHand();

        act(() => {
            fireEvent.dragStart(handCards()[0], { dataTransfer, clientX: 10, clientY: 10 });
        });
        act(() => {
            fireEvent.dragOver(visibleHandCards()[2], { dataTransfer, clientX: 115, clientY: 10 });
        });
        act(() => {
            fireEvent.dragOver(visibleHandCards()[2], { dataTransfer, clientX: 85, clientY: 10 });
        });

        expect(renderedCardIds()).toEqual(["2_spades", "3_spades", "4_spades", "hand-placeholder"]);
    });
});

describe("Gin Rummy scoring summary", () => {
    it("labels a doubled shutout score instead of showing a vague score adjustment", () => {
        const game = {
            currentSeat: 1,
            seats: [
                { userId: "u1", displayName: "JJ" },
                { userId: "u2", displayName: "Guest 500F2F" }
            ]
        } as Parameters<typeof buildScoreSummary>[0];
        const result = {
            winnerSeat: 1,
            points: 64,
            reason: "Gin",
            gameNumber: 1,
            roundNumber: 1,
            knockerSeat: 1,
            knockerDeadwood: 0,
            defenderDeadwood: 7,
            selectedMelds: [],
            selectedDeadwood: [],
            defenderMelds: [],
            defenderDeadwoodCards: [],
            layoffs: [],
            scoreLines: []
        } as Parameters<typeof buildScoreSummary>[1];

        const summary = buildScoreSummary(game, result, 1, 0);

        expect(summary.lines).toContainEqual({ label: "Guest 500F2F Shutout double:", value: 32 });
        expect(summary.lines.some((line) => line.label.includes("Score adjustment"))).toBe(false);
    });
});

describe("Gin Rummy meld arrangements", () => {
    it("prunes split runs dominated by a longer run using the same cards", () => {
        const arrangements = findArrangements([
            card("6", "hearts"),
            card("7", "hearts"),
            card("8", "hearts"),
            card("9", "hearts"),
            card("10", "hearts"),
            card("J", "hearts"),
            card("A", "diamonds"),
            card("2", "diamonds"),
            card("3", "diamonds"),
            card("7", "clubs")
        ], false);

        expect(arrangements).toEqual(expect.arrayContaining([
            expect.objectContaining({
                deadwoodScore: 7,
                melds: expect.arrayContaining([
                    ["6_hearts", "7_hearts", "8_hearts", "9_hearts", "10_hearts", "J_hearts"],
                    ["A_diamonds", "2_diamonds", "3_diamonds"]
                ])
            })
        ]));
        expect(arrangements).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                deadwoodScore: 7,
                melds: expect.arrayContaining([
                    ["6_hearts", "7_hearts", "8_hearts"],
                    ["9_hearts", "10_hearts", "J_hearts"]
                ])
            })
        ]));
    });

    it("prunes arrangements whose meld cards are a strict subset of a longer run", () => {
        const arrangements = findArrangements([
            card("2", "hearts"),
            card("3", "hearts"),
            card("4", "hearts"),
            card("5", "hearts"),
            card("6", "hearts"),
            card("7", "hearts"),
            card("8", "hearts"),
            card("A", "diamonds"),
            card("2", "diamonds"),
            card("A", "clubs")
        ], false);

        expect(arrangements).toEqual(expect.arrayContaining([
            expect.objectContaining({
                deadwoodScore: 4,
                melds: expect.arrayContaining([
                    ["2_hearts", "3_hearts", "4_hearts", "5_hearts", "6_hearts", "7_hearts", "8_hearts"]
                ])
            })
        ]));
        expect(arrangements).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                deadwoodScore: 9,
                melds: expect.arrayContaining([
                    ["2_hearts", "3_hearts", "4_hearts"],
                    ["6_hearts", "7_hearts", "8_hearts"]
                ])
            })
        ]));
    });
});

describe("Gin Rummy end action buttons", () => {
    it("disables every end action after one choice is pending", () => {
        expect(endActionButtonState("knock", "knock", false)).toEqual({
            selected: true,
            disabled: true
        });
        expect(endActionButtonState("gin", "knock", false)).toEqual({
            selected: false,
            disabled: true
        });
        expect(endActionButtonState("bigGin", null, true)).toEqual({
            selected: false,
            disabled: true
        });
    });
});
