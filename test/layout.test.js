import assert from "node:assert/strict";
import test from "node:test";

import { applyLens, layout } from "../src/model/layout.js";

function at(placed, uid) {
  return placed.find((item) => item.uid === uid);
}

test("every parent y is less than 0 and every child y is greater than 0", () => {
  const placed = layout([
    { uid: "p", title: "P", zone: "parents", kind: "typed" },
    { uid: "c", title: "C", zone: "children", kind: "typed" },
    { uid: "f", title: "F", zone: "friends", kind: "typed" },
    { uid: "h", title: "H", zone: "challengers", kind: "typed" },
  ], { showOutline: false });
  assert.ok(at(placed, "p").y < 0);
  assert.ok(at(placed, "c").y > 0);
  assert.ok(at(placed, "f").x < 0);
  assert.ok(at(placed, "h").x > 0);
});

test("every friend x is less than 0 and every challenger x is greater than 0", () => {
  const placed = layout([
    { uid: "f1", title: "F1", zone: "friends", kind: "typed" },
    { uid: "f2", title: "F2", zone: "friends", kind: "typed" },
    { uid: "h1", title: "H1", zone: "challengers", kind: "typed" },
    { uid: "h2", title: "H2", zone: "challengers", kind: "typed" },
  ], { showOutline: false });
  for (const item of placed.filter((node) => node.zone === "friends")) assert.ok(item.x < 0);
  for (const item of placed.filter((node) => node.zone === "challengers")) assert.ok(item.x > 0);
});

test("two calls return deep-equal positions", () => {
  const nodes = [
    { uid: "p2", title: "Zed", zone: "parents", kind: "typed" },
    { uid: "p1", title: "Ann", zone: "parents", kind: "typed" },
    { uid: "c", title: "C", zone: "children", kind: "typed" },
    { uid: "f", title: "F", zone: "friends", kind: "inverse" },
    { uid: "h", title: "H", zone: "challengers", kind: "typed" },
    { uid: "r", title: "R", zone: "related", kind: "typed" },
    { uid: "s", title: "S", zone: "siblings", kind: "inverse" },
  ];
  assert.deepEqual(layout(nodes, { showOutline: false }), layout(nodes, { showOutline: false }));
  assert.deepEqual(layout(nodes, { showOutline: false }), layout([...nodes].reverse(), { showOutline: false }));
});

test("zone anchors use top-left coordinates around the origin", () => {
  const placed = layout([
    { uid: "p2", title: "Zed", zone: "parents", kind: "typed" },
    { uid: "p1", title: "Ann", zone: "parents", kind: "typed" },
    { uid: "c", title: "C", zone: "children", kind: "typed" },
    { uid: "f", title: "F", zone: "friends", kind: "typed" },
    { uid: "h", title: "H", zone: "challengers", kind: "typed" },
    { uid: "r", title: "R", zone: "related", kind: "typed" },
    { uid: "s", title: "S", zone: "siblings", kind: "inverse" },
  ], { showOutline: false });
  const ann = at(placed, "p1");
  const zed = at(placed, "p2");
  assert.ok(ann.x < zed.x);
  assert.equal(ann.y + ann.h, -70);
  assert.equal(zed.y + zed.h, -70);
  assert.equal(ann.w, 160);
  assert.equal(ann.h, 36);
  const child = at(placed, "c");
  assert.equal(child.y, 80);
  assert.equal(child.x, -80);
  const friend = at(placed, "f");
  assert.equal(friend.x + friend.w, -200);
  assert.equal(friend.y, -18);
  const challenger = at(placed, "h");
  assert.equal(challenger.x, 200);
  assert.equal(at(placed, "r").y, 144);
  const sibling = at(placed, "s");
  assert.equal(sibling.y, 208);
  assert.equal(sibling.w, 120);
  assert.equal(sibling.h, 28);
  assert.equal(sibling.x, -60);
});

