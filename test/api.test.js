import assert from "node:assert/strict";
import test from "node:test";

import { installRoamCompass } from "../src/extension.js";
import {
  shapeCanvas,
  shapeCenter,
  shapeCommands,
  shapeNeighborhood,
  shapeOntology,
  shapeSearch,
  shapeTrail,
} from "../src/model/api.js";
import { buildNeighborhood, modelSettings } from "../src/model/neighborhood.js";
import { createFakeHost, createGraph } from "./harness/fixture.js";

test("shapeOntology builds roles, canonical pairs, hidden list, and typeAttribute from settings", () => {
  const defaults = shapeOntology({});
  assert.ok(defaults.roles.parent.includes("Parent"));
  assert.ok(defaults.roles.child.includes("Child"));
  assert.ok(defaults.roles.friend.includes("Friend"));
  assert.ok(defaults.roles.challenger.includes("Challenger"));
  assert.deepEqual(defaults.roles.previous, ["Previous"]);
  assert.deepEqual(defaults.roles.next, ["Next"]);
  assert.deepEqual(defaults.pairs, [
    ["Parent", "Child"],
    ["Previous", "Next"],
  ]);
  assert.deepEqual(defaults.hidden, ["Hidden"]);
  assert.equal(defaults.typeAttribute, "Type");

  const custom = shapeOntology({
    model: {
      parent: "Guide|Explains, Parent",
      child: "Child",
      friend: "Spouse|Spouse",
      challenger: "Opposes",
      previous: "Before|After",
      next: "Next",
      hidden: "Secret, Private",
    },
    typeAttribute: "  Kind  ",
  });
  assert.deepEqual(custom.roles.parent, ["Guide", "Parent"]);
  assert.deepEqual(custom.roles.child, ["Child", "Explains"]);
  assert.deepEqual(custom.roles.next, ["Next", "After"]);
  assert.deepEqual(custom.pairs, [
    ["Guide", "Explains"],
    ["Spouse", "Spouse"],
    ["Before", "After"],
    ["Parent", "Child"],
  ]);
  assert.deepEqual(custom.hidden, ["Secret", "Private"]);
  assert.equal(custom.typeAttribute, "Kind");
});

test("shapeNeighborhood trims center, nodes, evidence, overflow, and missing flag", () => {
  const graph = createGraph();
  const host = createFakeHost(graph);
  const settings = modelSettings({});
  const snap = host.snapshot("p-alpha", settings);
  const hood = buildNeighborhood(snap, settings);
  const shaped = shapeNeighborhood(hood, snap);

  assert.deepEqual(shaped.center, { uid: "p-alpha", kind: "page", title: "Project Alpha" });
  assert.equal(shaped.missing, false);
  const taskOne = shaped.nodes.find((node) => node.title === "Task One");
  assert.ok(taskOne);
  assert.deepEqual(Object.keys(taskOne), ["uid", "kind", "title", "role", "zone", "label", "evidence"]);
  assert.equal(taskOne.role, "child");
  assert.equal(taskOne.zone, "south");
  assert.ok(taskOne.evidence.length > 0);
  assert.deepEqual(Object.keys(taskOne.evidence[0]), ["kind", "attribute", "direction", "sourceUid"]);
  assert.equal("outline" in shaped, false);
  assert.equal("settings" in shaped, false);

  const missingSnap = host.snapshot("no-such-uid", settings);
  const missingHood = buildNeighborhood(missingSnap, settings);
  const missingShaped = shapeNeighborhood(missingHood, missingSnap);
  assert.equal(missingShaped.missing, true);
  assert.deepEqual(missingShaped.nodes, []);
  assert.deepEqual(missingShaped.center, { uid: "no-such-uid", kind: "page", title: "no-such-uid" });
});

