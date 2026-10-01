import assert from "node:assert/strict";
import test from "node:test";

import { CROSS_QUERY, ZONE_ATTR, crossEdges, hiddenUids, isEmptyPage, planAttributeWrite, planZoneCreate, urlGroups } from "../src/model/batch7.js";

test("all chips on returns []", () => {
  const nodes = [
    { uid: "p", kind: "page", title: "Page" },
    { uid: "b", kind: "block", title: "Note", string: "hello" },
    { uid: "d", kind: "block", title: "Sketch", string: "{{[[excalidraw]]}}" },
    { uid: "r", kind: "block", title: "Frame", string: "{{[[plexus-region]]: x}}" },
  ];
  assert.deepEqual(hiddenUids(nodes), []);
  assert.deepEqual(hiddenUids(nodes, { pages: true, blocks: true, drawings: true, regions: true, keyword: "   " }), []);
});

test("turning pages off hides a page and keeps a drawing", () => {
  assert.deepEqual(hiddenUids([
    { uid: "p", kind: "page", title: "Page", string: "hello" },
    { uid: "d", kind: "block", title: "Sketch", string: "  {{[[excalidraw]]}} notes" },
    { uid: "b", kind: "block", title: "Note", string: "plain" },
  ], { pages: false }), ["p"]);
});

test("keyword hides a miss", () => {
  assert.deepEqual(hiddenUids([
    { uid: "hit", kind: "page", title: "Apollo launch" },
    { uid: "by-alias", kind: "block", title: "Note", alias: "Apollo", string: "plain" },
    { uid: "miss", kind: "page", title: "Zeus", alias: "Hera", string: "apollo in the body" },
  ], { keyword: " apollo " }), ["miss"]);
});

test("a region is not a drawing", () => {
  const nodes = [
    { uid: "d1", kind: "block", string: "{{[[excalidraw]]}}", title: "A" },
    { uid: "d2", kind: "block", string: "  {{excalidraw}} tail", title: "B" },
    { uid: "r", kind: "block", string: "{{[[plexus-region]] excalidraw}} Frame", title: "C" },
    { uid: "b", kind: "block", string: "see {{[[excalidraw]]}}", title: "D" },
  ];
  assert.deepEqual(hiddenUids(nodes, { drawings: false }), ["d1", "d2"]);
  assert.deepEqual(hiddenUids(nodes, { regions: false }), ["r"]);
  assert.deepEqual(hiddenUids(nodes, { blocks: false }), ["b"]);
});

test("url caps and www", () => {
  assert.deepEqual(urlGroups([
    "https://WWW.Example.com/a https://example.com/b https://example.com/c https://example.com/d https://example.com/e",
    "http://www.Other.org/1 http://other.org/2 http://Other.org/3 http://other.org/4 http://other.org/5",
    "https://third.test/x",
    "https://fourth.test/y",
    "https://fifth.test/z",
  ]), [
    { host: "example.com", urls: ["https://WWW.Example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d"] },
    { host: "other.org", urls: ["http://www.Other.org/1", "http://other.org/2", "http://Other.org/3", "http://other.org/4"] },
    { host: "third.test", urls: ["https://third.test/x"] },
    { host: "fourth.test", urls: ["https://fourth.test/y"] },
  ]);
});

test("a markdown url stops at )", () => {
  assert.deepEqual(urlGroups(["see [docs](https://www.Docs.Example/guide) and (http://example.com/a)b"]), [
    { host: "docs.example", urls: ["https://www.Docs.Example/guide"] },
    { host: "example.com", urls: ["http://example.com/a"] },
  ]);
});

test("crossEdges drops outsiders, a self pair, and stops at 40", () => {
  assert.deepEqual(crossEdges([
    ["a", "b"],
    ["a", "z"],
    ["a", "a"],
    ["b", "a"],
    ["a", "b"],
    ["only"],
    ["a", "b", "c"],
    null,
    ["c", "b"],
  ], ["a", "b", "c"]), [
    { source: "a", target: "b" },
    { source: "b", target: "a" },
    { source: "c", target: "b" },
  ]);

  const rows = [["a", "a"], ["out", "a"]];
  const ids = ["a"];
  for (let i = 0; i < 41; i += 1) {
    rows.push(["a", `n${i}`]);
    ids.push(`n${i}`);
  }
  const edges = crossEdges(rows, ids);
  assert.equal(edges.length, 40);
  assert.deepEqual(edges[0], { source: "a", target: "n0" });
  assert.deepEqual(edges[39], { source: "a", target: "n39" });
});

test("CROSS_QUERY looks the uid up on :block/uid", () => {
  assert.match(CROSS_QUERY, /:block\/uid/);
  const where = CROSS_QUERY.slice(CROSS_QUERY.indexOf(":where") + ":where".length).trim();
  assert.equal(where.startsWith("[?src :block/uid ?uid]"), true);
  assert.equal(CROSS_QUERY.includes("[?uid :block/"), false);
});

test("isEmptyPage is only a page with no children", () => {
  assert.equal(isEmptyPage("page", 0), true);
  assert.equal(isEmptyPage("block", 0), false);
  assert.equal(isEmptyPage("page", 1), false);
  assert.equal(isEmptyPage("page", "0"), false);
});

test("ZONE_ATTR names the four sides", () => {
  assert.deepEqual(ZONE_ATTR, { north: "Parent", south: "Child", west: "Friend", east: "Challenger" });
  assert.equal(Object.isFrozen(ZONE_ATTR), true);
});

test("planZoneCreate reuses and does not ask to create when a drawing uid is present", () => {
  assert.deepEqual(planZoneCreate({ existingDrawingUid: "draw-9" }), { create: false, drawingUid: "draw-9" });
  assert.deepEqual(planZoneCreate({ existingDrawingUid: "" }), { create: true, drawingUid: null });
  assert.deepEqual(planZoneCreate({ existingDrawingUid: null }), { create: true, drawingUid: null });
  assert.deepEqual(planZoneCreate({}), { create: true, drawingUid: null });
});

test("planAttributeWrite creates, appends, skips a present ref, and refuses a bracket in the title", () => {
  assert.deepEqual(planAttributeWrite({ attribute: "Parent", title: "Up", existing: null }).ops, [
    { op: "create", string: "Parent:: [[Up]]" },
  ]);
  assert.deepEqual(planAttributeWrite({
    attribute: "Child",
    title: "Down",
    existing: { uid: "b1", string: "  Child:: [[Other]]  " },
  }).ops, [
    { op: "update", uid: "b1", string: "Child:: [[Other]] [[Down]]" },
  ]);
  const present = planAttributeWrite({
    attribute: "Friend",
    title: "Sam",
    existing: { uid: "b2", string: "Friend:: [[Sam]] extra" },
  });
  assert.deepEqual(present.ops, []);
  assert.equal(present.reason, "have");
  const bracket = planAttributeWrite({ attribute: "Parent", title: "Bad]", existing: { uid: "b3", string: "Parent::" } });
  assert.deepEqual(bracket.ops, []);
  assert.equal(bracket.reason, "title");
  assert.equal(planAttributeWrite({ attribute: "Parent", title: "[Bad", existing: null }).reason, "title");
  assert.deepEqual(planAttributeWrite({ title: "Up", existing: null }), { ops: [], reason: "attribute" });
});
