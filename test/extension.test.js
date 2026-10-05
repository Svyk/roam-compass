import assert from "node:assert/strict";
import test from "node:test";

import { showBoardPlan } from "../src/model/boards.js";
import extension from "../src/extension.js";

const SETTING_IDS = [
  "compass-north",
  "compass-south",
  "compass-west",
  "compass-east",
  "compass-previous",
  "compass-next",
  "compass-hidden",
  "compass-links",
  "compass-siblings",
  "compass-badges",
  "compass-sidecar",
  "compass-outline",
  "compass-drawings",
  "compass-boards",
  "compass-follow",
  "compass-related-drawings",
  "compass-max-zone",
  "compass-pins",
  "compass-sort",
  "compass-cross-links",
];

const SWITCH_IDS = [
  "compass-links",
  "compass-siblings",
  "compass-badges",
  "compass-sidecar",
  "compass-outline",
  "compass-drawings",
  "compass-boards",
  "compass-follow",
  "compass-related-drawings",
  "compass-cross-links",
];

function versionHost() {
  return globalThis.window ?? globalThis;
}

function fakeExtensionApi() {
  const values = new Map();
  const calls = [];
  const api = {
    calls,
    commands: [],
    command: null,
    panel: null,
    settings: {
      canSet: true,
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
        calls.push(["setting:set", key, value]);
        return null;
      },
      panel: {
        create: async (config) => {
          calls.push(["panel:create", config.tabTitle]);
          api.panel = config;
          return null;
        },
      },
    },
    ui: {
      commandPalette: {
        addCommand: async (config) => {
          calls.push(["command:add", config.label]);
          api.commands.push(config);
          api.command = config;
          return null;
        },
        removeCommand: async ({ label }) => {
          calls.push(["command:remove", label]);
          return null;
        },
      },
    },
  };
  return api;
}

function installRoam(calls) {
  const menu = {
    command: null,
    addCommand: async (config) => {
      calls.push(["menu:add", config.label]);
      menu.command = config;
      return null;
    },
    removeCommand: async ({ label }) => {
      calls.push(["menu:remove", label]);
      return null;
    },
  };
  globalThis.roamAlphaAPI = {
    graph: { name: "compass-test" },
    ui: {
      blockContextMenu: menu,
      getFocusedBlock: () => null,
      mainWindow: {
        getOpenPageOrBlockUid: async () => null,
        openPage: async () => null,
        openBlock: async () => null,
      },
      rightSidebar: {
        addWindow: async () => null,
        removeWindow: async () => null,
        getWindows: () => [],
      },
    },
    data: {
      pull: () => null,
      q: () => [],
      addPullWatch() {},
      removePullWatch() {},
      block: {
        create: async () => {},
        update: async () => {},
        delete: async () => {},
      },
      page: { create: async () => {} },
    },
  };
  return menu;
}