test("shapeSearch, shapeTrail, shapeCanvas, shapeCommands, and shapeCenter normalize public shapes", () => {
  assert.equal(shapeCenter(null), null);
  assert.deepEqual(shapeCenter({ uid: "b1", kind: "block", title: "Line" }), {
    uid: "b1",
    kind: "block",
    title: "Line",
  });

  assert.deepEqual(
    shapeSearch([
      { uid: "p1", title: "Alpha", score: 100 },
      { uid: "", title: "Skip" },
      { uid: "p2" },
    ]),
    [
      { uid: "p1", title: "Alpha" },
      { uid: "p2", title: "p2" },
    ],
  );

  assert.deepEqual(
    shapeTrail([
      { uid: "p2", title: "Beta", kind: "page", at: 200, extra: true },
      { uid: "b1", title: "Block", kind: "block", at: 100 },
    ]),
    [
      { uid: "p2", title: "Beta", kind: "page", at: 200 },
      { uid: "b1", title: "Block", kind: "block", at: 100 },
    ],
  );

  assert.deepEqual(
    shapeCanvas({
      open: true,
      center: { uid: "p1", kind: "page", title: "Alpha", badges: [] },
      view: "invalid-view",
      preset: "  ",
      zen: 1,
      trail: [{ uid: "p1", title: "Alpha", kind: "page", at: 10 }],
    }),
    {
      open: true,
      center: { uid: "p1", kind: "page", title: "Alpha" },
      view: "compass",
      preset: "roles",
      zen: true,
      trail: [{ uid: "p1", title: "Alpha", kind: "page", at: 10 }],
    },
  );

  assert.deepEqual(
    shapeCommands([
      { id: "fit", title: "Fit to screen", hint: "", run: () => {} },
      { id: "fit", title: "Duplicate fit", hint: "X", run: () => {} },
      { id: "broken", title: "No runner" },
      { id: "blank", title: "   ", run: () => {} },
      { id: "help", title: "Keyboard help", hint: "Alt+?", run: () => {} },
    ]),
    [
      { id: "fit", title: "Fit to screen", hint: "" },
      { id: "help", title: "Keyboard help", hint: "Alt+?" },
    ],
  );
});

test("installRoamCompass exposes frozen v2 read API, runs commands, and catches errors", async () => {
  const graph = createGraph();
  const host = createFakeHost(graph);
  const store = new Map();
  const extensionAPI = {
    settings: {
      canSet: true,
      get: (key) => store.get(key) ?? null,
      set: async (key, val) => { store.set(key, val); },
    },
  };

  let activeView = "compass";
  let activePreset = "roles";
  let zen = false;
  let ranFit = 0;
  let shouldThrow = false;

  const overlay = {
    isOpen: () => {
      if (shouldThrow) throw new Error("isOpen boom");
      return true;
    },
    focusUid: () => {
      if (shouldThrow) throw new Error("focus boom");
    },
    hideResults: () => {},
    ctx: {
      state: {
        hood: { center: { uid: "p-alpha", kind: "page", title: "Project Alpha" } },
      },
      commands: () => {
        if (shouldThrow) throw new Error("commands boom");
        return [
          { id: "fit", title: "Fit to screen", hint: "", run: () => { ranFit += 1; } },
          { id: "fail", title: "Failing command", hint: "", run: async () => { throw new Error("run boom"); } },
        ];
      },
    },
    features: {
      get(name) {
        if (name === "views") {
          return {
            current: () => ({ view: activeView, preset: activePreset }),
            set: async (nextView, nextPreset) => {
              if (shouldThrow) throw new Error("setView boom");
              activeView = nextView;
              if (nextPreset) activePreset = nextPreset;
            },
          };
        }
        if (name === "zen") return { isZen: () => zen };
        if (name === "trail") {
          return {
            entries: () => {
              if (shouldThrow) throw new Error("trail boom");
              return [{ uid: "p-alpha", title: "Project Alpha", kind: "page", at: 42 }];
            },
          };
        }
        return null;
      },
    },
  };

  const win = {};
  const remove = installRoamCompass(win, { overlay, host, extensionAPI, version: "1.0.0" });
  const api = win.RoamCompass;

  assert.equal(Object.isFrozen(api), true);
  assert.equal(api.apiVersion, 2);
  assert.equal(api.version, "1.0.0");
  assert.equal(api.ontology().roles.parent.includes("Parent"), true);
  assert.equal(
    api.neighborhood("p-alpha").nodes.some((n) => n.title === "Task One" && n.role === "child"),
    true,
  );
  assert.equal(api.neighborhood("nope").missing, true);
  assert.equal(api.search("task").length >= 3, true);
  assert.deepEqual(api.trail(), [{ uid: "p-alpha", title: "Project Alpha", kind: "page", at: 42 }]);
  assert.deepEqual(await api.setView("mindmap"), {
    open: true,
    center: { uid: "p-alpha", kind: "page", title: "Project Alpha" },
    view: "mindmap",
    preset: "roles",
    zen: false,
    trail: [{ uid: "p-alpha", title: "Project Alpha", kind: "page", at: 42 }],
  });
  assert.equal(api.canvas().view, "mindmap");
  assert.equal(api.commands().length, 2);
  assert.equal(await api.run("fit"), true);
  assert.equal(ranFit, 1);
  assert.equal(await api.run("nope"), false);

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    assert.equal(await api.run("fail"), false);
    shouldThrow = true;
    host.snapshot = () => { throw new Error("snapshot boom"); };
    host.titles = () => { throw new Error("titles boom"); };
    extensionAPI.settings.get = () => { throw new Error("settings boom"); };

    api.focus("p-alpha");
    api.open("p-alpha");
    api.focusBlock("b1");
    assert.equal(api.isOpen(), false);
    assert.equal(api.ontology(), null);
    assert.equal(api.neighborhood("p-alpha"), null);
    assert.deepEqual(api.search("task"), []);
    assert.equal(api.canvas(), null);
    assert.equal(await api.setView("facets"), null);
    assert.deepEqual(api.trail(), []);
    assert.deepEqual(api.commands(), []);
    assert.equal(await api.run("fit"), false);
    assert.ok(errors.length >= 10);
    assert.equal(errors.every((entry) => entry[0] === "[compass]"), true);
  } finally {
    console.error = originalError;
    remove();
  }
  assert.equal(win.RoamCompass, undefined);
});

