import assert from "node:assert/strict";
import test from "node:test";

import { drawPlan } from "../src/model/draw-map.js";

const SCALE = 1.4;
const GAP = 24;

function placed(x, y, w, h) {
  const sw = w * SCALE;
  const sh = h * SCALE;
  return { x: x * SCALE - sw / 2, y: y * SCALE - sh / 2, w: sw, h: sh };
}

function gap(a, b, axis) {
  const size = axis === "x" ? "w" : "h";
  const a1 = a[axis] + a[size];
  const b1 = b[axis] + b[size];
  if (a1 <= b[axis]) return b[axis] - a1;
  if (b1 <= a[axis]) return a[axis] - b1;
  return -(Math.min(a1, b1) - Math.max(a[axis], b[axis]));
}

function assertSeparated(boxes) {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const gx = gap(boxes[i], boxes[j], "x");
      const gy = gap(boxes[i], boxes[j], "y");
      assert.ok(gx >= GAP - 0.05 || gy >= GAP - 0.05, `boxes ${i} and ${j} are closer than 24px`);
    }
  }
}

function page(uid, title, extra = {}) {
  return { uid, title, kind: "page", label: "", ...extra };
}

function item(uid, x, y, extra = {}) {
  return { uid, x, y, w: 180, h: 34, zone: "south", ...extra };
}

test("drawPlan writes page links, block refs, plain titles, and group counts", () => {
  const center = page("c", "Center");
  const nodes = [
    page("p", "Alpha"),
    page("q", "A [draft]"),
    { uid: "b", kind: "block", title: "Hello" },
    { uid: "group:south:tasks", kind: "group", title: "Tasks", count: 3, zone: "south" },
  ];
  const geometry = {
    center: { x: 0, y: 0, w: 240, h: 56 },
    items: [
      item("p", 400, 0),
      item("q", 400, 200),
      item("b", 400, 400, { zone: "east" }),
      item("group:south:tasks", 400, 600),
    ],
  };
  const linked = drawPlan({ view: "compass", center, geometry, nodes, links: true });
  const byUid = new Map(linked.boxes.map((box) => [box.uid, box]));
  assert.equal(byUid.get("c").text, "[[Center]]");
  assert.equal(byUid.get("p").text, "[[Alpha]]");
  assert.equal(byUid.get("q").text, "A [draft]");
  assert.equal(byUid.get("b").text, "((b))");
  assert.equal(byUid.get("group:south:tasks").text, "Tasks (3)");
  assert.equal(byUid.get("c").center, true);
  const expected = placed(0, 0, 240, 56);
  assert.equal(byUid.get("c").w, expected.w);
  assert.equal(byUid.get("c").h, expected.h);
  assert.equal(byUid.get("c").x, expected.x);
  assert.equal(byUid.get("c").y, expected.y);
  const far = placed(400, 0, 180, 34);
  assert.equal(byUid.get("p").x, far.x);
  assert.equal(byUid.get("p").y, far.y);

  const plain = drawPlan({ view: "compass", center, geometry, nodes, links: false });
  const plainByUid = new Map(plain.boxes.map((box) => [box.uid, box]));
  assert.equal(plainByUid.get("c").text, "Center");
  assert.equal(plainByUid.get("p").text, "Alpha");
  assert.equal(plainByUid.get("b").text, "Hello");
  assert.equal(plainByUid.get("group:south:tasks").text, "Tasks (3)");
  assert.ok(plain.boxes.every((box) => !box.text.includes("[[") && !box.text.includes("((")));
});

test("drawPlan pushes boxes apart on the axis of least overlap", () => {
  const center = page("c", "Center");
  const nodes = [page("side", "Side"), page("below", "Below")];
  const touching = drawPlan({
    view: "compass",
    center,
    nodes,
    geometry: {
      center: { x: 0, y: 0, w: 100, h: 40 },
      items: [item("side", 100, 0, { w: 100, h: 40 })],
    },
  });
  assertSeparated(touching.boxes);
  const stacked = drawPlan({
    view: "compass",
    center,
    nodes: [page("below", "Below")],
    geometry: {
      center: { x: 0, y: 0, w: 200, h: 40 },
      items: [item("below", 0, 30, { w: 200, h: 40 })],
    },
  });
  assert.equal(stacked.boxes.length, 2);
  assertSeparated(stacked.boxes);
  const gx = gap(stacked.boxes[0], stacked.boxes[1], "x");
  const gy = gap(stacked.boxes[0], stacked.boxes[1], "y");
  assert.ok(gy >= GAP - 0.05, "vertical pair separates on Y");
  assert.ok(gx < 0, "vertical pair still overlaps on X");
});

