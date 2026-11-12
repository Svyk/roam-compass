import assert from "node:assert/strict";
import test from "node:test";

import { SHORTCUTS, cycle, jump, matches, step } from "../src/model/keynav.js";
import { createKeys } from "../src/view/features/keys.js";
import { createPalette } from "../src/view/features/palette.js";
import { createZen } from "../src/view/features/zen.js";

const compassScene = [
  { uid: "c", zone: "center", x: 0, y: 0, w: 240, h: 80 },
  { uid: "n1", zone: "north", x: -194, y: -167, w: 180, h: 34 },
  { uid: "n2", zone: "north", x: 0, y: -167, w: 180, h: 34 },
  { uid: "n3", zone: "north", x: 194, y: -167, w: 180, h: 34 },
  { uid: "n4", zone: "north", x: 0, y: -121, w: 180, h: 34 },
  { uid: "s1", zone: "south", x: -291, y: 121, w: 180, h: 34 },
  { uid: "s2", zone: "south", x: -97, y: 121, w: 180, h: 34 },
  { uid: "s3", zone: "south", x: 97, y: 121, w: 180, h: 34 },
  { uid: "s4", zone: "south", x: 291, y: 121, w: 180, h: 34 },
  { uid: "s5", zone: "south", x: -97, y: 167, w: 180, h: 34 },
  { uid: "s6", zone: "south", x: 97, y: 167, w: 180, h: 34 },
  { uid: "w1", zone: "west", x: -282, y: -46, w: 180, h: 34 },
  { uid: "w2", zone: "west", x: -282, y: 0, w: 180, h: 34 },
  { uid: "w3", zone: "west", x: -282, y: 46, w: 180, h: 34 },
  { uid: "e1", zone: "east", x: 282, y: -23, w: 180, h: 34 },
  { uid: "e2", zone: "east", x: 282, y: 23, w: 180, h: 34 },
  { uid: "sib1", zone: "siblings", x: 621, y: -124, w: 148, h: 28 },
];

test("step from no selection or center picks nearest item in the 90-degree cone", () => {
  assert.equal(step(compassScene, null, "up"), "n4");
  assert.equal(step(compassScene, "c", "up"), "n4");
  assert.equal(step(compassScene, null, "down"), "s2");
  assert.equal(step(compassScene, "c", "left"), "n1");
  assert.equal(step(compassScene, "n1", "left"), "w1");
  assert.equal(step(compassScene, "c", "right"), "n3");
  assert.equal(step(compassScene, "n3", "right"), "e1");

  const compactLateral = [
    { uid: "c", zone: "center", x: 0, y: 0 },
    { uid: "n", zone: "north", x: 0, y: -120 },
    { uid: "s", zone: "south", x: 0, y: 120 },
    { uid: "w", zone: "west", x: -180, y: 0 },
    { uid: "e", zone: "east", x: 180, y: 0 },
  ];
  assert.equal(step(compactLateral, "c", "left"), "w");
  assert.equal(step(compactLateral, "c", "right"), "e");
});

test("step navigates rows and columns inside grids and lateral columns", () => {
  assert.equal(step(compassScene, "s1", "right"), "s2");
  assert.equal(step(compassScene, "s2", "right"), "s3");
  assert.equal(step(compassScene, "s3", "right"), "s4");
  assert.equal(step(compassScene, "s4", "left"), "s3");
  assert.equal(step(compassScene, "s2", "down"), "s5");
  assert.equal(step(compassScene, "s3", "down"), "s6");
  assert.equal(step(compassScene, "s5", "up"), "s2");

  assert.equal(step(compassScene, "w1", "down"), "w2");
  assert.equal(step(compassScene, "w2", "down"), "w3");
  assert.equal(step(compassScene, "w3", "up"), "w2");
});

test("step prefers same zone before crossing through the center to the opposite zone", () => {
  assert.equal(step(compassScene, "n2", "down"), "n4");
  assert.equal(step(compassScene, "n4", "down"), "c");
  assert.equal(step(compassScene, "c", "down"), "s2");
  assert.equal(step(compassScene, "s2", "up"), "c");
  assert.equal(step(compassScene, "c", "up"), "n4");

  assert.equal(step(compassScene, "w2", "right"), "c");
  assert.equal(step(compassScene, "e1", "left"), "c");
});

