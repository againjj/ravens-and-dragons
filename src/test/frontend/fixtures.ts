import type { ServerGameSession } from "../../main/frontend/game.js";

export const createSession = (
    overrides: Partial<ServerGameSession> = {},
    snapshotOverrides: Partial<ServerGameSession["snapshot"]> = {}
): ServerGameSession => ({
    id: "default",
    version: 1,
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T00:00:01Z",
    snapshot: {
        board: {
            e5: "gold"
        },
        phase: "setup",
        activeSide: "dragons",
        pendingMove: null,
        turns: [],
        ...snapshotOverrides
    },
    ...overrides
});
