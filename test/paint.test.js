import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import { fitText, paintPlan } from "../src/model/paint.js";
import { createFeatures } from "../src/view/features.js";
import { createExport } from "../src/view/features/export.js";

test("paintPlan computes pixel dimensions for all and viewport scopes", () => {
  const allPlan = paintPlan({
    bounds: { minX: -200, minY: -100, maxX: 300, maxY: 150 },
    viewport: { x: -100, y: -50, w: 200, h: 100 },
    scope: "all",
    scale: 2,
    pad: 24,
  });
  assert.equal(allPlan.width, (500 + 48) * 2);
  assert.equal(allPlan.height, (250 + 48) * 2);
  assert.equal(allPlan.scale, 2);
  assert.equal(allPlan.reduced, false);
  assert.deepEqual(allPlan.warnings, []);

  const vpPlan = paintPlan({
    bounds: { minX: -200, minY: -100, maxX: 300, maxY: 150 },
    viewport: { x: -100, y: -50, w: 200, h: 100 },
    scope: "viewport",
    scale: 3,
    pad: 24,
  });
  assert.equal(vpPlan.width, 600);
  assert.equal(vpPlan.height, 300);
  assert.equal(vpPlan.scale, 3);
  assert.equal(vpPlan.reduced, false);
});

test("paintPlan lowers scale to fit maxSide, sets reduced, and warns", () => {
  const plan = paintPlan({
    bounds: { minX: 0, minY: 0, maxX: 5000, maxY: 2500 },
    pad: 0,
    scope: "all",
    scale: 2,
    maxSide: 8192,
  });

  assert.equal(plan.reduced, true);
  assert.equal(plan.width, 8192);
  assert.equal(plan.height, 4096);
  assert.ok(plan.scale < 2);
  assert.deepEqual(plan.warnings, ["The image was reduced to fit the size limit."]);
});

test("paintPlan drops boxes, regions, paths, and labels entirely outside the scope and keeps partial overlaps", () => {
  const plan = paintPlan({
    viewport: { x: 0, y: 0, w: 200, h: 100 },
    scope: "viewport",
    scale: 1,
    transparent: true,
    regions: [
      { x: -150, y: 0, w: 100, h: 50, fill: "#eee", label: "Outside Region" },
      { x: -20, y: 10, w: 80, h: 60, fill: "#eee", label: "Partial Region" },
    ],
    paths: [
      { d: "M -300,-200 L -220,-120", stroke: "#333", width: 1.5 },
      { d: "M -20,50 C 20,50 40,50 80,50", stroke: "#333", width: 1.5 },
    ],
    boxes: [
      { x: 250, y: 10, w: 100, h: 34, text: "Far Right", fill: "#fff", stroke: "#000" },
      { x: 0, y: 100, w: 100, h: 34, text: "Touching Bottom Edge Outside", fill: "#fff", stroke: "#000" },
      { x: 150, y: 40, w: 100, h: 34, text: "Straddling Right", fill: "#fff", stroke: "#000" },
    ],
    labels: [
      { x: -5, y: 50, text: "Out Label", color: "#000" },
      { x: 60, y: 45, text: "In Label", color: "#000" },
    ],
  });

  const texts = plan.ops.filter((op) => op.op === "text").map((op) => op.text);
  assert.deepEqual(texts, ["Partial Region", "Straddling Right", "In Label"]);
  assert.equal(plan.ops.filter((op) => op.op === "path").length, 1);
  assert.equal(plan.ops.filter((op) => op.op === "rect").length, 2);
});

