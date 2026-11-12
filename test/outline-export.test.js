import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import { buildNeighborhood } from "../src/model/neighborhood.js";
import {
  breadcrumbs,
  compassOutline,
  facetsOutline,
  linkOf,
  treeOutline,
} from "../src/model/outline-export.js";
import { createFeatures } from "../src/view/features.js";
import { createExport } from "../src/view/features/export.js";

test("linkOf formats pages, blocks, groups, unlinked ]] titles, and empty inputs", () => {
  assert.equal(linkOf({ uid: "p-1", kind: "page", title: "Project Alpha" }), "[[Project Alpha]]");
  assert.equal(linkOf({ uid: "b-1", kind: "block", title: "Some block text" }), "((b-1))");
  assert.equal(linkOf({ uid: "g-1", kind: "group", title: "Task", count: 4 }), "Task (4)");
  assert.equal(linkOf({ uid: "g-2", kind: "group", title: "Task (4)", count: 4 }), "Task (4)");

  const warnings = [];
  assert.equal(
    linkOf({ uid: "p-bad", kind: "page", title: "Draft [[v1]] Notes" }, { warnings }),
    "Draft [[v1]] Notes",
  );
  assert.deepEqual(warnings, ["1 title could not be written as a link."]);

  const directWarnings = [];
  assert.equal(linkOf({ uid: "p-bad2", kind: "page", title: "Ends with ]]" }, directWarnings), "Ends with ]]");
  assert.deepEqual(directWarnings, ["1 title could not be written as a link."]);

  assert.equal(linkOf(null), "");
  assert.equal(linkOf({}), "");
});

test("compassOutline orders sides, indents 4 spaces per level, preserves node order, and omits empty sides", () => {
  const hood = {
    center: { uid: "p-alpha", kind: "page", title: "Project Alpha" },
    nodes: [
      { uid: "p-sib", kind: "page", title: "Project Gamma", zone: "siblings", label: "", evidence: [{ kind: "sibling" }] },
      { uid: "p-t1", kind: "page", title: "Task One", zone: "south", label: "" },
      { uid: "p-jane", kind: "page", title: "Jane", zone: "south", label: "Owner · Role: Lead" },
      { uid: "p-prog", kind: "page", title: "Programs", zone: "north", label: "Parent" },
      { uid: "b-risk", kind: "block", title: "Open risk", zone: "east", label: "Challenger" },
    ],
  };

  const md = compassOutline(hood);
  assert.equal(md.endsWith("\n"), false);
  assert.equal(
    md,
    [
      "- [[Project Alpha]]",
      "    - Parents",
      "        - [[Programs]] — Parent",
      "    - Children",
      "        - [[Task One]]",
      "        - [[Jane]] — Owner · Role: Lead",
      "    - Challengers",
      "        - ((b-risk)) — Challenger",
      "    - Siblings",
      "        - [[Project Gamma]]",
    ].join("\n"),
  );
});