test("createMore populates floating menu in MORE_COMMAND_IDS order, skips absent commands, and navigates with arrows", async () => {
  const { createMore } = await import("../src/view/features/more.js");
  assert.equal(createMore(null).name, "more");

  let focused = null;
  const listeners = new Map();
  function makeEl(tag, className = "", text = "") {
    const el = {
      tag,
      className,
      textContent: text,
      dataset: {},
      attrs: {},
      hidden: false,
      children: [],
      isConnected: true,
      setAttribute(k, v) { el.attrs[k] = String(v); },
      getAttribute(k) { return el.attrs[k] ?? null; },
      getBoundingClientRect: () => ({ left: 820, bottom: 38, top: 10, right: 874, width: 54, height: 28 }),
      focus() { focused = el; },
      append(...kids) { el.children.push(...kids); },
      replaceChildren(...kids) { el.children = [...kids]; },
      contains(other) { return other === el || el.children.includes(other); },
      querySelectorAll(sel) {
        if (sel === ".compass-menu-item") return el.children.filter((c) => c.className.includes("compass-menu-item"));
        return [];
      },
      addEventListener(type, fn) {
        const list = listeners.get(el) ?? new Map();
        const arr = list.get(type) ?? [];
        arr.push(fn);
        list.set(type, arr);
        listeners.set(el, list);
      },
      dispatch(type, extra = {}) {
        const event = { type, preventDefault() {}, stopPropagation() {}, ...extra };
        for (const fn of listeners.get(el)?.get(type) ?? []) fn(event);
      },
    };
    return el;
  }

  const root = makeEl("div", "compass-root");
  const menu = makeEl("div", "compass-menu");
  menu.hidden = true;
  const barAdded = [];
  let zenToggled = 0;

  const ctx = {
    dom: { root, menu },
    button: (cls, text) => makeEl("button", cls, text),
    addBarButton: (btn) => { barAdded.push(btn); return btn; },
    hideFloating() {
      menu.hidden = true;
      menu.replaceChildren();
    },
    placeFloating(el) { el.hidden = false; },
    menuItem(title, run) {
      const item = makeEl("button", "compass-menu-item", title);
      item.run = run;
      menu.append(item);
      return item;
    },
    commands: () => [
      { id: "palette", title: "Command palette…", hint: "Alt+.", run: () => {} },
      { id: "zen", title: "Toggle Zen mode", hint: "", run: () => { zenToggled += 1; } },
      { id: "export-image", title: "Export image…", hint: "", run: () => {} },
      { id: "cross", title: "✓ Cross links", hint: "", run: () => {} },
      { id: "fit", title: "Fit to screen", hint: "", run: () => {} },
      { id: "back", title: "Back", hint: "Alt+Left", run: () => {} },
    ],
    lifecycle: {
      event(target, type, fn) { target.addEventListener(type, fn); },
      add() {},
    },
  };

  const prevDoc = globalThis.document;
  globalThis.document = { get activeElement() { return focused; } };
  try {
    const more = createMore(ctx);
    assert.equal(barAdded.length, 1);
    const moreBtn = barAdded[0];
    assert.equal(moreBtn.className, "compass-more");

    more.open();
    assert.equal(menu.hidden, false);
    assert.equal(moreBtn.getAttribute("aria-expanded"), "true");
    assert.deepEqual(
      menu.children.map((item) => item.textContent),
      ["Fit to screen", "✓ Cross links", "Export image…", "Toggle Zen mode", "Command palette…"],
    );
    assert.equal(focused, menu.children[0]);

    menu.dispatch("keydown", { key: "ArrowDown" });
    assert.equal(focused, menu.children[1]);
    menu.dispatch("keydown", { key: "End" });
    assert.equal(focused, menu.children[4]);
    menu.dispatch("keydown", { key: "Escape" });
    assert.equal(menu.hidden, true);
    assert.equal(moreBtn.getAttribute("aria-expanded"), "false");
    assert.equal(focused, moreBtn);

    more.toggle();
    const zenItem = menu.children.find((item) => item.textContent === "Toggle Zen mode");
    zenItem.run();
    assert.equal(zenToggled, 1);
    more.close();
    assert.equal(menu.hidden, true);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});
