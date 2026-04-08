import type { ServerGameSession } from "../../main/frontend/game.js";

export const createSession = (
    overrides: Partial<ServerGameSession> = {},
    snapshotOverrides: Partial<ServerGameSession["snapshot"]> = {}
): ServerGameSession => ({
    id: "default",
    version: 1,
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T00:00:01Z",
    canUndo: false,
    availableRuleConfigurations: [
        {
            id: "free-play",
            name: "Free Play",
            descriptionSections: [
                {
                    heading: "Overview",
                    paragraphs: ["Free Play description"]
                }
            ],
            hasSetupPhase: true,
            hasManualCapture: true,
            hasManualEndGame: true
        },
        {
            id: "trivial",
            name: "Trivial",
            descriptionSections: [
                {
                    paragraphs: ["Trivial description"]
                }
            ],
            hasSetupPhase: false,
            hasManualCapture: false,
            hasManualEndGame: false
        },
        {
            id: "original-game",
            name: "Original Game",
            descriptionSections: [
                {
                    paragraphs: ["Original Game description"]
                }
            ],
            hasSetupPhase: false,
            hasManualCapture: false,
            hasManualEndGame: false
        }
    ],
    selectedRuleConfigurationId: "free-play",
    selectedStartingSide: "dragons",
    snapshot: {
        board: {},
        phase: "none",
        activeSide: "dragons",
        pendingMove: null,
        turns: [],
        ruleConfigurationId: "free-play",
        positionKeys: [],
        ...snapshotOverrides
    },
    ...overrides
});
