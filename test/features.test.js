import assert from "node:assert/strict";
import test from "node:test";

import { createHost } from "../src/host.js";
import { createLifecycle } from "../src/lifecycle.js";
import { createFeatures } from "../src/view/features.js";
import { FEATURES } from "../src/view/features/index.js";
import { mountOverlay } from "../src/view/overlay.js";

test("createFeatures registers features, returns copies, and ignores null or undefined", () => {
  const reg = createFeatures();
  assert.equal(reg.add(null), null);
  assert.equal(reg.add(undefined), null);
  assert.deepEqual(reg.list(), []);
  assert.equal(reg.get("alpha"), null);
  assert.throws(() => reg.add({}), TypeError);
  assert.throws(() => reg.add({ name: "" }), TypeError);

  const alpha = { name: "alpha" };
  const beta = { name: "beta" };
  assert.equal(reg.add(alpha), alpha);
  assert.equal(reg.add(beta), beta);
  assert.equal(reg.get("alpha"), alpha);
  assert.equal(reg.get("missing"), null);

  const snapshot = reg.list();
  assert.deepEqual(snapshot, [alpha, beta]);
  snapshot.push({ name: "gamma" });
  assert.equal(reg.list().length, 2);
});

test("createFeatures hook runners isolate errors and follow each, any, first, pipe, and collect contracts", () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const seen = [];
    const boom = new Error("kaboom");
    const reg = createFeatures();
    reg.add({
      name: "one",
      ping(x) { seen.push(["one", x]); },
      check() { return "truthy-not-boolean"; },
      pick() { return null; },
      step(v, extra) { return v + extra; },
      items(tag) { return [`a:${tag}`]; },
    });
    reg.add({
      name: "broken",
      ping() { throw boom; },
      check() { throw boom; },
      pick() { throw boom; },
      step() { throw boom; },
      items() { throw boom; },
    });
    reg.add({
      name: "two",
      ping(x) { seen.push(["two", x]); },
      check() { return true; },
      pick() { return false; },
      step(v) { return v * 2; },
      items() { return "not-an-array"; },
    });
    reg.add({
      name: "three",
      check() {
        seen.push(["should-not-run"]);
        return true;
      },
      pick() { return "ignored-after-false"; },
      step() { return undefined; },
      items(tag) { return [`b:${tag}`, `c:${tag}`]; },
    });

    reg.each("ping", 7);
    assert.deepEqual(seen, [["one", 7], ["two", 7]]);

    assert.equal(reg.any("check"), true);
    assert.equal(seen.some(([tag]) => tag === "should-not-run"), false);
    assert.equal(reg.any("nonexistent"), false);

    assert.equal(reg.first("pick"), false);
    assert.equal(reg.first("nonexistent"), null);

    assert.equal(reg.pipe("step", 3, 2), 10);
    assert.deepEqual(reg.collect("items", "x"), ["a:x", "b:x", "c:x"]);
    assert.deepEqual(reg.collect("nonexistent"), []);

    assert.equal(errors.length, 5);
    for (const entry of errors) {
      assert.equal(entry[0], "[compass] feature");
      assert.equal(entry[1], "broken");
      assert.equal(entry[3], boom);
    }
  } finally {
    console.error = originalError;
  }
});

test("FEATURES lists all 13 feature factories in exact specification order", () => {
  assert.equal(FEATURES.length, 13);
  const names = FEATURES.map((create) => create(null).name);
  assert.deepEqual(names, [
    "trail",
    "pins",
    "views",
    "mindmap",
    "facets",
    "lenses",
    "layout",
    "keys",
    "palette",
    "wander",
    "zen",
    "export",
    "edit",
  ]);
});

