import assert from "node:assert/strict";
import test from "node:test";

import { clampSeconds, pickNext, reduce } from "../src/model/wander.js";
import { createWander } from "../src/view/features/wander.js";

test("clampSeconds bounds values to 3..15 with default 6", () => {
  assert.equal(clampSeconds(undefined), 6);
  assert.equal(clampSeconds(null), 6);
  assert.equal(clampSeconds(""), 6);
  assert.equal(clampSeconds("abc"), 6);
  assert.equal(clampSeconds(Number.NaN), 6);
  assert.equal(clampSeconds(1), 3);
  assert.equal(clampSeconds("2"), 3);
  assert.equal(clampSeconds(3), 3);
  assert.equal(clampSeconds("9.8"), 9);
  assert.equal(clampSeconds(15), 15);
  assert.equal(clampSeconds(42), 15);
  assert.equal(clampSeconds("99"), 15);
});

test("pickNext prefers unvisited candidates and returns null when exhausted", () => {
  const candidates = ["p1", "p2", "p3", "p2"];
  assert.equal(pickNext(candidates, ["p1"], () => 0), "p2");
  assert.equal(pickNext(candidates, ["p1"], () => 0.99), "p3");
  assert.equal(pickNext(candidates, ["p1", "p2", "p3"], () => 0), null);
  assert.equal(pickNext([], [], () => 0), null);
  assert.equal(pickNext(null, []), null);
});

test("reduce transitions cleanly between idle, playing and paused", () => {
  let state = reduce(undefined, "pause");
  assert.deepEqual(state, { mode: "idle", reason: null });
  assert.deepEqual(reduce(state, "manual"), { mode: "idle", reason: null });

  state = reduce(state, "start");
  assert.deepEqual(state, { mode: "playing", reason: null });

  state = reduce(state, "manual");
  assert.deepEqual(state, { mode: "paused", reason: null });

  state = reduce(state, "resume");
  assert.deepEqual(state, { mode: "playing", reason: null });

  state = reduce(state, "pause");
  assert.deepEqual(state, { mode: "paused", reason: null });

  state = reduce(state, "resume");
  assert.deepEqual(state, { mode: "playing", reason: null });

  state = reduce(state, "exhausted");
  assert.deepEqual(state, { mode: "paused", reason: "exhausted" });

  state = reduce(state, "resume");
  assert.deepEqual(state, { mode: "playing", reason: null });

  state = reduce(state, "stop");
  assert.deepEqual(state, { mode: "idle", reason: null });
});

test("createWander skips ineligible nodes, reports exhaustion, pauses on manual nav and restores Zen", () => {
  let zenOn = true;
  let statusText = "";
  const timers = [];
  let nextId = 1;
  let current = "c";

  const makeEl = (faded = false) => ({
    classList: {
      contains: (cls) => cls === "compass-fade" && faded,
      add() {},
      remove() {},
    },
  });

  const nodeEls = new Map([
    ["p-ok", makeEl(false)],
    ["p-faded", makeEl(true)],
    ["p-group", makeEl(false)],
    ["p-board", makeEl(false)],
    ["p-card", makeEl(false)],
  ]);

  const ctx = {
    state: {
      get current() { return current; },
      isOpen: true,
      settings: { wanderSeconds: 4 },
      geometry: {
        items: [
          { uid: "p-faded", zone: "south" },
          { uid: "p-group", zone: "south" },
          { uid: "p-board", zone: "west" },
          { uid: "p-card", zone: "south" },
          { uid: "p-ok", zone: "north" },
        ],
      },
      hood: {
        nodes: [
          { uid: "p-faded", kind: "page", style: "typed" },
          { uid: "p-group", kind: "group", style: "typed" },
          { uid: "p-board", kind: "block", style: "board" },
          { uid: "p-card", kind: "block", style: "card" },
          { uid: "p-ok", kind: "page", style: "typed" },
        ],
      },
      nodeEls,
    },
    features: {
      get(name) {
        if (name === "zen") {
          return {
            isZen: () => zenOn,
            setZen: (val) => { zenOn = Boolean(val); },
          };
        }
        return null;
      },
    },
    later(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, ms });
      return id;
    },
    cancel(id) {
      const idx = timers.findIndex((entry) => entry.id === id);
      if (idx >= 0) timers.splice(idx, 1);
      return null;
    },
    focusUid(uid) {
      current = uid;
      wander.onNavigate({ uid });
    },
    setStatus(msg) {
      statusText = msg;
    },
  };

  const wander = createWander(ctx);
  assert.equal(wander.commands()[0].title, "Wander");

  wander.start();
  assert.equal(wander.isActive(), true);
  assert.equal(wander.commands()[0].title, "Stop wandering");
  assert.equal(timers[0]?.ms, 4000);

  timers.shift().fn();
  assert.equal(timers[0]?.ms, 900);
  timers.shift().fn();
  assert.equal(current, "p-ok");

  timers.shift().fn();
  assert.equal(statusText, "Nowhere new from here. Pick a direction or press Play.");

  wander.start();
  wander.onNavigate({ uid: "p-manual" });
  assert.equal(timers.length, 0);

  assert.equal(wander.onEscape(), true);
  assert.equal(wander.isActive(), false);
  assert.equal(zenOn, true);
});