test("paintPlan emits ops in exact order (background, regions, paths, boxes, labels) in pixel coordinates", () => {
  const plan = paintPlan({
    bounds: { minX: -100, minY: -50, maxX: 100, maxY: 50 },
    pad: 10,
    scope: "all",
    scale: 2,
    transparent: false,
    paper: "#fafafa",
    regions: [
      {
        x: -90,
        y: -40,
        w: 80,
        h: 70,
        fill: "#f0f4f8",
        stroke: "#99aabb",
        dashed: true,
        label: "Tasks",
        color: "#112233",
      },
    ],
    paths: [
      {
        d: "M 0,0 L 50,20",
        stroke: "#106ba3",
        width: 1.5,
        dashed: [5, 4],
        opacity: 0.8,
      },
    ],
    boxes: [
      {
        x: 10,
        y: -10,
        w: 80,
        h: 30,
        text: "Task One",
        fill: "#ffffff",
        stroke: "#106ba3",
        color: "#182026",
        dashed: false,
        radius: 6,
        bold: true,
        opacity: 1,
        font: "13px sans-serif",
      },
    ],
    labels: [
      {
        x: 25,
        y: 10,
        text: "Child",
        color: "#182026",
        font: "11px sans-serif",
      },
    ],
  });

  // Origin in world units: (-110, -60), world size: 220 x 120, pixel size: 440 x 240.
  assert.equal(plan.width, 440);
  assert.equal(plan.height, 240);

  const layers = plan.ops.map((op) => `${op.layer}:${op.op}`);
  assert.deepEqual(layers, [
    "background:rect",
    "region:rect",
    "region:text",
    "path:path",
    "box:rect",
    "box:text",
    "label:text",
  ]);

  const bg = plan.ops[0];
  assert.equal(bg.x, 0);
  assert.equal(bg.y, 0);
  assert.equal(bg.w, 440);
  assert.equal(bg.h, 240);
  assert.equal(bg.fill, "#fafafa");

  const pathOp = plan.ops.find((op) => op.op === "path");
  // (0 - -110)*2 = 220, (0 - -60)*2 = 120; (50 - -110)*2 = 320, (20 - -60)*2 = 160
  assert.equal(pathOp.d, "M220,120 L320,160");
  assert.equal(pathOp.lineWidth, 3);
  assert.deepEqual(pathOp.dash, [10, 8]);
  assert.equal(pathOp.opacity, 0.8);

  const boxRect = plan.ops.find((op) => op.layer === "box" && op.op === "rect");
  // (10 - -110)*2 = 240, (-10 - -60)*2 = 100, w = 160, h = 60, radius = 12
  assert.equal(boxRect.x, 240);
  assert.equal(boxRect.y, 100);
  assert.equal(boxRect.w, 160);
  assert.equal(boxRect.h, 60);
  assert.equal(boxRect.radius, 12);

  const boxText = plan.ops.find((op) => op.layer === "box" && op.op === "text");
  assert.equal(boxText.text, "Task One");
  assert.equal(boxText.font, "600 26px sans-serif");
  assert.equal(boxText.maxWidth, 160 - 40);

  const labelOp = plan.ops.find((op) => op.layer === "label");
  assert.equal(labelOp.x, 270);
  assert.equal(labelOp.y, 140);
  assert.equal(labelOp.halo, "#fafafa");

  const transparentPlan = paintPlan({
    bounds: { minX: -100, minY: -50, maxX: 100, maxY: 50 },
    pad: 10,
    scale: 1,
    transparent: true,
    labels: [{ x: 0, y: 0, text: "Edge", color: "#000" }],
  });
  assert.equal(transparentPlan.ops.some((op) => op.layer === "background"), false);
  assert.equal(transparentPlan.ops[0].halo, null);
});

test("fitText returns full text when fitting, else longest prefix plus ellipsis, and handles edge cases", () => {
  const mono10 = (str) => Array.from(str).length * 10;

  assert.equal(fitText("Short", 100, mono10), "Short");
  assert.equal(fitText("Exact", 50, mono10), "Exact");
  assert.equal(fitText("abcdefghij", 50, mono10), "abcd…");
  assert.equal(fitText("abcdef", 10, mono10), "…");
  assert.equal(fitText("abcdef", 5, mono10), "");
  assert.equal(fitText("", 50, mono10), "");
  assert.equal(fitText("abc", 0, mono10), "");

  // Multi-code-unit characters (e.g., astral plane math symbols) are never split mid-pair.
  const astral = "𝐀𝐁𝐂𝐃𝐄";
  assert.equal(fitText(astral, 30, mono10), "𝐀𝐁…");
});

