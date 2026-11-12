import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTree,
  collapseGeneration,
  expandGeneration,
  layoutTree,
  toggleFold,
  treeOutline,
} from "../src/model/mindmap.js";
import { createMindMap } from "../src/view/features/mindmap.js";

function node(uid, title = uid, extra = {}) {
  return {
    uid,
    title,
    kind: "page",
    style: "typed",
    label: "",
    role: "child",
    zone: "south",
    ...extra,
  };
}

function overlaps(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

function assertNoOverlaps(placed) {
  const boxes = [placed.center, ...placed.items];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.equal(
        overlaps(boxes[i], boxes[j]),
        false,
        `${boxes[i].key ?? "center"} overlaps ${boxes[j].key ?? "center"}`,
      );
    }
  }
}

test("buildTree opens occurrences below generations, folds at the frontier without calling childrenOf, and marks leaves", () => {
  const calls = [];
  const graph = {
    a: [node("a1"), node("a2")],
    b: [],
    a1: [node("a1x")],
    a2: [],
  };
  const tree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("a"), node("b")],
    parents: [node("p1", "Parent 1", { zone: "north", role: "parent" })],
    peers: [node("f1", "Friend 1", { zone: "west", role: "friend" })],
    childrenOf: (uid) => {
      calls.push(uid);
      return graph[uid] ?? [];
    },
    generations: 2,
  });

  assert.equal(tree.root.key, "r");
  assert.equal(tree.root.status, "open");
  assert.equal(tree.root.childCount, 2);
  assert.equal(tree.truncated, false);
  assert.equal(tree.count, 5);

  const [occA, occB] = tree.root.children;
  assert.equal(occA.key, "r/a");
  assert.equal(occA.status, "open");
  assert.equal(occA.childCount, 2);
  assert.equal(occB.key, "r/b");
  assert.equal(occB.status, "leaf");
  assert.equal(occB.childCount, 0);

  const [occA1, occA2] = occA.children;
  assert.equal(occA1.key, "r/a/a1");
  assert.equal(occA1.depth, 2);
  assert.equal(occA1.status, "folded");
  assert.equal(occA1.childCount, null);
  assert.deepEqual(occA1.children, []);
  assert.equal(occA2.status, "folded");
  assert.equal(occA2.childCount, null);

  assert.deepEqual(calls, ["a", "b"]);
});

test("buildTree detects cycles and breadth-first repeats so shallowest occurrence wins", () => {
  const calls = [];
  const graph = {
    a: [node("shared"), node("r")],
    shared: [node("deep")],
    deep: [node("a")],
  };
  const tree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("a"), node("shared")],
    childrenOf: (uid) => {
      calls.push(uid);
      return graph[uid] ?? [];
    },
    generations: 4,
  });

  const [occA, occSharedTop] = tree.root.children;
  assert.equal(occSharedTop.key, "r/shared");
  assert.equal(occSharedTop.status, "open");
  assert.equal(occSharedTop.children[0].uid, "deep");

  const [occSharedUnderA, occRootCycle] = occA.children;
  assert.equal(occSharedUnderA.key, "r/a/shared");
  assert.equal(occSharedUnderA.status, "repeat");
  assert.equal(occSharedUnderA.childCount, null);
  assert.deepEqual(occSharedUnderA.children, []);

  assert.equal(occRootCycle.key, "r/a/r");
  assert.equal(occRootCycle.status, "repeat");
  assert.deepEqual(occRootCycle.children, []);

  const occDeep = occSharedTop.children[0];
  assert.equal(occDeep.children[0].key, "r/shared/deep/a");
  assert.equal(occDeep.children[0].status, "repeat");
  assert.equal(calls.filter((u) => u === "shared").length, 1);
});