test("step returns null in empty directions and respects custom item keys", () => {
  const northOnly = [
    { key: "root", uid: "c", zone: "center", x: 0, y: 0 },
    { key: "k-n1", uid: "n1", zone: "north", x: -40, y: -120 },
    { key: "k-n2", uid: "n2", zone: "north", x: 40, y: -120 },
  ];
  assert.equal(step(northOnly, null, "down"), null);
  assert.equal(step(northOnly, "root", "left"), null);
  assert.equal(step(northOnly, "root", "right"), null);
  assert.equal(step(northOnly, "k-n1", "up"), null);
  assert.equal(step(northOnly, "k-n1", "left"), null);
  assert.equal(step(northOnly, "k-n2", "right"), null);
  assert.equal(step(northOnly, "k-n1", "right"), "k-n2");
  assert.equal(step([], null, "up"), null);
  assert.equal(step(northOnly, null, "diagonal"), null);
});

test("jump chooses nearest-to-center item in the area furthest in that direction", () => {
  assert.equal(jump(compassScene, "up"), "n4");
  assert.equal(jump(compassScene, "down"), "s2");
  assert.equal(jump(compassScene, "left"), "w2");
  assert.equal(jump(compassScene, "right"), "sib1");

  const withoutSiblings = compassScene.filter((item) => item.zone !== "siblings");
  assert.equal(jump(withoutSiblings, "right"), "e1");

  const verticalOnly = compassScene.filter((item) => item.zone === "center" || item.zone === "north");
  assert.equal(jump(verticalOnly, "down"), null);
  assert.equal(jump(verticalOnly, "left"), null);
  assert.equal(jump(verticalOnly, "right"), null);
});

test("matches orders hits top-to-bottom then left-to-right, ignoring case and keeping spaces", () => {
  const items = [
    { key: "b-right", uid: "1", zone: "south", x: 100, y: 120 },
    { key: "t-right", uid: "2", zone: "north", x: 80, y: -120 },
    { key: "t-left", uid: "3", zone: "north", x: -80, y: -120 },
    { key: "mid", uid: "4", zone: "west", x: -250, y: 0 },
    { key: "b-left", uid: "5", zone: "south", x: -100, y: 120 },
  ];
  const labels = new Map([
    ["b-right", "Task Three"],
    ["t-right", "Task Zero"],
    ["t-left", "Daily Task"],
    ["mid", "Taskforce"],
    ["b-left", "Task One"],
  ]);

  assert.deepEqual(matches(items, labels, "tas"), ["t-left", "t-right", "mid", "b-left", "b-right"]);
  assert.deepEqual(matches(items, labels, "TASK "), ["t-right", "b-left", "b-right"]);
  assert.deepEqual(matches(items, labels, " "), ["t-left", "t-right", "b-left", "b-right"]);
  assert.deepEqual(matches(items, labels, ""), []);
  assert.deepEqual(matches(items, labels, "missing"), []);
});

test("cycle wraps in both directions and falls back to the first key", () => {
  const keys = ["k1", "k2", "k3"];
  assert.equal(cycle(keys, "k1", 1), "k2");
  assert.equal(cycle(keys, "k3", 1), "k1");
  assert.equal(cycle(keys, "k1", -1), "k3");
  assert.equal(cycle(keys, "other", 1), "k1");
  assert.equal(cycle(keys, null, -1), "k1");
  assert.equal(cycle([], "k1", 1), null);
});

test("SHORTCUTS exposes the two expected groups including Arrow keys", () => {
  assert.ok(SHORTCUTS.length >= 10);
  const groups = new Set(SHORTCUTS.map((entry) => entry.group));
  assert.deepEqual(groups, new Set(["Move and select", "Actions"]));
  assert.ok(SHORTCUTS.some((entry) => entry.keys === "Arrow keys"));
});