test("drawPlan points compass arrows by who owns the relation", () => {
  const center = page("c", "Center");
  const nodes = [
    page("out", "Out", {
      style: "typed",
      label: "Owner · Role: Lead",
      zone: "east",
      evidence: [{ kind: "typed", direction: "out" }],
    }),
    page("inn", "In", {
      style: "typed",
      label: "Child",
      zone: "north",
      evidence: [{ kind: "typed", direction: "in" }],
    }),
    page("link", "Budget", { style: "link", label: "", zone: "south" }),
    page("mention", "Notes", { style: "mention", label: "Mention", zone: "north" }),
    page("sib", "Sibling", { style: "sibling", role: "sibling", zone: "siblings", via: "out", label: "" }),
    page("lost", "Lost sib", { style: "sibling", role: "sibling", zone: "siblings", via: "missing", label: "" }),
    page("parent", "Programs", {
      style: "structural",
      role: "parent",
      zone: "north",
      evidence: [{ kind: "structural", note: "namespace" }],
    }),
  ];
  const geometry = {
    center: { x: 0, y: 0, w: 240, h: 56 },
    items: [
      item("out", 500, -200, { zone: "east" }),
      item("inn", 500, -400, { zone: "north" }),
      item("link", 500, 0, { zone: "south" }),
      item("mention", 500, 200, { zone: "north" }),
      item("sib", 500, 400, { zone: "siblings" }),
      item("lost", 500, 600, { zone: "siblings" }),
      item("parent", 500, 800, { zone: "north" }),
    ],
  };
  const plan = drawPlan({ view: "compass", center, geometry, nodes });
  const key = new Map(plan.boxes.map((box) => [box.uid, box.key]));
  const arrow = (from, to) => plan.arrows.find((item) => item.from === from && item.to === to);
  assert.deepEqual(arrow(key.get("c"), key.get("out")), {
    from: key.get("c"),
    to: key.get("out"),
    label: "Owner · Role: Lead",
  });
  assert.equal(arrow(key.get("inn"), key.get("c"))?.label, "Child");
  assert.ok(arrow(key.get("c"), key.get("link")));
  assert.ok(arrow(key.get("mention"), key.get("c")));
  assert.ok(arrow(key.get("out"), key.get("sib")));
  assert.equal(plan.arrows.some((item) => item.from === key.get("lost") || item.to === key.get("lost")), false);
  assert.ok(arrow(key.get("parent"), key.get("c")));
  assert.equal(plan.frames.length, 0);
  assert.equal(plan.omitted, 0);
});

test("drawPlan draws a mind map once per node and follows the tree", () => {
  const center = page("root", "Root");
  const nodes = [
    page("child", "Child"),
    page("grand", "Grand"),
    page("mom", "Mom"),
  ];
  const geometry = {
    center: { x: 0, y: 0, w: 240, h: 56 },
    items: [
      { key: "root/child", uid: "child", x: 300, y: 0, w: 180, h: 34, zone: "south", status: "open" },
      { key: "root/child/grand", uid: "grand", x: 560, y: -40, w: 180, h: 34, zone: "south", status: "leaf" },
      { key: "root/other/grand", uid: "grand", x: 560, y: 80, w: 180, h: 34, zone: "south", status: "repeat" },
      { key: "parent:mom", uid: "mom", x: 0, y: -200, w: 180, h: 34, zone: "north", status: "leaf" },
    ],
  };
  const tree = {
    root: {
      key: "root",
      uid: "root",
      children: [{
        key: "root/child",
        uid: "child",
        children: [
          { key: "root/child/grand", uid: "grand", children: [] },
          { key: "root/other/grand", uid: "grand", status: "repeat", children: [] },
        ],
      }],
    },
    parents: [{ uid: "mom", title: "Mom" }],
    peers: [{ uid: "peer", title: "Peer" }],
  };
  const plan = drawPlan({ view: "mindmap", center, geometry, nodes, tree });
  assert.equal(plan.boxes.filter((box) => box.uid === "grand").length, 1);
  const key = new Map(plan.boxes.map((box) => [box.uid, box.key]));
  assert.equal(key.get("grand"), "root/child/grand");
  const pair = (from, to) => plan.arrows.some((arrow) => arrow.from === from && arrow.to === to && arrow.label === "");
  assert.ok(pair(key.get("root"), key.get("child")));
  assert.ok(pair(key.get("child"), key.get("grand")));
  assert.ok(pair(key.get("mom"), key.get("root")));
  assert.equal(plan.arrows.length, 3);
  assert.equal(plan.frames.length, 0);
});

