import type { AuthSessionResponse, GameViewResponse, ServerGameSession } from "../../main/frontend/game.js";

export const createSession = (
    overrides: Partial<ServerGameSession> = {},
    snapshotOverrides: Partial<ServerGameSession["snapshot"]> = {}
): ServerGameSession => ({
    id: "default",
    version: 1,
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T00:00:01Z",
    lifecycle: "new",
    canUndo: false,
    undoOwnerSide: null,
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
            name: "Trivial Configuration",
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
        },
        {
            id: "sherwood-rules",
            name: "Sherwood Rules",
            descriptionSections: [
                {
                    paragraphs: ["Sherwood Rules description"]
                }
            ],
            hasSetupPhase: false,
            hasManualCapture: false,
            hasManualEndGame: false
        },
        {
            id: "sherwood-x-9",
            name: "Sherwood x 9",
            descriptionSections: [
                {
                    paragraphs: ["Sherwood x 9 description"]
                }
            ],
            hasSetupPhase: false,
            hasManualCapture: false,
            hasManualEndGame: false
        }
    ],
    selectedRuleConfigurationId: "free-play",
    selectedStartingSide: "dragons",
    selectedBoardSize: 7,
    dragonsPlayerUserId: "player-dragons",
    ravensPlayerUserId: "player-ravens",
    createdByUserId: "player-dragons",
    snapshot: {
        board: {},
        boardSize: 7,
        specialSquare: "d4",
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

export const createAuthSession = (overrides: Partial<AuthSessionResponse> = {}): AuthSessionResponse => ({
    authenticated: true,
    user: {
        id: "player-dragons",
        displayName: "Dragon Player",
        authType: "local"
    },
    ...overrides
});

export const createGameView = (
    sessionOverrides: Partial<ServerGameSession> = {},
    snapshotOverrides: Partial<ServerGameSession["snapshot"]> = {},
    viewOverrides: Partial<GameViewResponse> = {}
): GameViewResponse => ({
    game: createSession(sessionOverrides, snapshotOverrides),
    currentUser: createAuthSession().user,
    dragonsPlayer: {
        id: "player-dragons",
        displayName: "Dragon Player"
    },
    ravensPlayer: {
        id: "player-ravens",
        displayName: "Raven Player"
    },
    viewerRole: "dragons",
    ...viewOverrides
});