function makeImageTestEnv({ toBlobMode = "ok" } = {}) {
  const makeNode = (tag) => {
    const listeners = new Map();
    const classes = new Set();
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      className: "",
      children: [],
      dataset: {},
      attrs: {},
      style: {},
      hidden: false,
      disabled: false,
      textContent: "",
      parentElement: null,
      get isConnected() {
        let cur = node;
        while (cur) {
          if (cur === doc.body) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      classList: {
        contains: (n) => classes.has(n),
        add: (...ns) => {
          for (const n of ns) if (n) classes.add(n);
          node.className = [...classes].join(" ");
        },
        remove: (...ns) => {
          for (const n of ns) classes.delete(n);
          node.className = [...classes].join(" ");
        },
      },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return node.attrs[k] ?? null; },
      removeAttribute(k) { delete node.attrs[k]; },
      append(...kids) {
        for (const kid of kids) {
          if (!kid) continue;
          if (kid.parentElement) kid.remove();
          kid.parentElement = node;
          node.children.push(kid);
        }
      },
      replaceChildren(...kids) {
        for (const kid of [...node.children]) kid.remove();
        node.append(...kids);
      },
      remove() {
        if (!node.parentElement) return;
        node.parentElement.children = node.parentElement.children.filter((c) => c !== node);
        node.parentElement = null;
      },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === node) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      focus() { doc.activeElement = node; },
      getBoundingClientRect: () => ({ left: 100, top: 80, width: 180, height: 34 }),
      addEventListener(type, fn) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      },
      removeEventListener(type, fn) {
        const list = listeners.get(type);
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      },
      dispatchEvent(ev) {
        const event = ev ?? {};
        if (!event.target) event.target = node;
        for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event);
        return true;
      },
      click() { node.dispatchEvent({ type: "click" }); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const out = [];
        const match = (el) => {
          if (sel === '[data-paint="region"]') return el.attrs?.["data-paint"] === "region";
          if (sel === "path.compass-edge-line") return el.tag === "path" && el.classList.contains("compass-edge-line");
          if (sel === "text.compass-edge-label") return el.tag === "text" && el.classList.contains("compass-edge-label");
          return el.classList.contains(sel.replace(/^\./, ""));
        };
        const walk = (cur) => {
          for (const ch of cur.children) {
            if (match(ch)) out.push(ch);
            walk(ch);
          }
        };
        walk(node);
        return out;
      },
    };
    if (tag === "canvas") {
      node.width = 0;
      node.height = 0;
      node.getContext = () => ({
        save() {},
        restore() {},
        clearRect() {},
        beginPath() {},
        rect() {},
        roundRect() {},
        fill() {},
        stroke() {},
        setLineDash() {},
        measureText: (t) => ({ width: String(t).length * 7 }),
        strokeText() {},
        fillText() {},
      });
      if (toBlobMode === "missing") {
        node.toBlob = undefined;
      } else if (toBlobMode === "throw") {
        node.toBlob = () => { throw new Error("toBlob failed"); };
      } else {
        node.toBlob = (cb) => cb(new Blob(["png"], { type: "image/png" }));
      }
    }
    return node;
  };

  const doc = {
    body: null,
    activeElement: null,
    createElement: (tag) => makeNode(tag),
  };
  doc.body = makeNode("body");

  const root = makeNode("div");
  root.classList.add("compass-root");
  const bar = makeNode("div");
  const stage = makeNode("div");
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  const world = makeNode("div");
  const nodeCard = makeNode("div");
  nodeCard.classList.add("compass-node", "compass-node-center");
  const titleSpan = makeNode("span");
  titleSpan.classList.add("compass-node-title");
  titleSpan.textContent = "Project Alpha";
  nodeCard.append(titleSpan);
  world.append(nodeCard);
  stage.append(world);
  root.append(bar, stage);
  doc.body.append(root);

  const lifecycle = createLifecycle();
  const statuses = [];
  const ctx = {
    lifecycle,
    features: createFeatures(),
    dom: { root, bar, stage, world },
    state: {
      isOpen: true,
      zoom: 1,
      panX: 0,
      panY: 0,
      lens: { pages: true, blocks: true, drawings: true, regions: true, keyword: "" },
      geometry: { bounds: { minX: -120, minY: -40, maxX: 120, maxY: 40 } },
      hood: { center: { uid: "p-alpha", kind: "page", title: "Project Alpha" }, nodes: [] },
    },
    el(tag, cls, text) {
      const n = makeNode(tag);
      if (cls) n.classList.add(...cls.split(/\s+/));
      if (text !== undefined) n.textContent = text;
      return n;
    },
    button(cls, text, ariaLabel) {
      const b = makeNode("button");
      if (cls) b.classList.add(...cls.split(/\s+/));
      if (text !== undefined) b.textContent = text;
      if (ariaLabel) b.setAttribute("aria-label", ariaLabel);
      return b;
    },
    guard: (fn) => (...args) => Promise.resolve(fn(...args)),
    addBarButton: (b) => b,
    hideFloating() {},
    setStatus: (m) => statuses.push(m),
  };

  return { doc, root, lifecycle, statuses, ctx };
}

