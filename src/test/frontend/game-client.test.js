import assert from "node:assert/strict";
import test from "node:test";

import {
    defaultCommandErrorMessage,
    fetchGameSession,
    isSameServerGame,
    openGameStream,
    sendGameCommandRequest
} from "../../../build/generated/frontend/game-client.js";

const createGame = (version = 1) => ({
    id: "default",
    version,
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: `2026-04-05T00:00:0${version}Z`,
    snapshot: {
        board: { e5: "gold" },
        phase: "setup",
        activeSide: "dragons",
        pendingMove: null,
        turns: []
    }
});

test("fetchGameSession returns the parsed game payload", async () => {
    const game = createGame(1);
    const result = await fetchGameSession(async () => ({
        ok: true,
        json: async () => game
    }));

    assert.deepEqual(result, game);
});

test("sendGameCommandRequest includes the expected version and returns the next game", async () => {
    const currentGame = createGame(2);
    let requestBody = null;

    const result = await sendGameCommandRequest(
        currentGame,
        { type: "begin-game" },
        async (_url, init) => {
            requestBody = JSON.parse(init.body);
            return {
                ok: true,
                status: 200,
                json: async () => createGame(3)
            };
        }
    );

    assert.deepEqual(requestBody, { expectedVersion: 2, type: "begin-game" });
    assert.equal(result.game.version, 3);
    assert.equal(result.errorMessage, undefined);
});

test("sendGameCommandRequest treats conflicts as latest-game responses", async () => {
    const result = await sendGameCommandRequest(
        createGame(4),
        { type: "reset-game" },
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
        { type: "begin-game" },
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
        game: null
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
        () => fakeSource,
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
        (game) => {
            receivedGame = game;
        },
        () => {},
        () => {}
    );

    listeners.get("game")(new Event("game"));
    assert.equal(receivedGame, null);
});