test("compassOutline supports labels modes none, visible, and all including untyped evidence kinds", () => {
  const hood = {
    center: { uid: "p-day", kind: "page", title: "November 11th, 2026" },
    nodes: [
      {
        uid: "p-mention",
        kind: "page",
        title: "Meeting Notes",
        zone: "north",
        label: "",
        evidence: [{ kind: "mention", role: "parent" }],
      },
      {
        uid: "p-typed",
        kind: "page",
        title: "Jane",
        zone: "south",
        label: "Owner · Role: Lead",
        evidence: [{ kind: "typed", attribute: "Owner", labels: ["Role: Lead"] }],
      },
      {
        uid: "p-link",
        kind: "page",
        title: "Budget",
        zone: "south",
        label: "",
        evidence: [{ kind: "link", role: "child" }],
      },
      {
        uid: "p-ns",
        kind: "page",
        title: "November 11th, 2026/Notes",
        zone: "south",
        label: "",
        evidence: [{ kind: "structural", role: "child", note: "namespace" }],
      },
      {
        uid: "p-prev",
        kind: "page",
        title: "November 10th, 2026",
        zone: "west",
        label: "",
        evidence: [{ kind: "structural", role: "previous", note: "day" }],
      },
      {
        uid: "p-sib",
        kind: "page",
        title: "Peer Note",
        zone: "siblings",
        label: "",
        evidence: [{ kind: "sibling", role: "sibling" }],
      },
    ],
  };

  assert.equal(
    compassOutline(hood, { labels: "none" }),
    [
      "- [[November 11th, 2026]]",
      "    - Parents",
      "        - [[Meeting Notes]]",
      "    - Children",
      "        - [[Jane]]",
      "        - [[Budget]]",
      "        - [[November 11th, 2026/Notes]]",
      "    - Friends",
      "        - [[November 10th, 2026]]",
      "    - Siblings",
      "        - [[Peer Note]]",
    ].join("\n"),
  );

  assert.equal(
    compassOutline(hood, { labels: "visible" }),
    [
      "- [[November 11th, 2026]]",
      "    - Parents",
      "        - [[Meeting Notes]]",
      "    - Children",
      "        - [[Jane]] — Owner · Role: Lead",
      "        - [[Budget]]",
      "        - [[November 11th, 2026/Notes]]",
      "    - Friends",
      "        - [[November 10th, 2026]]",
      "    - Siblings",
      "        - [[Peer Note]]",
    ].join("\n"),
  );

  assert.equal(
    compassOutline(hood, { labels: "all" }),
    [
      "- [[November 11th, 2026]]",
      "    - Parents",
      "        - [[Meeting Notes]] — mention",
      "    - Children",
      "        - [[Jane]] — Owner · Role: Lead",
      "        - [[Budget]] — link",
      "        - [[November 11th, 2026/Notes]] — namespace",
      "    - Friends",
      "        - [[November 10th, 2026]] — day",
      "    - Siblings",
      "        - [[Peer Note]] — sibling",
    ].join("\n"),
  );
});

test("compassOutline filters hidden nodes, drops emptied sides, renders groups, and reports warnings", () => {
  const hood = {
    center: { uid: "p-c", kind: "page", title: "Hub" },
    nodes: [
      { uid: "p-only-north", kind: "page", title: "Hidden Parent", zone: "north", label: "Parent" },
      {
        uid: "g-tasks",
        kind: "group",
        title: "Tasks",
        count: 3,
        zone: "south",
        children: [{ uid: "p-ignored", kind: "page", title: "Should Not Render" }],
      },
      { uid: "p-bad", kind: "page", title: "Broken ]] Title", zone: "south", label: "Child" },
      { uid: "p-hide-2", kind: "page", title: "Hidden Child", zone: "south", label: "" },
    ],
  };

  const warnings = [];
  const md = compassOutline(hood, {
    hidden: new Set(["p-only-north", "p-hide-2"]),
    warnings,
  });

  assert.equal(
    md,
    [
      "- [[Hub]]",
      "    - Children",
      "        - Tasks (3)",
      "        - Broken ]] Title — Child",
    ].join("\n"),
  );
  assert.deepEqual(warnings, [
    "1 title could not be written as a link.",
    "2 hidden nodes were left out.",
  ]);
});

test("compassOutline works directly on buildNeighborhood output and handles empty inputs", () => {
  assert.equal(compassOutline(null), "");
  assert.equal(compassOutline({}), "");
  assert.equal(
    compassOutline({ center: { uid: "p-solo", kind: "page", title: "Solo" }, nodes: [] }),
    "- [[Solo]]",
  );

  const hood = buildNeighborhood({
    center: { uid: "p-alpha", kind: "page", title: "Project Alpha" },
    out: [
      {
        uid: "h-1",
        attribute: "Owner",
        source: { uid: "b-1", string: "Owner:: [[Jane]]" },
        values: [{ uid: "p-jane", title: "Jane" }],
        labels: [{ attribute: "Role", text: "Lead" }],
      },
    ],
    outline: [],
  });
  assert.equal(
    compassOutline(hood),
    [
      "- [[Project Alpha]]",
      "    - Children",
      "        - [[Jane]] — Owner · Role: Lead",
    ].join("\n"),
  );
});

