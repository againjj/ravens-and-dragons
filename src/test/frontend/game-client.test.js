import assert from "node:assert/strict";
import test from "node:test";

import {
    claimGameSide,
    createGameSession,
    fetchAuthSession,
    fetchGameView,
    defaultCommandErrorMessage,
    fetchGameSession,
    isSameServerGame,
    loginAsGuest,
    openGameStream,
    sendGameCommandRequest
} from "../../../build/generated/frontend-test/game-client.js";

const createGame = (version = 1) => ({
    id: "default",
    version,
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: `2026-04-05T00:00:0${version}Z`,
    lifecycle: "new",
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
        }
    ],
    selectedRuleConfigurationId: "free-play",
    selectedStartingSide: "dragons",
    selectedBoardSize: 7,
    dragonsPlayerUserId: "player-dragons",
    ravensPlayerUserId: "player-ravens",
    snapshot: {
        board: {},
        boardSize: 7,
        specialSquare: "d4",
        phase: "none",
        activeSide: "dragons",
        pendingMove: null,
        turns: [],
        ruleConfigurationId: "free-play",
        positionKeys: []
    }
});

const createGameView = (version = 1) => ({
    game: createGame(version),
    currentUser: {
        id: "player-dragons",
        displayName: "Dragon Player",
        authType: "local"
    },
    dragonsPlayer: {
        id: "player-dragons",
        displayName: "Dragon Player"
    },
    ravensPlayer: {
        id: "player-ravens",
        displayName: "Raven Player"
    },
    viewerRole: "dragons"
});

test("createGameSession posts to the multi-game endpoint and returns the created game", async () => {
    const game = createGame(1);
    const calls = [];

    const result = await createGameSession(
        {},
        async (url, init) => {
            calls.push({ url, init });
            return {
                ok: true,
                json: async () => ({ game })
            };
        }
    );

    assert.deepEqual(result, game);
    assert.equal(calls[0].url, "/api/games");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, "{}");
});

test("fetchGameSession returns the parsed game payload for a game id", async () => {
    const game = createGame(1);
    const calls = [];
    const result = await fetchGameSession("game-123", async (url) => {
        calls.push(url);
        return {
            ok: true,
            json: async () => game
        };
    });

    assert.deepEqual(result, game);
    assert.equal(calls[0], "/api/games/game-123");
});

test("fetchGameView returns auth-aware game metadata for a game id", async () => {
    const gameView = createGameView(2);
    const calls = [];

    const result = await fetchGameView("game-123", async (url) => {
        calls.push(url);
        return {
            ok: true,
            json: async () => gameView
        };
    });

    assert.deepEqual(result, gameView);
    assert.equal(calls[0], "/api/games/game-123/view");
});

test("fetchAuthSession returns the current auth session", async () => {
    const session = {
        authenticated: true,
        user: {
            id: "guest-1",
            displayName: "Guest 1",
            authType: "guest"
        }
    };

    const result = await fetchAuthSession(async () => ({
        ok: true,
        json: async () => session
    }));

    assert.deepEqual(result, session);
});

test("loginAsGuest returns an authenticated session shape", async () => {
    const result = await loginAsGuest(async (_url, init) => ({
        ok: true,
        json: async () => ({
            authenticated: true,
            user: {
                id: "guest-1",
                displayName: "Guest 1",
                authType: "guest"
            },
            oauthProviders: ["google"]
        }),
        status: 200,
        init
    }));

    assert.equal(result.authenticated, true);
    assert.equal(result.user.id, "guest-1");
    assert.deepEqual(result.oauthProviders, ["google"]);
});

test("sendGameCommandRequest includes the expected version and returns the next game", async () => {
    const currentGame = createGame(2);
    let requestBody = null;
    let requestUrl = null;

    const result = await sendGameCommandRequest(
        { ...currentGame, id: "game-77" },
        { type: "start-game" },
        async (url, init) => {
            requestUrl = url;
            requestBody = JSON.parse(init.body);
            return {
                ok: true,
                status: 200,
                json: async () => createGame(3)
            };
        }
    );

    assert.deepEqual(requestBody, { expectedVersion: 2, type: "start-game" });
    assert.equal(requestUrl, "/api/games/game-77/commands");
    assert.equal(result.game.version, 3);
    assert.equal(result.errorMessage, undefined);
});