test("toggleFold, expandGeneration, and collapseGeneration respect state.folded and state.opened around generations", () => {
  const graph = {
    t1: [node("sa"), node("sb")],
    t2: [],
    sa: [node("da1")],
    sb: [],
    da1: [],
  };
  const build = (state) => buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("t1"), node("t2")],
    childrenOf: (uid) => graph[uid] ?? [],
    state,
    generations: 2,
  });

  let state = { folded: new Set(), opened: new Set(), limits: new Map() };
  let tree = build(state);
  const sa = tree.root.children[0].children[0];
  assert.equal(sa.status, "folded");

  state = toggleFold(state, sa, 2);
  assert.equal(state.opened.has("r/t1/sa"), true);
  tree = build(state);
  assert.equal(tree.root.children[0].children[0].status, "open");
  assert.equal(tree.root.children[0].children[0].children[0].uid, "da1");
  assert.equal(tree.root.children[0].children[0].children[0].status, "folded");

  state = toggleFold(state, tree.root.children[0], 2);
  assert.equal(state.folded.has("r/t1"), true);
  tree = build(state);
  assert.equal(tree.root.children[0].status, "folded");
  assert.deepEqual(tree.root.children[0].children, []);

  state = expandGeneration(tree, state);
  assert.equal(state.folded.has("r/t1"), false);
  tree = build(state);
  assert.equal(tree.root.children[0].status, "open");

  state = collapseGeneration(tree, state);
  tree = build(state);
  assert.equal(tree.root.children[0].children[0].status, "folded");
  assert.equal(tree.root.children[0].status, "open");

  state = collapseGeneration(tree, state);
  tree = build(state);
  assert.equal(tree.root.children[0].status, "folded");
  assert.equal(tree.root.status, "open");

  state = collapseGeneration(tree, state);
  tree = build(state);
  assert.equal(tree.root.status, "open");
});

test("buildTree enforces maxChildren, per-key state.limits, and maxNodes truncation", () => {
  const many = Array.from({ length: 15 }, (_, idx) => node(`c${idx}`));
  const state = {
    folded: new Set(),
    opened: new Set(),
    limits: new Map([["r/c0", 4]]),
  };
  const subKids = Array.from({ length: 6 }, (_, idx) => node(`g${idx}`));

  const tree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: many,
    childrenOf: (uid) => (uid === "c0" ? subKids : []),
    state,
    generations: 2,
    maxChildren: 5,
    maxNodes: 300,
  });

  assert.equal(tree.root.childCount, 15);
  assert.equal(tree.root.children.length, 5);
  assert.equal(tree.root.hidden, 10);
  assert.equal(tree.root.children[0].children.length, 4);
  assert.equal(tree.root.children[0].hidden, 2);
  assert.equal(tree.truncated, false);

  const exactFit = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("x1"), node("x2")],
    childrenOf: () => [],
    generations: 2,
    maxNodes: 3,
  });
  assert.equal(exactFit.count, 3);
  assert.equal(exactFit.truncated, false);

  const capped = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: many,
    childrenOf: (uid) => (uid === "c0" ? subKids : []),
    generations: 2,
    maxChildren: 12,
    maxNodes: 6,
  });
  assert.equal(capped.count, 6);
  assert.equal(capped.truncated, true);
  assert.equal(capped.root.children.length, 5);
});