test("treeOutline renders root, Parents directly below root, nested children, repeats, hidden, and warnings", () => {
  assert.equal(treeOutline(null), "");
  assert.equal(treeOutline({}), "");

  const outline = {
    root: {
      uid: "p-t1",
      title: "Task One",
      kind: "page",
      label: "",
      status: "expanded",
      children: [
        {
          uid: "p-sa",
          title: "Subtask A",
          kind: "page",
          label: "Child",
          status: "expanded",
          children: [
            {
              uid: "b-detail",
              title: "Detail block",
              kind: "block",
              label: "",
              status: "leaf",
              children: [],
            },
            {
              uid: "p-t1-repeat",
              title: "Task One",
              kind: "page",
              label: "Friend",
              status: "repeat",
              children: [
                { uid: "p-never", title: "Should Not Appear", kind: "page", label: "", status: "leaf", children: [] },
              ],
            },
          ],
        },
        {
          uid: "p-hidden",
          title: "Hidden Branch",
          kind: "page",
          label: "Child",
          status: "expanded",
          children: [
            { uid: "p-hidden-kid", title: "Hidden Grandchild", kind: "page", label: "", status: "leaf", children: [] },
          ],
        },
      ],
    },
    parents: [
      { uid: "p-alpha", title: "Project Alpha", kind: "page", label: "Parent", status: "leaf", children: [] },
    ],
  };

  const warnings = [];
  const md = treeOutline(outline, {
    labels: "visible",
    hidden: new Set(["p-hidden"]),
    warnings,
  });

  assert.equal(
    md,
    [
      "- [[Task One]]",
      "    - Parents",
      "        - [[Project Alpha]] — Parent",
      "    - [[Subtask A]] — Child",
      "        - ((b-detail))",
      "        - [[Task One]] — Friend ↺",
    ].join("\n"),
  );
  assert.deepEqual(warnings, ["1 hidden node was left out."]);

  const noLabels = treeOutline(outline, { labels: "none", hidden: new Set(["p-alpha", "p-hidden"]) });
  assert.equal(
    noLabels,
    [
      "- [[Task One]]",
      "    - [[Subtask A]]",
      "        - ((b-detail))",
      "        - [[Task One]] ↺",
    ].join("\n"),
  );
});

test("facetsOutline renders categories, Unassigned, and Conflicting when non-empty, with labels and warnings", () => {
  assert.equal(facetsOutline(null, new Map(), null), "");
  assert.equal(facetsOutline({}, new Map(), null), "");

  const nodesByUid = new Map([
    ["p-t1", { uid: "p-t1", kind: "page", title: "Task One", label: "Child" }],
    ["p-jane", { uid: "p-jane", kind: "page", title: "Jane", label: "Owner · Role: Lead" }],
    ["p-misc", { uid: "p-misc", kind: "page", title: "Loose ]] Note", label: "", style: "link" }],
    ["p-both", { uid: "p-both", kind: "page", title: "Dual Role", label: "Friend" }],
    ["p-secret", { uid: "p-secret", kind: "page", title: "Secret", label: "" }],
  ]);

  const classified = {
    categories: [
      { id: "tasks", label: "Tasks", uids: ["p-t1", "p-secret"] },
      { id: "empty", label: "Empty Category", uids: [] },
      { id: "people", label: "People", uids: ["p-jane"] },
    ],
    unassigned: ["p-misc"],
    conflicting: ["p-both"],
  };

  const center = { uid: "p-alpha", kind: "page", title: "Project Alpha" };
  const warnings = [];
  const md = facetsOutline(classified, nodesByUid, center, {
    labels: "all",
    hidden: new Set(["p-secret"]),
    warnings,
  });

  assert.equal(
    md,
    [
      "- [[Project Alpha]]",
      "    - Tasks",
      "        - [[Task One]] — Child",
      "    - People",
      "        - [[Jane]] — Owner · Role: Lead",
      "    - Unassigned",
      "        - Loose ]] Note — link",
      "    - Conflicting",
      "        - [[Dual Role]] — Friend",
    ].join("\n"),
  );
  assert.deepEqual(warnings, [
    "1 title could not be written as a link.",
    "1 hidden node was left out.",
  ]);

  const cleanClassified = {
    categories: [{ id: "tasks", label: "Tasks", uids: ["p-t1"] }],
    unassigned: [],
    conflicting: [],
  };
  assert.equal(
    facetsOutline(cleanClassified, nodesByUid, center, { labels: "none" }),
    [
      "- [[Project Alpha]]",
      "    - Tasks",
      "        - [[Task One]]",
    ].join("\n"),
  );
});