test("createKeys handles shortcuts, flip-aware Ctrl/Cmd+Arrow, and Escape precedence", () => {
  const calls = [];
  let flipped = false;
  let scheduled = null;
  const centerEl = {
    dataset: { uid: "c" },
    classList: { contains: (cls) => cls === "compass-node-center" },
    querySelector: (sel) => (sel === ".compass-node-title" ? { textContent: "Alpha" } : null),
    focus() { calls.push(["focus", "c"]); },
  };
  const ctx = {
    state: {
      current: "c",
      get geometry() {
        return { flip: flipped, center: { x: 0, y: 0, w: 240, h: 80 }, items: [] };
      },
      hood: { center: { uid: "c", title: "Alpha" }, nodes: [] },
      nodeEls: new Map([["c", centerEl]]),
      isOpen: true,
    },
    dom: {
      searchInput: {
        focus() { calls.push(["searchFocus"]); },
        select() { calls.push(["searchSelect"]); },
      },
    },
    features: {
      get(name) {
        if (name === "pins") return { openPicker: () => calls.push(["openPicker"]) };
        if (name === "trail") return { toggle: () => calls.push(["toggleTrail"]) };
        if (name === "palette") return { open: () => calls.push(["openPalette"]) };
        return null;
      },
    },
    later(fn, ms) {
      scheduled = { fn, ms };
      return 1;
    },
    cancel() {
      scheduled = null;
      return null;
    },
    openZonePop(zone) { calls.push(["openZonePop", zone]); },
    togglePin(uid) { calls.push(["togglePin", uid]); },
    goBack() { calls.push(["goBack"]); },
    goForward() { calls.push(["goForward"]); },
  };

  const keys = createKeys(ctx);
  assert.equal(keys.name, "keys");
  assert.deepEqual(
    keys.commands().map(({ id, title, hint }) => ({ id, title, hint })),
    [
      { id: "keys-help", title: "Keyboard help", hint: "Alt+?" },
      { id: "select-center", title: "Select the center", hint: "Alt+0" },
    ],
  );

  assert.equal(keys.onKey({ key: "Tab" }), false);
  assert.equal(keys.onKey({ key: " " }), false);
  assert.equal(keys.onKey({ key: "ArrowLeft", altKey: true }), false);

  assert.equal(keys.onKey({ key: "ArrowLeft", ctrlKey: true }), true);
  assert.equal(keys.onKey({ key: "ArrowRight", metaKey: true }), true);
  flipped = true;
  assert.equal(keys.onKey({ key: "ArrowLeft", ctrlKey: true }), true);
  assert.equal(keys.onKey({ key: "ArrowRight", metaKey: true }), true);
  assert.deepEqual(calls, [
    ["openZonePop", "west"],
    ["openZonePop", "east"],
    ["openZonePop", "east"],
    ["openZonePop", "west"],
  ]);

  calls.length = 0;
  assert.equal(keys.onKey({ key: "÷", code: "Slash", altKey: true }), true);
  assert.equal(keys.onKey({ key: "≥", code: "Period", altKey: true }), true);
  assert.equal(keys.onKey({ key: "π", code: "KeyP", altKey: true }), true);
  assert.equal(keys.onKey({ key: "∫", code: "KeyB", altKey: true }), true);
  assert.equal(keys.onKey({ key: "˙", code: "KeyH", altKey: true }), true);
  assert.deepEqual(calls, [
    ["searchFocus"],
    ["searchSelect"],
    ["openPalette"],
    ["togglePin", "c"],
    ["openPicker"],
    ["toggleTrail"],
  ]);

  calls.length = 0;
  assert.equal(keys.onKey({ key: "z" }), false);
  assert.equal(keys.onKey({ key: "a" }), true);
  assert.deepEqual(calls, [["focus", "c"]]);
  assert.equal(scheduled?.ms, 4000);
  assert.equal(keys.onEscape(), true);
  assert.equal(keys.onEscape(), false);

  keys.help();
  assert.equal(keys.onEscape(), true);
  assert.equal(keys.onEscape(), false);
});

test("createZen exits Zen before Fullscreen on Escape and resets on close", () => {
  const classes = new Set();
  const zen = createZen({
    dom: {
      root: {
        classList: {
          toggle(name, force) {
            if (force) classes.add(name);
            else classes.delete(name);
          },
        },
      },
    },
  });

  assert.equal(zen.isZen(), false);
  zen.toggleZen();
  zen.toggleFull();
  assert.equal(zen.isZen(), true);
  assert.deepEqual([...classes].sort(), ["compass-full", "compass-zen"]);

  assert.equal(zen.onEscape(), true);
  assert.equal(zen.isZen(), false);
  assert.deepEqual([...classes], ["compass-full"]);

  assert.equal(zen.onEscape(), true);
  assert.deepEqual([...classes], []);
  assert.equal(zen.onEscape(), false);

  zen.setZen(true);
  zen.toggleFull();
  zen.onClose();
  assert.equal(zen.isZen(), false);
  assert.deepEqual([...classes], []);
});

test("createPalette exposes stageMenu and tolerates missing DOM", () => {
  let helpOpened = false;
  const palette = createPalette({
    features: {
      get(name) {
        if (name === "keys") return { help: () => { helpOpened = true; } };
        return null;
      },
    },
    commands: () => [
      { id: "dup", title: "First", run: () => {} },
      { id: "dup", title: "Second", run: () => {} },
      { id: "broken", title: "Broken" },
    ],
  });

  const menu = palette.stageMenu();
  assert.deepEqual(menu.map((item) => item.title), ["Command palette…", "Keyboard help"]);
  menu[1].run();
  assert.equal(helpOpened, true);
  palette.open();
  assert.equal(palette.onEscape(), true);
  assert.equal(palette.onEscape(), false);
});