test("layoutTree lays out right, left, and balanced trees without overlap and centers parents on descendants", () => {
  const graph = {
    a: [node("a1"), node("a2"), node("a3")],
    b: [node("b1")],
    c: [],
    d: [node("d1"), node("d2")],
  };
  const tree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("a"), node("b"), node("c"), node("d")],
    parents: [
      node("p1", "P1", { zone: "north" }),
      node("p2", "P2", { zone: "north" }),
      node("p3", "P3", { zone: "north" }),
      node("p4", "P4", { zone: "north" }),
    ],
    peers: [
      node("w1", "W1", { zone: "west" }),
      node("e1", "E1", { zone: "east" }),
    ],
    childrenOf: (uid) => graph[uid] ?? [],
    generations: 2,
    maxChildren: 2,
  });

  const right = layoutTree(tree, { direction: "right" });
  assertNoOverlaps(right);
  assert.deepEqual(right.center, { x: 0, y: 0, w: 240, h: 56 });

  const rightByKey = new Map(right.items.map((item) => [item.key, item]));
  for (const occ of tree.root.children) {
    const parentBox = rightByKey.get(occ.key);
    assert.ok(parentBox.x - parentBox.w / 2 > right.center.w / 2);
    const childBoxes = right.items.filter((item) => (
      (occ.children.some((c) => c.key === item.key)) || item.parentKey === occ.key
    ));
    if (childBoxes.length) {
      for (const cb of childBoxes) {
        assert.ok(cb.x - cb.w / 2 > parentBox.x + parentBox.w / 2);
      }
      const top = Math.min(...childBoxes.map((cb) => cb.y - cb.h / 2));
      const bottom = Math.max(...childBoxes.map((cb) => cb.y + cb.h / 2));
      assert.equal(parentBox.y, (top + bottom) / 2);
    }
  }
  assert.ok(rightByKey.has("r/a#more"));
  assert.equal(rightByKey.get("r/a#more").kind, "more");
  assert.ok(rightByKey.get("peer:w1").x + rightByKey.get("peer:w1").w / 2 < -right.center.w / 2);
  assert.equal(rightByKey.get("peer:w1").zone, "west");
  assert.equal(rightByKey.get("peer:e1").zone, "east");

  const left = layoutTree(tree, { direction: "left" });
  assertNoOverlaps(left);
  const leftByKey = new Map(left.items.map((item) => [item.key, item]));
  for (const occ of tree.root.children) {
    const parentBox = leftByKey.get(occ.key);
    assert.equal(parentBox.x, -rightByKey.get(occ.key).x);
    assert.ok(parentBox.x + parentBox.w / 2 < -left.center.w / 2);
  }
  assert.ok(leftByKey.get("peer:w1").x - leftByKey.get("peer:w1").w / 2 > left.center.w / 2);

  const balanced = layoutTree(tree, { direction: "balanced" });
  assertNoOverlaps(balanced);
  const balTreeItems = balanced.items.filter((item) => item.zone === "south" && item.kind === "node" && item.depth === 1);
  assert.ok(balTreeItems.some((item) => item.x > 0 && item.side === "right"));
  assert.ok(balTreeItems.some((item) => item.x < 0 && item.side === "left"));
});

test("layoutTree places parents in centered rows of at most three growing upward and handles balanced peer room", () => {
  const parents = Array.from({ length: 5 }, (_, i) => node(`p${i}`, `Parent ${i}`, { zone: "north" }));
  const shortTree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("c1"), node("c2")],
    parents,
    peers: [node("f1", "Friend 1", { zone: "west" })],
    childrenOf: () => [],
    generations: 2,
  });
  const placedShort = layoutTree(shortTree, { direction: "balanced" });
  assertNoOverlaps(placedShort);
  assert.equal(placedShort.peersOmitted, 0);

  const peerBox = placedShort.items.find((item) => item.key === "peer:f1");
  assert.ok(peerBox);
  assert.ok(peerBox.y + peerBox.h / 2 < -placedShort.center.h / 2);

  const parentItems = placedShort.items.filter((item) => item.zone === "north");
  assert.equal(parentItems.length, 5);
  const row0 = parentItems.slice(0, 3);
  const row1 = parentItems.slice(3, 5);
  assert.equal(row0[0].y, row0[1].y);
  assert.equal(row0[1].y, row0[2].y);
  assert.equal(row0[1].x, 0);
  assert.equal(row0[0].x, -row0[2].x);
  assert.equal(row1[0].y, row1[1].y);
  assert.equal(row1[0].x, -row1[1].x);
  assert.ok(row1[0].y + row1[0].h / 2 < row0[0].y - row0[0].h / 2);
  assert.ok(row0[0].y + row0[0].h / 2 < peerBox.y - peerBox.h / 2);

  const crowdedPeers = Array.from({ length: 4 }, (_, i) => node(`peer-${i}`, `Peer ${i}`, { zone: "west" }));
  const tallChildren = Array.from({ length: 8 }, (_, i) => node(`tc-${i}`));
  const tallTree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: tallChildren,
    parents: parents.slice(0, 3),
    peers: crowdedPeers,
    childrenOf: () => [],
    generations: 2,
  });
  const placedTall = layoutTree(tallTree, { direction: "balanced" });
  assertNoOverlaps(placedTall);
  assert.equal(placedTall.peersOmitted, 4);
  assert.equal(placedTall.items.some((item) => item.key.startsWith("peer:")), false);
});