test("drawPlan frames each facet region and arrows from the center without labels", () => {
  const center = page("c", "Center");
  const nodes = [page("a", "Alpha"), page("b", "Beta")];
  const geometry = {
    center: { x: 0, y: 0, w: 240, h: 56 },
    items: [
      { key: "parents:a", uid: "a", zone: "parents", x: -400, y: -300, w: 180, h: 34 },
      { key: "children:b", uid: "b", zone: "children", x: 400, y: 300, w: 180, h: 34 },
    ],
    regions: [
      { id: "parents", label: "Parents", x: -400, y: -300, w: 280, h: 160 },
      { id: "children", name: "Children", x: 400, y: 300, w: 280, h: 160 },
    ],
  };
  const plan = drawPlan({ view: "facets", center, geometry, nodes });
  assert.deepEqual(plan.frames.map((frame) => frame.name), ["Parents", "Children"]);
  const key = new Map(plan.boxes.map((box) => [box.uid, box.key]));
  assert.deepEqual(plan.frames[0].members, [key.get("a")]);
  assert.deepEqual(plan.frames[1].members, [key.get("b")]);
  for (const frame of plan.frames) {
    for (const member of frame.members) {
      const box = plan.boxes.find((item) => item.key === member);
      assert.ok(box.x >= frame.x + 16 - 0.05);
      assert.ok(box.y >= frame.y + 16 - 0.05);
      assert.ok(box.x + box.w <= frame.x + frame.w - 16 + 0.05);
      assert.ok(box.y + box.h <= frame.y + frame.h - 16 + 0.05);
    }
  }
  assert.equal(plan.arrows.length, 2);
  assert.ok(plan.arrows.every((arrow) => arrow.from === key.get("c") && arrow.label === ""));
  const compass = drawPlan({ view: "compass", center, geometry, nodes });
  assert.equal(compass.frames.length, 0);
});

test("drawPlan keeps the center and the first 119 boxes in reading order", () => {
  const center = page("c", "Center");
  const nodes = [];
  const items = [];
  for (let index = 0; index < 121; index += 1) {
    const uid = `n${String(index).padStart(3, "0")}`;
    nodes.push(page(uid, `Node ${index}`));
    items.push(item(uid, index, index * 80));
  }
  const plan = drawPlan({
    view: "compass",
    center,
    nodes,
    geometry: { center: { x: 0, y: 0, w: 240, h: 56 }, items },
  });
  assert.equal(plan.boxes.length, 120);
  assert.equal(plan.omitted, 2);
  assert.equal(plan.boxes[0].uid, "c");
  assert.equal(plan.boxes[1].uid, "n000");
  assert.equal(plan.boxes[119].uid, "n118");
  assert.equal(plan.boxes.some((box) => box.uid === "n119" || box.uid === "n120"), false);
  assert.equal(plan.arrows.some((arrow) => arrow.to.endsWith("n119") || arrow.from.endsWith("n119")), false);
});

test("drawPlan skips hidden nodes, missing nodes, and a missing center", () => {
  const center = page("c", "Center");
  const nodes = [page("shown", "Shown"), page("faded", "Faded")];
  const geometry = {
    center: { x: 0, y: 0, w: 240, h: 56 },
    items: [
      item("shown", 400, 0),
      item("faded", 400, 200),
      item("ghost", 400, 400),
      { kind: "more", uid: "shown", key: "more", x: 0, y: 900, w: 80, h: 20 },
    ],
  };
  const plan = drawPlan({
    view: "compass",
    center,
    geometry,
    nodes,
    hidden: new Set(["faded"]),
  });
  assert.deepEqual(plan.boxes.map((box) => box.uid), ["c", "shown"]);
  assert.deepEqual(drawPlan({}), { boxes: [], arrows: [], frames: [], omitted: 0 });
});