test("mountOverlay no-DOM stub returns ctx: null and an empty features registry", () => {
  const lifecycle = createLifecycle();
  const host = createHost({ lifecycle });
  const overlay = mountOverlay({
    extensionAPI: { settings: { get: () => null, set: async () => {} } },
    lifecycle,
    host,
  });
  assert.equal(overlay.ctx, null);
  assert.deepEqual(overlay.features.list(), []);
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
  if (rest === '[contenteditable="true"]') {
    return node.attrs?.contenteditable === "true" || node.contentEditable === "true";
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
    if (!currentEvent.target) currentEvent.target = target;
    let stopped = false;
    currentEvent.stopPropagation = () => { stopped = true; };
    let current = target;
    while (current) {
      for (const fn of [...(current._listeners?.get(currentEvent.type) ?? [])]) fn(currentEvent);
      if (stopped) break;
      current = current.parentElement ?? null;
    }
    return true;
  };
}

function makeFakeDom() {
  function make(tag) {
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      className: "",
      children: [],
      dataset: {},
      attrs: {},
      style: { setProperty(k, v) { this[k] = v; } },
      hidden: false,
      value: "",
      textContent: "",
      parentElement: null,
      parentNode: null,
      offsetWidth: 200,
      offsetHeight: 120,
      get childElementCount() { return node.children.length; },
      getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
      matches: (selector) => matches(node, selector),
      focus() {
        if (doc.activeElement === node) return;
        doc.activeElement = node;
        node.dispatchEvent({ type: "focus", preventDefault() {}, stopPropagation() {} });
      },
      select() {},
      setAttribute(name, value) {
        node.attrs[name] = String(value);
        if (name === "class") node.className = String(value);
      },
      getAttribute: (name) => node.attrs[name] ?? null,
      removeAttribute(name) { delete node.attrs[name]; },
      classList: {
        contains: (name) => classNames(node).has(name),
        add: (...names) => {
          const set = classNames(node);
          for (const n of names) set.add(n);
          node.className = [...set].join(" ");
        },
        remove: (...names) => {
          const drop = new Set(names);
          node.className = [...classNames(node)].filter((n) => !drop.has(n)).join(" ");
        },
        toggle: (name, force) => {
          const next = force === undefined ? !classNames(node).has(name) : Boolean(force);
          if (next) node.classList.add(name);
          else node.classList.remove(name);
          return next;
        },
      },
      append(...kids) {
        for (const kid of kids) {
          if (kid?.parentElement) kid.remove();
          kid.parentElement = node;
          kid.parentNode = node;
          node.children.push(kid);
        }
      },
      prepend(...kids) {
        for (const kid of [...kids].reverse()) node.append(kid);
        const moved = kids.filter(Boolean);
        node.children = [...moved, ...node.children.filter((kid) => !moved.includes(kid))];
      },
      insertBefore(newChild, refChild) {
        if (newChild?.parentElement) newChild.remove();
        newChild.parentElement = node;
        newChild.parentNode = node;
        const idx = node.children.indexOf(refChild);
        if (idx < 0) node.children.push(newChild);
        else node.children.splice(idx, 0, newChild);
        return newChild;
      },
      replaceChildren(...kids) {
        for (const kid of [...node.children]) kid.remove();
        if (kids.length) node.append(...kids);
      },
      remove() {
        const parent = node.parentElement;
        if (!parent) return;
        parent.children = parent.children.filter((kid) => kid !== node);
        node.parentElement = null;
        node.parentNode = null;
      },
      querySelectorAll(selector) {
        const out = [];
        const walk = (cur) => {
          for (const child of cur.children || []) {
            if (matches(child, selector)) out.push(child);
            walk(child);
          }
        };
        walk(node);
        return out;
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] ?? null; },
      closest(selector) {
        let cur = node;
        while (cur) {
          if (cur.tag && matches(cur, selector)) return cur;
          cur = cur.parentElement ?? null;
        }
        return null;
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === node) return true;
          cur = cur.parentElement ?? null;
        }
        return false;
      },
      click() {
        node.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
      },
    };
    Object.defineProperty(node, "isConnected", {
      get() {
        let cur = node;
        while (cur) {
          if (cur === doc || cur === doc.body || cur === doc.documentElement) return true;
          cur = cur.parentElement ?? null;
        }
        return false;
      },
    });
    listen(node);
    return node;
  }

  const doc = make("document");
  const html = make("html");
  const body = make("body");
  doc.append(html);
  html.append(body);
  doc.documentElement = html;
  doc.body = body;
  doc.activeElement = null;
  doc.createElement = (tag) => make(tag);
  doc.createElementNS = (_ns, tag) => make(tag);
  doc.getElementById = () => null;
  return doc;
}