test("outline column starts at y 80 and pushes the children row", () => {
  const nodes = [
    { uid: "o", title: "O", zone: "outline", kind: "outline" },
    { uid: "c", title: "C", zone: "children", kind: "typed" },
    { uid: "r", title: "R", zone: "related", kind: "typed" },
  ];
  const on = layout(nodes, { showOutline: true });
  const off = layout(nodes, { showOutline: false });
  assert.equal(at(on, "o").y, 80);
  assert.equal(at(on, "o").x, -80);
  assert.equal(at(on, "c").y, 80 + 46);
  assert.equal(at(on, "r").y, 80 + 46 + 36 + 28);
  assert.equal(at(off, "o"), undefined);
  assert.equal(at(off, "c").y, 80);
});

test("siblings tuck under children when related is empty", () => {
  const placed = layout([
    { uid: "c", title: "C", zone: "children", kind: "typed" },
    { uid: "s", title: "S", zone: "siblings", kind: "inverse" },
  ], { showOutline: false });
  assert.equal(at(placed, "s").y, 80 + 36 + 28);
});

function classified() {
  return {
    showOutline: false,
    nodes: [
      { uid: "a", title: "Alpha", zone: "children", kind: "typed" },
      { uid: "b", title: "Beta", zone: "children", kind: "inverse" },
    ],
    edges: [
      {
        from: "center", to: "a", zone: "children", kind: "typed",
        attribute: "Child", sourceUid: "s1", labels: [], writable: true,
      },
      {
        from: "b", to: "center", zone: "children", kind: "inverse",
        attribute: "Parent", sourceUid: "s2", labels: [], writable: false,
      },
    ],
    badges: [{ attribute: "Status", text: "Active" }],
    overflow: {},
  };
}

test("keep mode hides rejects and preserves the previous layout", () => {
  const source = classified();
  const lens = {
    keyword: "ALP",
    attributes: { include: [], exclude: [] },
    kinds: { include: [] },
  };
  const kept = applyLens(source, lens, "keep");
  assert.equal(kept.nodes.find((node) => node.uid === "b").hidden, true);
  assert.equal(Object.hasOwn(kept.nodes.find((node) => node.uid === "a"), "hidden"), false);
  assert.deepEqual(kept.layout, layout(source.nodes, { showOutline: false }));
  assert.notDeepEqual(kept.layout, layout([source.nodes[0]], { showOutline: false }));
  assert.deepEqual(kept.badges, source.badges);
});

test("reflow mode lays out only the survivors", () => {
  const source = classified();
  const lens = {
    keyword: "alp",
    attributes: { include: [], exclude: [] },
    kinds: { include: [] },
  };
  const flowed = applyLens(source, lens, "reflow");
  assert.deepEqual(flowed.nodes.map((node) => node.uid), ["a"]);
  assert.deepEqual(flowed.layout, layout([source.nodes[0]], { showOutline: false }));
  assert.deepEqual(flowed.edges.map((edge) => edge.to), ["a"]);
});

test("empty attribute and kind include lists do not restrict", () => {
  const source = classified();
  const flowed = applyLens(source, {
    keyword: "",
    attributes: { include: [], exclude: [] },
    kinds: { include: [] },
  }, "reflow");
  assert.equal(flowed.nodes.length, 2);
  assert.equal(flowed.badges.length, 1);
});

test("attribute exclude and kind include filter nodes and badges", () => {
  const source = classified();
  const excluded = applyLens(source, {
    keyword: "",
    attributes: { include: [], exclude: ["Child"] },
    kinds: { include: [] },
  }, "reflow");
  assert.deepEqual(excluded.nodes.map((node) => node.uid), ["b"]);
  const kinds = applyLens(source, {
    keyword: "",
    attributes: { include: ["Parent"], exclude: [] },
    kinds: { include: ["inverse"] },
  }, "reflow");
  assert.deepEqual(kinds.nodes.map((node) => node.uid), ["b"]);
  const badges = applyLens(source, {
    keyword: "alpha",
    attributes: { include: [], exclude: ["Status"] },
    kinds: { include: [] },
  }, "keep");
  assert.deepEqual(badges.badges, []);
  assert.equal(badges.nodes.find((node) => node.uid === "a").hidden, undefined);
});