test("breadcrumbs writes one bullet per visit newest first and reports unlinked titles", () => {
  assert.equal(breadcrumbs(null), "");
  assert.equal(breadcrumbs([]), "");

  const chronological = [
    { uid: "p-1", title: "First Page", kind: "page", at: 1000 },
    { uid: "b-2", title: "Focused Block", kind: "block", at: 2000 },
    { uid: "p-3", title: "Latest Page", kind: "page", at: 3000 },
  ];
  assert.equal(
    breadcrumbs(chronological),
    [
      "- [[Latest Page]]",
      "- ((b-2))",
      "- [[First Page]]",
    ].join("\n"),
  );

  const warnings = [];
  const broken = [
    { uid: "p-a", title: "Bad ]] One", kind: "page" },
    { uid: "p-b", title: "Bad ]] Two", kind: "page" },
  ];
  assert.equal(
    breadcrumbs(broken, { warnings }),
    "- Bad ]] One\n- Bad ]] Two",
  );
  assert.deepEqual(warnings, ["2 titles could not be written as a link."]);
});

function makeMiniEnv() {
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
      setAttribute(k, v) {
        node.attrs[k] = String(v);
      },
      getAttribute(k) {
        return node.attrs[k] ?? null;
      },
      removeAttribute(k) {
        delete node.attrs[k];
      },
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
      focus() {
        doc.activeElement = node;
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
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
      click() {
        node.dispatchEvent({ type: "click" });
      },
      querySelectorAll(pred) {
        const out = [];
        const walk = (cur) => {
          for (const ch of cur.children) {
            if (typeof pred === "function" ? pred(ch) : ch.classList.contains(pred.replace(/^\./, ""))) {
              out.push(ch);
            }
            walk(ch);
          }
        };
        walk(node);
        return out;
      },
    };
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
  const world = makeNode("div");
  stage.append(world);
  root.append(bar, stage);
  doc.body.append(root);

  const lifecycle = createLifecycle();
  const features = createFeatures();
  const statuses = [];
  const barButtons = [];
  const state = {
    isOpen: true,
    zoom: 1,
    panX: 0,
    panY: 0,
    lens: { pages: true, blocks: true, drawings: true, regions: true, keyword: "" },
    geometry: { bounds: { minX: -100, minY: -50, maxX: 100, maxY: 50 } },
    hood: {
      center: { uid: "p-alpha", kind: "page", title: "Project Alpha" },
      nodes: [
        { uid: "p-t1", kind: "page", title: "Task One", zone: "south", label: "Child" },
        { uid: "p-bad", kind: "page", title: "Bad ]] Link", zone: "south", label: "" },
      ],
    },
  };

  const ctx = {
    lifecycle,
    features,
    dom: { root, bar, stage, world },
    state,
    el(tag, cls, text) {
      const n = makeNode(tag);
      if (cls) n.classList.add(...cls.split(/\s+/));
      if (text !== undefined) n.textContent = text;
      return n;
    },
    button(cls, text, ariaLabel) {
      const b = makeNode("button");
      b.type = "button";
      if (cls) b.classList.add(...cls.split(/\s+/));
      if (text !== undefined) b.textContent = text;
      if (ariaLabel) b.setAttribute("aria-label", ariaLabel);
      return b;
    },
    guard: (fn) => (...args) => Promise.resolve(fn(...args)),
    addBarButton(btn) {
      barButtons.push(btn);
      bar.append(btn);
      return btn;
    },
    hideFloating() {},
    setStatus(msg) {
      statuses.push(msg);
    },
    titleOf: (uid) => uid,
    nodeKind: () => "page",
  };

  return { doc, root, stage, lifecycle, features, state, statuses, barButtons, ctx };
}