test("overlay seam exposes frozen ctx, removes bar lens widgets, and fires all 17 hooks", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevComputed = globalThis.getComputedStyle;
  const prevRoam = globalThis.roamAlphaAPI;
  const prevLocation = globalThis.location;
  const doc = makeFakeDom();
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.getComputedStyle = () => ({ backgroundColor: "rgb(255, 255, 255)", color: "rgb(0, 0, 0)" });
  listen(globalThis);

  const settingsMap = new Map([["compass-follow", true]]);
  const extensionAPI = {
    settings: {
      canSet: true,
      get: (key) => settingsMap.get(key) ?? null,
      set: async (key, value) => { settingsMap.set(key, value); },
    },
  };

  let openUid = "center-page";
  globalThis.roamAlphaAPI = {
    graph: { name: "seam-test" },
    ui: {
      mainWindow: {
        getOpenPageOrBlockUid: async () => openUid,
        openPage: async () => {},
        openBlock: async () => {},
      },
      rightSidebar: {
        addWindow: async () => {},
        removeWindow: async () => {},
        getWindows: () => [],
      },
    },
    data: {
      pull(pattern, ref) {
        if (ref.includes('"center-page"')) {
          if (pattern.includes(":harc/_e")) {
            return {
              ":block/uid": "center-page",
              ":node/title": "Center Page",
              ":harc/_e": [{
                ":block/uid": "h1",
                ":harc/a": [{ ":node/title": "Child" }],
                ":harc/v": [{ ":block/uid": "child-page", ":node/title": "Child Page" }],
                ":harc/a-source": [{
                  ":block/uid": "src-1",
                  ":block/string": "Child:: [[Child Page]]",
                  ":block/order": 0,
                  ":block/_children": [{ ":block/uid": "center-page" }],
                }],
              }],
            };
          }
          return { ":block/children": [] };
        }
        return { ":block/uid": "other-page", ":node/title": "Other Page" };
      },
      q: () => [],
      addPullWatch() {},
      removePullWatch() {},
    },
  };

  const lifecycle = createLifecycle();
  const host = createHost({ lifecycle });
  const overlay = mountOverlay({ extensionAPI, lifecycle, host });

  try {
    const { ctx, features } = overlay;
    assert.equal(Object.isFrozen(ctx), true);
    assert.equal(Object.isFrozen(ctx.dom), true);
    assert.equal(features.list().length, 13);
    assert.equal(doc.querySelector(".compass-lens"), null);
    assert.equal(doc.querySelector(".compass-lens-keyword"), null);

    const extraBtn = ctx.button("compass-extra-btn", "Extra");
    assert.equal(ctx.addBarButton(extraBtn), extraBtn);
    const barKids = ctx.dom.bar.children;
    assert.equal(barKids.indexOf(extraBtn), barKids.indexOf(ctx.dom.status) - 1);

    const log = [];
    let activeCustomView = false;
    let consumeEscape = false;
    let consumeKey = false;
    let consumeClick = false;
    let consumeDbl = false;
    let consumeWheel = false;
    let addExtraPin = false;
    let extraEvidenceRan = 0;

    features.add({
      name: "probe",
      onOpen() { log.push(["onOpen", ctx.state.isOpen]); },
      onClose() { log.push(["onClose", ctx.state.isOpen]); },
      onNavigate(info) { log.push(["onNavigate", info]); },
      onSettings(s) { log.push(["onSettings", s?.view]); },
      transformHood(h) {
        log.push(["transformHood", h.center.uid]);
        return h;
      },
      renderView(info) {
        if (!activeCustomView) return null;
        log.push(["renderView", info.navigate]);
        return {
          view: "custom",
          geometry: { bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50 }, center: { x: 0, y: 0, w: 100, h: 40 }, items: [], rows: [], chips: [] },
        };
      },
      clearView() { log.push(["clearView"]); },
      layoutOptions(opts) {
        log.push(["layoutOptions", Array.isArray(opts.rows)]);
        return opts;
      },
      hiddenUids(uids, h) {
        log.push(["hiddenUids", uids.length, h.center.uid]);
        return uids;
      },
      afterRender(info) { log.push(["afterRender", info.view, info.boxes instanceof Map]); },
      afterPins({ pinRow }) {
        log.push(["afterPins"]);
        if (addExtraPin) pinRow.append(ctx.el("span", "compass-pin-chip", "Today"));
      },
      onEscape() {
        if (!consumeEscape) return false;
        log.push(["onEscape"]);
        return true;
      },
      onKey(event) {
        if (!consumeKey) return false;
        log.push(["onKey", event.key]);
        return true;
      },
      onStageClick() {
        if (!consumeClick) return false;
        log.push(["onStageClick"]);
        return true;
      },
      onStageDoubleClick() {
        if (!consumeDbl) return false;
        log.push(["onStageDoubleClick"]);
        return true;
      },
      onWheel() {
        if (!consumeWheel) return false;
        log.push(["onWheel"]);
        return true;
      },
      nodeMenu(uid) {
        return [{ title: `Probe ${uid}`, run: () => log.push(["nodeMenuRun", uid]) }];
      },
      stageMenu() {
        return [{ title: "Probe Stage", run: () => log.push(["stageMenuRun"]) }];
      },
      evidenceActions({ node, item }) {
        return [{ title: `Act ${item.kind}`, run: () => { extraEvidenceRan += 1; log.push(["evidenceRun", node.uid]); } }];
      },
      commands() {
        return [{ id: "probe-cmd", title: "Probe Command", hint: "P", run: () => {} }];
      },
    });

    ctx.focusUid("center-page");
    assert.equal(ctx.state.isOpen, true);
    assert.equal(ctx.state.current, "center-page");
    assert.equal(ctx.dom.root.dataset.view, "compass");
    assert.equal(ctx.dom.pinRow.hidden, true);
    assert.ok(log.some(([name, val]) => name === "onOpen" && val === true));
    assert.ok(log.some(([name, info]) => name === "onNavigate" && info.uid === "center-page" && info.previous === null && info.follow === false));
    assert.ok(log.some(([name]) => name === "onSettings"));
    assert.ok(log.some(([name]) => name === "transformHood"));
    assert.ok(log.some(([name]) => name === "layoutOptions"));
    assert.ok(log.some(([name]) => name === "hiddenUids"));
    assert.ok(log.some(([name, view]) => name === "afterRender" && view === "compass"));
    assert.ok(log.some(([name]) => name === "afterPins"));

    // Hook 10: pinRow visibility follows childElementCount when features add chips.
    addExtraPin = true;
    await ctx.savePins([]);
    assert.equal(ctx.dom.pinRow.hidden, false);
    addExtraPin = false;

    // ctx.setLens fades matching nodes and close() resets lens.
    ctx.setLens({ pages: false, keyword: "nomatch" });
    assert.deepEqual(ctx.state.lens, { pages: false, blocks: true, drawings: true, regions: true, keyword: "nomatch" });
    const childEl = ctx.state.nodeEls.get("child-page");
    assert.equal(childEl.classList.contains("compass-fade"), true);

    // ctx.setCamera & ctx.setGeometry & ctx.commands & ctx.saveSetting
    ctx.setCamera({ panX: 15, panY: -25, zoom: 10 }, false);
    assert.equal(ctx.state.panX, 15);
    assert.equal(ctx.state.panY, -25);
    assert.equal(ctx.state.zoom, 2.5);
    const customGeo = { bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, center: { x: 0, y: 0, w: 10, h: 10 }, items: [], rows: [], chips: [] };
    ctx.setGeometry(customGeo);
    assert.equal(ctx.state.geometry, customGeo);
    ctx.render();

    const cmdIds = ctx.commands().map((c) => c.id);
    assert.deepEqual(cmdIds.slice(0, 8), ["back", "forward", "find", "fit", "refresh", "pin", "outline", "close"]);
    assert.ok(cmdIds.includes("view-compass"));
    assert.ok(cmdIds.includes("probe-cmd"));

    log.length = 0;
    await ctx.saveSetting("compass-flip", true);
    assert.equal(ctx.state.settings.flip, true);
    assert.ok(log.some(([name]) => name === "onSettings"));
    assert.equal(log.some(([name]) => name === "afterRender"), false);

    // Hook 6: custom renderView and clearView on return to normal view.
    log.length = 0;
    activeCustomView = true;
    ctx.render({ navigate: true });
    assert.equal(ctx.dom.root.dataset.view, "custom");
    assert.equal(ctx.state.nodeEls.size, 0);
    assert.ok(log.some(([name]) => name === "renderView"));
    assert.ok(log.some(([name, view]) => name === "afterRender" && view === "custom"));

    log.length = 0;
    activeCustomView = false;
    ctx.render();
    assert.equal(ctx.dom.root.dataset.view, "compass");
    assert.equal(log.filter(([name]) => name === "clearView").length, 1);
    ctx.render();
    assert.equal(log.filter(([name]) => name === "clearView").length, 1);

    // Hook 15: nodeMenu
    ctx.showMenu("child-page", 20, 20);
    const nodeMenuItem = [...ctx.dom.menu.querySelectorAll(".compass-menu-item")].find((b) => b.textContent === "Probe child-page");
    assert.ok(nodeMenuItem);
    nodeMenuItem.click();
    assert.ok(log.some(([name, uid]) => name === "nodeMenuRun" && uid === "child-page"));

    // Hook 16: stageMenu on empty stage background
    ctx.dom.stage.dispatchEvent({
      type: "contextmenu",
      target: ctx.dom.stage,
      clientX: 30,
      clientY: 40,
      preventDefault() {},
      stopPropagation() {},
    });
    const stageMenuTitles = [...ctx.dom.menu.querySelectorAll(".compass-menu-item")].map((b) => b.textContent);
    assert.ok(stageMenuTitles.includes("✓ View: Compass"));
    assert.ok(stageMenuTitles.includes("Probe Stage"));

    // Hook 17: evidenceActions in showDetails
    ctx.showDetails("child-page", 20, 20);
    const evidenceBtn = [...ctx.dom.details.querySelectorAll(".compass-details-open")].find((b) => b.textContent === "Act typed");
    assert.ok(evidenceBtn);
    evidenceBtn.click();
    assert.equal(extraEvidenceRan, 1);
    assert.equal(ctx.dom.details.hidden, true);

    // Hooks 13 & 14: click, dblclick, wheel
    consumeClick = true;
    ctx.dom.stage.dispatchEvent({ type: "click", target: ctx.dom.stage, preventDefault() {}, stopPropagation() {} });
    assert.ok(log.some(([name]) => name === "onStageClick"));
    consumeClick = false;

    consumeDbl = true;
    ctx.dom.stage.dispatchEvent({ type: "dblclick", target: ctx.dom.stage, preventDefault() {}, stopPropagation() {} });
    assert.ok(log.some(([name]) => name === "onStageDoubleClick"));
    consumeDbl = false;

    consumeWheel = true;
    const zoomBefore = ctx.state.zoom;
    ctx.dom.stage.dispatchEvent({ type: "wheel", target: ctx.dom.stage, deltaY: -100, clientX: 0, clientY: 0, preventDefault() {} });
    assert.ok(log.some(([name]) => name === "onWheel"));
    assert.equal(ctx.state.zoom, zoomBefore);
    consumeWheel = false;

    // Hooks 11 & 12 + generic typing check
    consumeKey = true;
    const editable = ctx.el("div");
    editable.setAttribute("contenteditable", "true");
    ctx.dom.root.append(editable);
    log.length = 0;
    doc.dispatchEvent({ type: "keydown", target: editable, key: "w", preventDefault() {} });
    assert.equal(log.some(([name]) => name === "onKey"), false);

    let keyPrevented = false;
    doc.dispatchEvent({
      type: "keydown",
      target: ctx.dom.stage,
      key: "w",
      preventDefault() { keyPrevented = true; },
    });
    assert.equal(keyPrevented, true);
    assert.ok(log.some(([name, key]) => name === "onKey" && key === "w"));
    consumeKey = false;

    consumeEscape = true;
    doc.dispatchEvent({ type: "keydown", target: ctx.dom.stage, key: "Escape", preventDefault() {} });
    assert.equal(ctx.state.isOpen, true);
    assert.ok(log.some(([name]) => name === "onEscape"));
    consumeEscape = false;

    // Hook 1 follow path via recenter on hashchange
    log.length = 0;
    openUid = "other-page";
    globalThis.location = { hash: "#/page/other-page" };
    globalThis.dispatchEvent({ type: "hashchange" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(log.some(([name, info]) => name === "onNavigate" && info.uid === "other-page" && info.follow === true && info.record === false));

    // Hook 3: onClose + lens reset
    doc.dispatchEvent({ type: "keydown", target: ctx.dom.stage, key: "Escape", preventDefault() {} });
    assert.equal(ctx.state.isOpen, false);
    assert.deepEqual(ctx.state.lens, { pages: true, blocks: true, drawings: true, regions: true, keyword: "" });
    assert.ok(log.some(([name, open]) => name === "onClose" && open === false));
  } finally {
    await lifecycle.dispose();
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevComputed === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = prevComputed;
    if (prevRoam === undefined) delete globalThis.roamAlphaAPI;
    else globalThis.roamAlphaAPI = prevRoam;
    if (prevLocation === undefined) delete globalThis.location;
    else globalThis.location = prevLocation;
    delete globalThis._listeners;
  }
});

