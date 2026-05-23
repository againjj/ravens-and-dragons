import { describe, expect, it } from "vitest";
import { buildGameCreatePath } from "../../main/frontend/game-entry";

describe("platform game entry helpers", () => {
    it("builds slug-derived create paths", () => {
        expect(buildGameCreatePath("tic-tac-toe")).toBe("/tic-tac-toe/create");
        expect(buildGameCreatePath("ravens-and-dragons")).toBe("/ravens-and-dragons/create");
    });
});
