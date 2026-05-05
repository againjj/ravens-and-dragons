import { describe, expect, test } from "vitest";

import { CreateGameScreen } from "../../main/frontend/components/CreateGameScreen.js";
import { GameScreen } from "../../main/frontend/components/GameScreen.js";
import { ravensAndDragonsGameEntry } from "../../main/frontend/ravens-and-dragons-entry.js";

describe("ravensAndDragonsGameEntry", () => {
    test("describes the current frontend entry points and routes", () => {
        expect(ravensAndDragonsGameEntry.identity).toEqual({
            slug: "ravens-and-dragons",
            displayName: "Ravens and Dragons"
        });
        expect(ravensAndDragonsGameEntry.components.CreateScreen).toBe(CreateGameScreen);
        expect(ravensAndDragonsGameEntry.components.PlayScreen).toBe(GameScreen);
        expect(ravensAndDragonsGameEntry.routes.createPath).toBe("/create");
        expect(ravensAndDragonsGameEntry.routes.buildPlayPath(" CFGHJMP ")).toBe("/g/CFGHJMP");
        expect(ravensAndDragonsGameEntry.routes.matchPlayPath("/g/CFGHJMP")).toBe("CFGHJMP");
        expect(ravensAndDragonsGameEntry.routes.matchPlayPath("/g/not-a-game")).toBeNull();
    });
});