test("ctx.facts caches page attributes across calls, clears on load, degrades on error, and custom views disable node drag only", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevComputed = globalThis.getComputedStyle;
  const prevRoam = globalThis.roamAlphaAPI;
  const doc = makeFakeDom();
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.getComputedStyle = () => ({ backgroundColor: "rgb(255, 255, 255)", color: "rgb(0, 0, 0)" });
  listen(globalThis);

  const settingsMap = new Map([["compass-type-attribute", "Category"]]);
  const extensionAPI = {
    settings: {
      canSet: true,
      get: (key) => settingsMap.get(key) ?? null,
      set: async (key, value) => { settingsMap.set(key, value); },
    },
  };

  globalThis.roamAlphaAPI = {
    graph: { name: "facts-seam" },
    ui: {
      mainWindow: {
        getOpenPageOrBlockUid: async () => "center-page",
        openPage: async () => {},
        openBlock: async () => {},
      },
      rightSidebar: {
        addWindow: async () => {},
        removeWindow: async () => {},
        getWindows: () => [],
      },
    },
    data: {
      pull(pattern, ref) {
        if (ref.includes('"center-page"')) {
          if (pattern.includes(":harc/_e")) {
            return {
              ":block/uid": "center-page",
              ":node/title": "Center Page",
              ":harc/_e": [
                {
                  ":block/uid": "h1",
                  ":harc/a": [{ ":node/title": "Child" }],
                  ":harc/v": [
                    { ":block/uid": "page-filled", ":node/title": "Filled Page" },
                    { ":block/uid": "page-empty", ":node/title": "Empty Page" },
                  ],
                  ":harc/a-source": [{
                    ":block/uid": "src-1",
                    ":block/string": "Child:: [[Filled Page]] [[Empty Page]]",
                    ":block/order": 0,
                    ":block/_children": [{ ":block/uid": "center-page" }],
                  }],
                },
              ],
            };
          }
          return { ":block/children": [] };
        }
        return null;
      },
      q: () => [["page-filled", 3]],
      addPullWatch() {},
      removePullWatch() {},
    },
  };

  const lifecycle = createLifecycle();
  const host = createHost({ lifecycle });
  const attrCalls = [];
  let shouldThrow = false;
  host.pageAttributes = (uids) => {
    attrCalls.push([...uids]);
    if (shouldThrow) throw new Error("attributes down");
    return {
      "page-filled": {
        category: { name: "Category", values: [{ uid: "cat-1", title: "Project" }] },
      },
      "page-empty": {},
    };
  };

  const overlay = mountOverlay({ extensionAPI, lifecycle, host });
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    const { ctx, features } = overlay;
    let transformFacts = null;
    features.add({
      name: "facts-observer",
      transformHood(hood) {
        transformFacts = ctx.facts(hood.nodes);
        return hood;
      },
    });

    ctx.focusUid("center-page");
    assert.ok(transformFacts instanceof Map);
    assert.equal(transformFacts.get("page-filled")?.type, "Project");
    assert.equal(transformFacts.get("page-filled")?.group, "page");
    assert.equal(transformFacts.get("page-empty")?.group, "empty");
    assert.equal(attrCalls.length, 1);

    // Calling ctx.facts again with already-cached pages + a block fetches nothing new.
    const repeat = ctx.facts([
      ...ctx.state.hood.nodes,
      { uid: "blk-1", kind: "block", title: "Note" },
    ]);
    assert.equal(attrCalls.length, 1);
    assert.equal(repeat.get("blk-1")?.group, "block");

    // load() clears the page attribute cache and re-fetches.
    ctx.load();
    assert.equal(attrCalls.length, 2);

    // Failing host.pageAttributes logs and treats uncached pages as having no attributes.
    shouldThrow = true;
    const degraded = ctx.facts([{ uid: "uncached-page", kind: "page", title: "Uncached" }]);
    assert.equal(degraded.get("uncached-page")?.type, "");
    assert.deepEqual(degraded.get("uncached-page")?.attributes, {});
    assert.ok(errors.some((entry) => entry[0] === "[compass] page attributes"));
    shouldThrow = false;

    // ctx.openZonePop opens the zone popover and focuses the zone input.
    const zonePop = doc.querySelector(".compass-zone-pop");
    const zoneInput = doc.querySelector(".compass-zone-input");
    assert.equal(zonePop.hidden, true);
    ctx.openZonePop("north", 120, 80);
    assert.equal(zonePop.hidden, false);
    assert.equal(doc.activeElement, zoneInput);
    ctx.hideFloating();
    assert.equal(zonePop.hidden, true);

    // Outside "compass" view, node pointerdown does not start node drag, while stage background still pans.
    const filledEl = ctx.state.nodeEls.get("page-filled");
    assert.ok(filledEl);
    ctx.dom.root.dataset.view = "mindmap";
    ctx.dom.root.dispatchEvent({ type: "pointerdown", target: filledEl, button: 0, clientX: 100, clientY: 100 });
    globalThis.dispatchEvent({ type: "pointermove", clientX: 140, clientY: 140 });
    assert.equal(ctx.dom.root.classList.contains("compass-dragging"), false);
    globalThis.dispatchEvent({ type: "pointerup", clientX: 140, clientY: 140 });

    const startPanX = ctx.state.panX;
    const startPanY = ctx.state.panY;
    ctx.dom.root.dispatchEvent({ type: "pointerdown", target: ctx.dom.stage, button: 0, clientX: 100, clientY: 100 });
    globalThis.dispatchEvent({ type: "pointermove", clientX: 130, clientY: 120 });
    assert.equal(ctx.state.panX, startPanX + 30);
    assert.equal(ctx.state.panY, startPanY + 20);
    globalThis.dispatchEvent({ type: "pointerup", clientX: 130, clientY: 120 });

    // Back in "compass" view, node pointerdown starts a node drag.
    ctx.dom.root.dataset.view = "compass";
    ctx.dom.root.dispatchEvent({ type: "pointerdown", target: filledEl, button: 0, clientX: 100, clientY: 100 });
    globalThis.dispatchEvent({ type: "pointermove", clientX: 140, clientY: 140 });
    assert.equal(ctx.dom.root.classList.contains("compass-dragging"), true);
    globalThis.dispatchEvent({ type: "pointercancel", clientX: 140, clientY: 140 });
    assert.equal(ctx.dom.root.classList.contains("compass-dragging"), false);
  } finally {
    console.error = originalError;
    await lifecycle.dispose();
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevComputed === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = prevComputed;
    if (prevRoam === undefined) delete globalThis.roamAlphaAPI;
    else globalThis.roamAlphaAPI = prevRoam;
    delete globalThis._listeners;
  }
});