test("createExport dispatches outline across Compass, Mind Map, and Facets, integrates lenses and trail, and manages dialog lifecycle", async () => {
  const prevDoc = globalThis.document;
  const prevNav = globalThis.navigator;
  const env = makeMiniEnv();
  const copied = [];
  globalThis.document = env.doc;
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async (text) => { copied.push(text); } } },
    configurable: true,
    writable: true,
  });

  try {
    assert.equal(createExport(null).name, "export");

    let activeView = "compass";
    let mindmapOutlineData = null;
    let facetsData = null;
    let hiddenSet = new Set(["p-bad"]);
    let trailEntries = [];

    env.features.add({ name: "views", current: () => ({ view: activeView, preset: null }) });
    env.features.add({ name: "mindmap", outline: () => mindmapOutlineData });
    env.features.add({ name: "facets", classified: () => facetsData });
    env.features.add({ name: "lenses", hiddenFor: () => hiddenSet });
    env.features.add({
      name: "trail",
      entries: () => trailEntries,
      markdown: () => breadcrumbs(trailEntries),
    });

    const exp = createExport(env.ctx);
    env.features.add(exp);

    assert.equal(env.barButtons.length, 1);
    assert.equal(env.barButtons[0].textContent, "Export image");
    assert.deepEqual(
      exp.stageMenu().map((item) => item.title),
      ["Export outline as Markdown…", "Export image…", "Copy breadcrumbs as Markdown"],
    );
    assert.deepEqual(
      exp.commands().map((item) => item.id),
      ["export-outline", "export-image", "export-breadcrumbs"],
    );

    // Empty trail status.
    assert.equal(await exp.copyBreadcrumbs(), false);
    assert.equal(env.statuses.at(-1), "There is no trail yet.");

    // Non-empty trail copy.
    trailEntries = [
      { uid: "p-beta", title: "Project Beta", kind: "page", at: 20 },
      { uid: "p-alpha", title: "Project Alpha", kind: "page", at: 10 },
    ];
    assert.equal(await exp.copyBreadcrumbs(), true);
    assert.equal(env.statuses.at(-1), "Copied 2 visits");
    assert.equal(copied.at(-1), "- [[Project Beta]]\n- [[Project Alpha]]");

    // Compass outline with lenses.hiddenFor warning and focus restore.
    env.stage.focus();
    exp.openOutline();
    const backdrop = env.root.querySelectorAll(".compass-export-backdrop")[0];
    assert.equal(backdrop.hidden, false);
    const preview = backdrop.querySelectorAll(".compass-export-preview")[0];
    assert.equal(
      preview.textContent,
      "- [[Project Alpha]]\n    - Children\n        - [[Task One]] — Child",
    );
    const warnings = backdrop.querySelectorAll(".compass-export-warning");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].textContent, "1 hidden node was left out.");

    const copyBtn = backdrop.querySelectorAll(".compass-export-copy-md")[0];
    await copyBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(env.statuses.at(-1), "Outline copied");

    // Mind Map view dispatches to mindmap.outline() and falls back when null.
    activeView = "mindmap";
    mindmapOutlineData = {
      root: {
        uid: "p-alpha",
        title: "Project Alpha",
        kind: "page",
        label: "",
        status: "expanded",
        children: [{ uid: "p-t1", title: "Task One", kind: "page", label: "Child", status: "leaf", children: [] }],
      },
      parents: [],
    };
    hiddenSet = new Set();
    exp.openOutline();
    assert.equal(
      backdrop.querySelectorAll(".compass-export-preview")[0].textContent,
      "- [[Project Alpha]]\n    - [[Task One]] — Child",
    );

    mindmapOutlineData = null;
    exp.openOutline();
    assert.ok(backdrop.querySelectorAll(".compass-export-preview")[0].textContent.includes("    - Children"));

    // Facets view dispatches to facets.classified() and falls back when null.
    activeView = "facets";
    facetsData = {
      categories: [{ id: "work", label: "Work", uids: ["p-t1"] }],
      unassigned: [],
      conflicting: [],
    };
    exp.openOutline();
    assert.equal(
      backdrop.querySelectorAll(".compass-export-preview")[0].textContent,
      "- [[Project Alpha]]\n    - Work\n        - [[Task One]] — Child",
    );

    // Escape closes dialog and restores focus; onClose closes without error.
    assert.equal(exp.onEscape(), true);
    assert.equal(backdrop.hidden, true);
    assert.equal(env.doc.activeElement, env.stage);
    assert.equal(exp.onEscape(), false);

    exp.openOutline();
    backdrop.dispatchEvent({ type: "click", target: backdrop });
    assert.equal(backdrop.hidden, true);

    exp.openOutline();
    exp.onClose();
    assert.equal(backdrop.hidden, true);
  } finally {
    await env.lifecycle.dispose();
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevNav === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, "navigator", { value: prevNav, configurable: true, writable: true });
  }
});