test("layoutTree bounds cover every item and links connect exact box edges", () => {
  const tree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [node("a"), node("b")],
    parents: [node("p1", "P1", { zone: "north" })],
    peers: [node("f1", "F1", { zone: "west" })],
    childrenOf: (uid) => (uid === "a" ? [node("a1")] : []),
    generations: 2,
  });
  const placed = layoutTree(tree, { direction: "right" });
  const byKey = new Map([[tree.root.key, placed.center], ...placed.items.map((item) => [item.key, item])]);

  for (const box of byKey.values()) {
    assert.ok(box.x - box.w / 2 >= placed.bounds.minX);
    assert.ok(box.x + box.w / 2 <= placed.bounds.maxX);
    assert.ok(box.y - box.h / 2 >= placed.bounds.minY);
    assert.ok(box.y + box.h / 2 <= placed.bounds.maxY);
  }

  for (const link of placed.links) {
    const fromBox = byKey.get(link.fromKey);
    const toBox = byKey.get(link.toKey);
    assert.ok(fromBox && toBox);
    if (link.side === "right") {
      assert.equal(link.from.x, fromBox.x + fromBox.w / 2);
      assert.equal(link.to.x, toBox.x - toBox.w / 2);
    } else if (link.side === "left") {
      assert.equal(link.from.x, fromBox.x - fromBox.w / 2);
      assert.equal(link.to.x, toBox.x + toBox.w / 2);
    } else if (link.side === "north") {
      assert.equal(link.from.y, fromBox.y - fromBox.h / 2);
      assert.equal(link.to.y, toBox.y + toBox.h / 2);
    }
  }
});

test("treeOutline covers only visible branches and omits folded subtrees and hidden children", () => {
  assert.equal(treeOutline(null), null);
  const tree = buildTree({
    root: { uid: "r", title: "Root", kind: "page" },
    children: [
      node("t1", "Task One", { label: "Child" }),
      node("t2", "Task Two"),
      node("t3", "Task Three"),
    ],
    parents: [node("prog", "Programs", { zone: "north", label: "Parent" })],
    childrenOf: (uid) => (uid === "t1" ? [node("sa", "Subtask A")] : []),
    generations: 2,
    maxChildren: 2,
  });

  const outline = treeOutline(tree);
  assert.deepEqual(outline, {
    root: {
      uid: "r",
      title: "Root",
      kind: "page",
      label: "",
      status: "open",
      children: [
        {
          uid: "t1",
          title: "Task One",
          kind: "page",
          label: "Child",
          status: "open",
          children: [
            {
              uid: "sa",
              title: "Subtask A",
              kind: "page",
              label: "",
              status: "folded",
              children: [],
            },
          ],
        },
        {
          uid: "t2",
          title: "Task Two",
          kind: "page",
          label: "",
          status: "leaf",
          children: [],
        },
      ],
    },
    parents: [
      {
        uid: "prog",
        title: "Programs",
        kind: "page",
        label: "Parent",
        status: "leaf",
        children: [],
      },
    ],
  });
});

test("createMindMap tolerates null ctx and stays inactive when views is not mindmap", () => {
  const stub = createMindMap(null);
  assert.equal(stub.name, "mindmap");
  assert.equal(stub.tree(), null);
  assert.equal(stub.outline(), null);
});