test("openImage handles unavailable canvas.toBlob, revokes URLs, and handles supported/unsupported Copy PNG", async () => {
  const prevDoc = globalThis.document;
  const prevNav = globalThis.navigator;
  const prevClipItem = globalThis.ClipboardItem;
  const prevUrl = globalThis.URL;
  const prevComputed = globalThis.getComputedStyle;

  const createdUrls = [];
  const revokedUrls = [];
  globalThis.URL = {
    createObjectURL: () => {
      const u = `blob:mock-${createdUrls.length + 1}`;
      createdUrls.push(u);
      return u;
    },
    revokeObjectURL: (u) => {
      revokedUrls.push(u);
    },
  };
  globalThis.getComputedStyle = () => ({
    backgroundColor: "rgb(255, 255, 255)",
    borderTopStyle: "solid",
    borderTopWidth: "2px",
    borderTopColor: "rgb(24, 32, 38)",
    color: "rgb(24, 32, 38)",
    borderTopLeftRadius: "8px",
    fontSize: "15px",
    fontFamily: "sans-serif",
    fontWeight: "600",
    opacity: "1",
  });

  try {
    // 1. Missing/failing canvas.toBlob disables buttons and reports warning.
    const badEnv = makeImageTestEnv({ toBlobMode: "missing" });
    globalThis.document = badEnv.doc;
    const badExp = createExport(badEnv.ctx);
    badExp.openImage();
    await new Promise((r) => setTimeout(r, 10));
    const badBackdrop = badEnv.root.querySelector(".compass-export-backdrop");
    assert.equal(
      badBackdrop.querySelector(".compass-export-warning")?.textContent,
      "This browser could not make the image.",
    );
    assert.equal(badBackdrop.querySelector(".compass-export-copy-png").disabled, true);
    assert.equal(badBackdrop.querySelector(".compass-export-save-png").disabled, true);
    await badEnv.lifecycle.dispose();

    // 2. Working canvas.toBlob + unsupported copyBlob -> warning + status, then supported copyBlob -> closes dialog.
    const env = makeImageTestEnv({ toBlobMode: "ok" });
    globalThis.document = env.doc;
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: {} },
      configurable: true,
      writable: true,
    });
    delete globalThis.ClipboardItem;

    const exp = createExport(env.ctx);
    // Single-dialog enforcement: openOutline then openImage leaves only image dialog.
    exp.openOutline();
    exp.openImage();
    await new Promise((r) => setTimeout(r, 10));
    const backdrop = env.root.querySelector(".compass-export-backdrop");
    assert.equal(backdrop.children.length, 1);
    assert.equal(backdrop.children[0].classList.contains("compass-export-dialog-image"), true);
    assert.equal(createdUrls.length, 1);

    // Changing scale revokes previous preview URL.
    const scaleButtons = backdrop.querySelectorAll(".compass-export-seg-btn");
    const scale1 = scaleButtons.find((b) => b.dataset.scale === "1");
    scale1.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(createdUrls.length, 2);
    assert.deepEqual(revokedUrls, ["blob:mock-1"]);

    // Unsupported Copy PNG shows message and keeps dialog open.
    const copyBtn = backdrop.querySelector(".compass-export-copy-png");
    await copyBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(backdrop.hidden, false);
    assert.equal(env.statuses.at(-1), "Copying images is not supported here. Use Save.");
    assert.equal(
      backdrop.querySelector(".compass-export-warning")?.textContent,
      "Copying images is not supported here. Use Save.",
    );

    // Supported Copy PNG closes dialog, revokes URL, and sets status "Image copied".
    globalThis.ClipboardItem = function ClipboardItem(items) { this.items = items; };
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { write: async () => {} } },
      configurable: true,
      writable: true,
    });
    await copyBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(backdrop.hidden, true);
    assert.equal(env.statuses.at(-1), "Image copied");
    assert.deepEqual(revokedUrls, ["blob:mock-1", "blob:mock-2"]);

    await env.lifecycle.dispose();
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevNav === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, "navigator", { value: prevNav, configurable: true, writable: true });
    if (prevClipItem === undefined) delete globalThis.ClipboardItem;
    else globalThis.ClipboardItem = prevClipItem;
    globalThis.URL = prevUrl;
    if (prevComputed === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = prevComputed;
  }
});