test("extension exports the Roam lifecycle contract and survives repeated unload", async () => {
  const api = fakeExtensionApi();
  const menu = installRoam(api.calls);
  const lines = [];
  const events = [];
  const originalInfo = console.info;
  const priorDispatch = globalThis.dispatchEvent;
  const priorCustom = globalThis.CustomEvent;
  console.info = (...parts) => {
    lines.push(parts.map(String).join(" "));
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.dispatchEvent = (event) => {
    events.push(event.type);
    return true;
  };
  try {
    const cleanup = await extension.onload({ extensionAPI: api, extension: { version: "test" } });
    const compass = versionHost().RoamCompass;
    assert.equal(typeof compass?.isAvailable, "function");
    assert.equal(compass.isAvailable(), true);
    assert.equal(typeof compass.focus, "function");
    assert.equal(compass.apiVersion, 1);
    assert.equal(typeof compass.open, "function");
    assert.equal(typeof compass.focusBlock, "function");
    assert.equal(typeof compass.isOpen, "function");
    assert.equal(compass.isOpen(), false);
    assert.equal(Object.isFrozen(compass), true);
    compass.focus("block-x");
    compass.open("block-x");
    compass.focusBlock("block-y");
    assert.ok(events.includes("roam-compass:ready"));
    assert.equal(typeof cleanup, "function");
    assert.equal(versionHost().__ROAM_COMPASS_VERSION, "test");
    assert.equal(api.settings.get("compass-north"), "Parent, Up, Part of, Is a, Type, Category, Project, BT_attrProject");
    assert.equal(api.settings.get("compass-south"), "Child, Has part, Contains");
    assert.equal(api.settings.get("compass-west"), "Friend, Related, See also");
    assert.equal(api.settings.get("compass-east"), "Challenger, Opposes, Contradicts");
    assert.equal(api.settings.get("compass-previous"), "Previous");
    assert.equal(api.settings.get("compass-next"), "Next");
    assert.equal(api.settings.get("compass-hidden"), "Hidden");
    assert.equal(api.settings.get("compass-links"), true);
    assert.equal(api.settings.get("compass-siblings"), true);
    assert.equal(api.settings.get("compass-badges"), true);
    assert.equal(api.settings.get("compass-sidecar"), true);
    assert.equal(api.settings.get("compass-outline"), false);
    assert.equal(api.settings.get("compass-follow"), false);
    assert.equal(api.settings.get("compass-related-drawings"), true);
    assert.equal(api.settings.get("compass-boards"), true);
    assert.equal(api.settings.get("compass-max-zone"), "12");
    assert.deepEqual(api.settings.get("compass-pins"), []);
    assert.deepEqual(api.panel.settings.map((row) => row.id), SETTING_IDS);
    for (const row of api.panel.settings) {
      const type = row.id === "compass-sort" ? "select" : SWITCH_IDS.includes(row.id) ? "switch" : "input";
      assert.equal(row.action.type, type);
    }
    await api.panel.settings.find((row) => row.id === "compass-outline").action.onChange({
      target: { checked: true },
    });
    await api.panel.settings.find((row) => row.id === "compass-north").action.onChange({
      target: { value: "Mother" },
    });
    assert.equal(api.settings.get("compass-outline"), true);
    assert.equal(api.settings.get("compass-north"), "Mother");
    for (const command of api.commands) command.callback();
    menu.command.callback({ "block-uid": "block-1" });
    await cleanup();
    assert.equal(versionHost().__ROAM_COMPASS_VERSION, undefined);
    assert.equal(versionHost().RoamCompass, undefined);
    assert.ok(events.includes("roam-compass:unload"));
    await extension.onunload();
    await extension.onunload();
  } finally {
    console.info = originalInfo;
    if (priorDispatch === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = priorDispatch;
    if (priorCustom === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = priorCustom;
    delete globalThis.roamAlphaAPI;
    await extension.onunload();
  }

  const names = api.calls.map(([name]) => name);
  assert.ok(names.indexOf("setting:set") < names.indexOf("panel:create"));
  assert.ok(names.indexOf("panel:create") < names.indexOf("command:add"));
  assert.deepEqual(
    api.calls.filter(([name]) => name === "command:add").map(([, label]) => label),
    ["Compass: Open", "Compass: Focus page", "Compass: Focus block"],
  );
  assert.equal(api.calls.filter(([name]) => name === "command:remove").length, 3);
  assert.deepEqual(
    api.calls.filter(([name]) => name === "menu:add").map(([, label]) => label),
    ["Compass: Focus block"],
  );
  assert.equal(api.calls.filter(([name]) => name === "menu:remove").length, 1);
  assert.equal(api.panel.tabTitle, "Compass");
  assert.ok(lines.includes("[compass] Loaded vtest"));
  assert.ok(lines.includes("[compass] Unloaded"));
});

test("a second load disposes the previous runtime before registering again", async () => {
  const firstApi = fakeExtensionApi();
  const secondApi = fakeExtensionApi();
  const menuCalls = [];
  installRoam(menuCalls);

  try {
    await extension.onload({ extensionAPI: firstApi, extension: { version: "one" } });
    const cleanup = await extension.onload({ extensionAPI: secondApi, extension: { version: "two" } });

    assert.equal(versionHost().__ROAM_COMPASS_VERSION, "two");
    assert.equal(firstApi.calls.filter(([name]) => name === "command:remove").length, 3);
    assert.equal(secondApi.calls.filter(([name]) => name === "command:add").length, 3);
    assert.equal(menuCalls.filter(([name]) => name === "menu:add").length, 2);
    assert.equal(menuCalls.filter(([name]) => name === "menu:remove").length, 1);
    await cleanup();
    assert.equal(versionHost().__ROAM_COMPASS_VERSION, undefined);
  } finally {
    delete globalThis.roamAlphaAPI;
    await extension.onunload();
  }
});

test("unload deletes RoamCompass only while it is still this object", async () => {
  const api = fakeExtensionApi();
  installRoam(api.calls);
  const events = [];
  const priorDispatch = globalThis.dispatchEvent;
  const priorCustom = globalThis.CustomEvent;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.dispatchEvent = (event) => {
    events.push(event.type);
    return true;
  };
  try {
    const cleanup = await extension.onload({ extensionAPI: api, extension: { version: "foreign" } });
    const foreign = Object.freeze({ apiVersion: 9 });
    versionHost().RoamCompass = foreign;
    await cleanup();
    assert.equal(versionHost().RoamCompass, foreign);
    assert.ok(events.includes("roam-compass:ready"));
    assert.ok(events.includes("roam-compass:unload"));
    delete versionHost().RoamCompass;
  } finally {
    if (priorDispatch === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = priorDispatch;
    if (priorCustom === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = priorCustom;
    delete globalThis.roamAlphaAPI;
    await extension.onunload();
  }
});

function classNames(node) {
  return new Set(String(node.className || "").split(/\s+/).filter(Boolean));
}

function matchesOne(node, selector) {
  let rest = selector;
  if (!rest.startsWith(".") && !rest.startsWith("[")) {
    const tag = rest.split(/[.[\\]/)[0];
    if (tag && node.tag !== tag) return false;
    rest = rest.slice(tag.length);
  }
  while (rest.startsWith(".")) {
    const body = rest.slice(1);
    const next = body.search(/[.[\\]/);
    const name = next === -1 ? body : body.slice(0, next);
    if (!classNames(node).has(name)) return false;
    rest = next === -1 ? "" : body.slice(next);
  }
  if (rest.startsWith("[data-uid]")) {
    return node.dataset?.uid != null && String(node.dataset.uid) !== "";
  }
  return rest === "";
}

function matches(node, selector) {
  return String(selector || "").split(",").some((part) => matchesOne(node, part.trim()));
}

function listen(target) {
  const map = new Map();
  target._listeners = map;
  target.addEventListener = (type, fn) => {
    const list = map.get(type) ?? [];
    list.push(fn);
    map.set(type, list);
  };
  target.removeEventListener = (type, fn) => {
    const list = map.get(type);
    if (!list) return;
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  };
  target.dispatchEvent = (event) => {
    const currentEvent = event ?? {};
    try {
      if (!currentEvent.target) currentEvent.target = target;
    } catch {
      // A native Event exposes target as a getter.
    }
    let stopped = false;
    const stop = currentEvent.stopPropagation?.bind(currentEvent);
    currentEvent.stopPropagation = () => {
      stopped = true;
      if (typeof stop === "function") stop();
    };
    let current = target;
    while (current) {
      const list = current._listeners?.get(currentEvent.type) ?? [];
      for (const fn of [...list]) fn(currentEvent);
      if (stopped) break;
      current = current.parentElement ?? null;
    }
    return true;
  };
}

function installDocument() {
  function make(tag) {
    const node = {
      tag,
      className: "",
      children: [],
      dataset: {},
      attrs: {},
      style: {},
      hidden: false,
      value: "",
      textContent: "",
      parentElement: null,
      parentNode: null,
      offsetWidth: 240,
      offsetHeight: 160,
    };
    node.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
    });
    node.style.setProperty = (name, value) => {
      node.style[name] = value;
    };
    node.classList = {
      contains: (name) => classNames(node).has(name),
      add: (...names) => {
        const set = classNames(node);
        for (const name of names) set.add(name);
        node.className = [...set].join(" ");
      },
      remove: (...names) => {
        const drop = new Set(names);
        node.className = [...classNames(node)].filter((name) => !drop.has(name)).join(" ");
      },
      toggle: (name, force) => {
        const has = classNames(node).has(name);
        const next = force === undefined ? !has : Boolean(force);
        if (next) node.classList.add(name);
        else node.classList.remove(name);
        return next;
      },
    };
    node.setAttribute = (name, value) => {
      node.attrs[name] = String(value);
      if (name === "class") node.className = String(value);
    };
    node.getAttribute = (name) => (Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null);
    node.removeAttribute = (name) => {
      delete node.attrs[name];
    };
    node.append = (...kids) => {
      for (const kid of kids) {
        if (kid?.parentElement) kid.remove();
        kid.parentElement = node;
        kid.parentNode = node;
        node.children.push(kid);
      }
    };
    node.prepend = (...kids) => {
      for (const kid of [...kids].reverse()) node.append(kid);
      const moved = kids.filter(Boolean);
      node.children = [...moved, ...node.children.filter((kid) => !moved.includes(kid))];
    };
    node.replaceChildren = (...kids) => {
      for (const kid of [...node.children]) kid.remove();
      if (kids.length) node.append(...kids);
    };
    node.remove = () => {
      const parent = node.parentElement;
      if (!parent) return;
      parent.children = parent.children.filter((kid) => kid !== node);
      node.parentElement = null;
      node.parentNode = null;
    };
    node.querySelectorAll = (selector) => {
      const out = [];
      const walk = (current) => {
        for (const child of current.children || []) {
          if (matches(child, selector)) out.push(child);
          walk(child);
        }
      };
      walk(node);
      return out;
    };
    node.querySelector = (selector) => node.querySelectorAll(selector)[0] ?? null;
    node.closest = (selector) => {
      let current = node;
      while (current) {
        if (current.tag && matches(current, selector)) return current;
        current = current.parentElement ?? null;
      }
      return null;
    };
    node.contains = (other) => {
      let current = other;
      while (current) {
        if (current === node) return true;
        current = current.parentElement ?? null;
      }
      return false;
    };
    node.focus = () => {};
    node.click = () => node.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
    Object.defineProperty(node, "isConnected", {
      get() {
        let current = node;
        while (current) {
          if (current === doc || current === doc.body || current === doc.documentElement) return true;
          current = current.parentElement ?? null;
        }
        return false;
      },
    });
    listen(node);
    return node;
  }

  const doc = make("document");
  const documentElement = make("html");
  const body = make("body");
  doc.append(documentElement);
  documentElement.append(body);
  doc.documentElement = documentElement;
  doc.body = body;
  doc.createElement = (tag) => make(tag);
  doc.createElementNS = (_namespace, tag) => make(tag);
  doc.getElementById = () => null;
  return doc;
}

test("open hides Find a page and Show on board uses the shipped plan", async () => {
  const api = fakeExtensionApi();
  installRoam(api.calls);
  const windows = [];
  globalThis.roamAlphaAPI.ui.rightSidebar.addWindow = async (entry) => {
    windows.push(entry);
    return null;
  };
  globalThis.roamAlphaAPI.data.q = () => [["recent-page", "Recent Page", 10, 1]];
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousComputed = globalThis.getComputedStyle;
  const previousAdd = globalThis.addEventListener;
  const previousRemove = globalThis.removeEventListener;
  const previousDispatch = globalThis.dispatchEvent;
  const doc = installDocument();
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.getComputedStyle = () => ({ backgroundColor: "rgb(255, 255, 255)", color: "rgb(0, 0, 0)" });
  listen(globalThis);
  let boards = [];
  const opened = [];
  globalThis.PlexusDiagram = {
    boardsWith() {
      return boards;
    },
    cardsOf() {
      return [{ uid: "card-node", title: "Card", kind: "page" }];
    },
    open(uid, opts) {
      opened.push([uid, opts]);
    },
  };
  const menuButtons = () => [...doc.querySelectorAll(".compass-menu-item")];
  const buttonText = () => menuButtons().map((item) => item.textContent);
  const fire = (node, type) => node.dispatchEvent({
    type,
    clientX: 12,
    clientY: 16,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
  });
  const clickText = (text) => {
    const item = menuButtons().find((button) => button.textContent === text);
    assert.ok(item, text);
    fire(item, "click");
  };
  try {
    await extension.onload({ extensionAPI: api, extension: { version: "eco-6" } });
    const compass = versionHost().RoamCompass;
    assert.equal(Object.isFrozen(compass), true);
    assert.equal(compass.apiVersion, 1);
    assert.equal(compass.isOpen(), false);
    compass.focus("page-1");
    const results = doc.querySelector(".compass-results");
    assert.equal(results.hidden, false);
    assert.ok(results.children.length > 0);
    compass.open("page-1");
    assert.equal(compass.isOpen(), true);
    assert.equal(results.hidden, true);
    assert.equal(results.children.length, 0);
    compass.focusBlock("block-9");
    const centerNow = () => [...doc.querySelectorAll(".compass-node")].find((node) => node.classList.contains("compass-node-center"));
    assert.equal(centerNow().dataset.uid, "block-9");
    assert.equal(results.hidden, false);
    await api.settings.set("compass-sidecar", false);
    windows.length = 0;
    compass.open("page-a");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(windows, []);
    compass.open("page-b", { sidecar: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(windows.length, 1);
    assert.equal(windows[0].window["block-uid"], "page-b");
    boards = [];
    fire(centerNow(), "contextmenu");
    assert.equal(buttonText().includes("Show on board…"), false);
    const one = { uid: "board-1", title: "One", page: "page-1", card: "card-9" };
    const onePlan = showBoardPlan([one]);
    assert.equal(onePlan.mode, "open");
    boards = [one];
    opened.length = 0;
    fire(centerNow(), "contextmenu");
    clickText("Show on board…");
    assert.deepEqual(opened, [[onePlan.board.uid, { card: onePlan.board.card }]]);
    assert.notEqual(onePlan.board.card, onePlan.board.page);
    const many = [
      { uid: "b1", title: "Alpha", page: "page-1", card: "card-9" },
      { uid: "b2", title: "Beta", page: "page-1", card: "card-8" },
    ];
    const manyPlan = showBoardPlan(many);
    assert.equal(manyPlan.mode, "picker");
    boards = many;
    fire(centerNow(), "contextmenu");
    clickText("Show on board…");
    assert.deepEqual(buttonText(), manyPlan.boards.map((board) => board.title));
    opened.length = 0;
    clickText(manyPlan.boards[0].title);
    assert.deepEqual(opened, [[manyPlan.boards[0].uid, { card: manyPlan.boards[0].card }]]);
    assert.notEqual(manyPlan.boards[0].card, manyPlan.boards[0].page);
    boards = [one];
    compass.open("page-1");
    const boardNode = [...doc.querySelectorAll(".compass-node")].find((node) => node.dataset.uid === "board-1");
    assert.ok(boardNode);
    fire(boardNode, "click");
    const cardNode = [...doc.querySelectorAll(".compass-node")].find((node) => node.dataset.uid === "card-node");
    assert.ok(cardNode);
    fire(cardNode, "contextmenu");
    assert.equal(buttonText().includes("Open on board"), true);
    assert.equal(buttonText().includes("Show on board…"), true);
    opened.length = 0;
    clickText("Show on board…");
    assert.deepEqual(opened, [[one.uid, { card: one.card }]]);
    doc.dispatchEvent({
      type: "keydown",
      key: "p",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault() {},
      stopPropagation() {},
    });
    assert.deepEqual(api.commands.map((command) => command.label), [
      "Compass: Open",
      "Compass: Focus page",
      "Compass: Focus block",
    ]);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await extension.onunload();
    delete globalThis.PlexusDiagram;
    delete globalThis.roamAlphaAPI;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousComputed === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousComputed;
    if (previousAdd === undefined) delete globalThis.addEventListener;
    else globalThis.addEventListener = previousAdd;
    if (previousRemove === undefined) delete globalThis.removeEventListener;
    else globalThis.removeEventListener = previousRemove;
    if (previousDispatch === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = previousDispatch;
    delete globalThis._listeners;
  }
});