test("sendGameCommandRequest includes rule configuration changes", async () => {
    const currentGame = createGame(2);
    let requestBody = null;

    await sendGameCommandRequest(
        currentGame,
        { type: "select-rule-configuration", ruleConfigurationId: "trivial" },
        async (_url, init) => {
            requestBody = JSON.parse(init.body);
            return {
                ok: true,
                status: 200,
                json: async () => createGame(3)
            };
        }
    );

    assert.deepEqual(requestBody, {
        expectedVersion: 2,
        type: "select-rule-configuration",
        ruleConfigurationId: "trivial"
    });
});

test("sendGameCommandRequest includes starting side changes", async () => {
    const currentGame = createGame(2);
    let requestBody = null;

    await sendGameCommandRequest(
        currentGame,
        { type: "select-starting-side", side: "ravens" },
        async (_url, init) => {
            requestBody = JSON.parse(init.body);
            return {
                ok: true,
                status: 200,
                json: async () => createGame(3)
            };
        }
    );

    assert.deepEqual(requestBody, {
        expectedVersion: 2,
        type: "select-starting-side",
        side: "ravens"
    });
});

test("sendGameCommandRequest treats conflicts as latest-game responses", async () => {
    const result = await sendGameCommandRequest(
        createGame(4),
        { type: "end-game" },
        async () => ({
            ok: false,
            status: 409,
            json: async () => createGame(5)
        })
    );

    assert.equal(result.game.version, 5);
    assert.equal(result.errorMessage, undefined);
});

test("sendGameCommandRequest returns a fallback message for non-json failures", async () => {
    const result = await sendGameCommandRequest(
        createGame(6),
        { type: "start-game" },
        async () => ({
            ok: false,
            status: 500,
            json: async () => {
                throw new Error("no json");
            }
        })
    );

    assert.equal(result.game, undefined);
    assert.equal(result.errorMessage, defaultCommandErrorMessage);
});

test("claimGameSide posts the selected side to the claim endpoint", async () => {
    let requestBody = null;
    let requestUrl = null;

    const result = await claimGameSide("game-77", { side: "dragons" }, async (url, init) => {
        requestUrl = url;
        requestBody = JSON.parse(init.body);
        return {
            ok: true,
            status: 200,
            json: async () => createGame(8)
        };
    });

    assert.equal(requestUrl, "/api/games/game-77/claim-side");
    assert.deepEqual(requestBody, { side: "dragons" });
    assert.equal(result.data.version, 8);
});

test("isSameServerGame only matches identical version and updatedAt values", () => {
    const game = createGame(7);

    assert.equal(isSameServerGame(game, { ...game }), true);
    assert.equal(isSameServerGame(game, { ...game, updatedAt: "2026-04-05T00:10:00Z" }), false);
    assert.equal(isSameServerGame(null, game), false);
});

test("openGameStream wires game, open, error, and close behavior", () => {
    const calls = {
        opened: 0,
        errored: 0,
        closed: 0,
        game: null,
        url: null
    };

    class FakeMessageEvent extends Event {
        constructor(data) {
            super("message");
            this.data = data;
        }
    }

    globalThis.MessageEvent = FakeMessageEvent;

    const listeners = new Map();
    const fakeSource = {
        onopen: null,
        onerror: null,
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        close() {
            calls.closed += 1;
        }
    };

    const stop = openGameStream(
        (url) => {
            calls.url = url;
            return fakeSource;
        },
        "game-42",
        (game) => {
            calls.game = game;
        },
        () => {
            calls.opened += 1;
        },
        () => {
            calls.errored += 1;
        }
    );

    fakeSource.onopen(new Event("open"));
    listeners.get("game")(new FakeMessageEvent(JSON.stringify(createGame(8))));
    fakeSource.onerror(new Event("error"));
    stop();

    assert.equal(calls.opened, 1);
    assert.equal(calls.errored, 1);
    assert.equal(calls.closed, 1);
    assert.equal(calls.url, "/api/games/game-42/stream");
    assert.equal(calls.game.version, 8);
});

test("openGameStream ignores non-message events for game updates", () => {
    let receivedGame = null;
    const listeners = new Map();
    const fakeSource = {
        onopen: null,
        onerror: null,
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        close() {}
    };

    openGameStream(
        () => fakeSource,
        "game-42",
        (game) => {
            receivedGame = game;
        },
        () => {},
        () => {}
    );

    listeners.get("game")(new Event("game"));
    assert.equal(receivedGame, null);
});