function makeMiniEl(tag) {
  const classes = () => new Set(String(el.className || "").split(/\s+/).filter(Boolean));
  const el = {
    tag,
    className: "",
    textContent: "",
    title: "",
    hidden: false,
    tabIndex: 0,
    type: "",
    dataset: {},
    attrs: {},
    style: {},
    children: [],
    parentElement: null,
    setAttribute(name, val) {
      el.attrs[name] = String(val);
      if (name === "class") el.className = String(val);
    },
    getAttribute(name) {
      return el.attrs[name] ?? null;
    },
    classList: {
      contains: (c) => classes().has(c),
      toggle(c, force) {
        const set = classes();
        const on = force === undefined ? !set.has(c) : Boolean(force);
        if (on) set.add(c);
        else set.delete(c);
        el.className = [...set].join(" ");
      },
    },
    append(...kids) {
      for (const kid of kids) {
        if (!kid) continue;
        if (kid.parentElement) kid.remove();
        kid.parentElement = el;
        el.children.push(kid);
      }
    },
    replaceChildren(...kids) {
      for (const kid of [...el.children]) kid.remove();
      el.append(...kids);
    },
    remove() {
      if (!el.parentElement) return;
      el.parentElement.children = el.parentElement.children.filter((k) => k !== el);
      el.parentElement = null;
    },
    closest(selector) {
      let cur = el;
      while (cur) {
        const names = new Set(String(cur.className || "").split(/\s+/).filter(Boolean));
        const matched = String(selector).split(",").some((part) => {
          const clean = part.trim();
          return clean.startsWith(".") && names.has(clean.slice(1));
        });
        if (matched) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    focus() {
      if (globalThis.document) globalThis.document.activeElement = el;
    },
  };
  return el;
}

test("createMindMap reuses keyed elements, handles chevrons, Alt+Enter, commands, stageMenu, and per-root state", async () => {
  const prevDoc = globalThis.document;
  globalThis.document = { activeElement: null };
  try {
    const world = makeMiniEl("div");
    let activeView = "compass";
    const settings = {
      view: "compass",
      mindmapDirection: "right",
      mindmapGenerations: 2,
      model: {},
    };
    const statuses = [];
    let renderCount = 0;
    let fitCount = 0;
    let mm = null;

    const snaps = {
      "t-1": {
        center: { uid: "t-1", kind: "page", title: "Task 1" },
        out: [{
          uid: "h-1",
          attribute: "Child",
          values: [{ uid: "s-1", title: "Sub 1" }],
          labels: [],
        }],
        in: [],
        outline: [],
      },
      "s-1": {
        center: { uid: "s-1", kind: "page", title: "Sub 1" },
        out: [{
          uid: "h-2",
          attribute: "Child",
          values: [{ uid: "d-1", title: "Deep 1" }],
          labels: [],
        }],
        in: [],
        outline: [],
      },
      "d-1": {
        center: { uid: "d-1", kind: "page", title: "Deep 1" },
        out: [],
        in: [],
        outline: [],
      },
    };

    const hoodAlpha = {
      center: { uid: "alpha", kind: "page", title: "Alpha", badges: [] },
      nodes: [
        node("t-1", "Task 1", { zone: "south", label: "Child" }),
        node("p-1", "Parent 1", { zone: "north", role: "parent" }),
        node("w-1", "Peer 1", { zone: "west", role: "friend" }),
        node("w-2", "Peer 2", { zone: "west", role: "friend" }),
        node("w-3", "Peer 3", { zone: "west", role: "friend" }),
        node("w-4", "Peer 4", { zone: "west", role: "friend" }),
        node("w-5", "Peer 5", { zone: "west", role: "friend" }),
      ],
      overflow: {},
    };
    let currentHood = hoodAlpha;

    const ctx = {
      dom: { world },
      lifecycle: {
        node(el, parent) {
          parent.append(el);
          return el;
        },
      },
      features: {
        get(name) {
          if (name === "views") return { current: () => ({ view: activeView, preset: "roles" }) };
          return null;
        },
        pipe(_hook, val) {
          return val;
        },
      },
      host: {
        snapshot: (uid) => snaps[uid] ?? { center: { uid, kind: "page", title: uid }, missing: true },
      },
      state: {
        get settings() { return settings; },
        get lens() { return { pages: true, blocks: true, drawings: true, regions: true, keyword: "" }; },
      },
      el: (tag, cls, text) => {
        const nodeEl = makeMiniEl(tag);
        if (cls) nodeEl.className = cls;
        if (text != null) nodeEl.textContent = text;
        return nodeEl;
      },
      button: (cls, text, label) => {
        const btn = makeMiniEl("button");
        btn.type = "button";
        if (cls) btn.className = cls;
        if (text != null) btn.textContent = text;
        if (label) {
          btn.title = label;
          btn.setAttribute("aria-label", label);
        }
        return btn;
      },
      svg: (tag, cls) => {
        const s = makeMiniEl(tag);
        if (cls) s.setAttribute("class", cls);
        return s;
      },
      curve: (sx, sy, ex, ey) => ({ d: `M${sx},${sy} L${ex},${ey}`, mid: [(sx + ex) / 2, (sy + ey) / 2] }),
      setStatus: (msg) => statuses.push(msg),
      saveSetting: async (id, val) => {
        if (id === "compass-mindmap-direction") settings.mindmapDirection = val;
        mm.onSettings(settings);
      },
      render: () => {
        renderCount += 1;
        mm.renderView({ hood: currentHood, settings, navigate: false });
      },
      fit: () => { fitCount += 1; },
    };

    mm = createMindMap(ctx);
    assert.equal(mm.renderView({ hood: currentHood, settings, navigate: true }), null);
    assert.deepEqual(mm.commands(), []);
    assert.deepEqual(mm.stageMenu(), []);
    assert.equal(mm.tree(), null);
    assert.equal(mm.outline(), null);

    activeView = "mindmap";
    const res1 = mm.renderView({ hood: currentHood, settings, navigate: true });
    assert.equal(res1.view, "mindmap");
    assert.equal(mm.tree().root.uid, "alpha");
    assert.equal(mm.outline().root.title, "Alpha");

    const layer = world.children[0];
    const t1ElBefore = layer.children.find((c) => c.dataset?.key === "alpha/t-1");
    assert.ok(t1ElBefore);

    mm.renderView({ hood: currentHood, settings, navigate: false });
    const t1ElAfter = layer.children.find((c) => c.dataset?.key === "alpha/t-1");
    assert.equal(t1ElAfter, t1ElBefore);

    const s1El = layer.children.find((c) => c.dataset?.key === "alpha/t-1/s-1");
    const s1Chev = s1El.children.find((c) => String(c.className).includes("compass-mm-chevron"));
    assert.ok(s1Chev);
    assert.equal(s1Chev.getAttribute("aria-expanded"), "false");
    assert.equal(mm.onStageClick({ target: s1Chev, preventDefault() {} }), true);
    assert.ok(layer.children.some((c) => c.dataset?.key === "alpha/t-1/s-1/d-1"));

    globalThis.document.activeElement = t1ElBefore;
    assert.equal(mm.onKey({ key: "Enter", altKey: false }), false);
    assert.equal(mm.onKey({ key: "Enter", altKey: true }), true);
    assert.equal(layer.children.some((c) => c.dataset?.key === "alpha/t-1/s-1"), false);

    currentHood = { center: { uid: "empty", kind: "page", title: "Empty", badges: [] }, nodes: [], overflow: {} };
    mm.renderView({ hood: currentHood, settings, navigate: true });
    const emptyMsg = layer.children.find((c) => c.className === "compass-mm-empty");
    assert.equal(emptyMsg.hidden, false);
    assert.equal(emptyMsg.textContent, "Nothing branches from here yet.");

    currentHood = hoodAlpha;
    mm.renderView({ hood: currentHood, settings, navigate: true });
    assert.equal(layer.children.some((c) => c.dataset?.key === "alpha/t-1/s-1"), false);

    const menus = mm.stageMenu();
    assert.equal(menus.length, 2);
    menus[0].run();
    assert.equal(layer.children.some((c) => c.dataset?.key === "alpha/t-1/s-1"), true);

    const cmds = mm.commands();
    assert.deepEqual(cmds.map((c) => c.id), ["mm-expand", "mm-collapse", "mm-right", "mm-left", "mm-balanced"]);
    statuses.length = 0;
    await cmds[4].run();
    assert.equal(settings.mindmapDirection, "balanced");
    assert.ok(fitCount >= 1);
    assert.equal(statuses.length, 1);
    mm.renderView({ hood: currentHood, settings, navigate: false });
    assert.equal(statuses.length, 1);

    mm.clearView();
    assert.equal(layer.hidden, true);
    assert.equal(mm.tree(), null);
    assert.equal(renderCount > 0, true);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});
