import assert from "node:assert/strict";
import test from "node:test";

import { buildNeighborhood, isDrawingLike, roleOf, modelSettings, typedParentUids } from "../src/model/neighborhood.js";

const page = (uid, title) => ({ uid, title });

function snap(overrides = {}) {
  return {
    center: { uid: "c", kind: "page", title: "Center" },
    outline: [],
    out: [],
    in: [],
    mentions: [],
    namespace: null,
    days: null,
    peers: [],
    ...overrides,
  };
}

function block(uid, string, refs = [], children = []) {
  return { uid, string, order: 0, refs, children };
}

function source(uid, string, children = [], parentUid = "c", order = 0) {
  return { uid, string, order, parentUid, children };
}

function zones(hood) {
  return Object.fromEntries(hood.nodes.map((node) => [node.uid, node.zone]));
}

test("a daily note shows links from nested bullets and the days around it", () => {
  const hood = buildNeighborhood(snap({
    center: { uid: "09-28-2026", kind: "page", title: "September 28th, 2026" },
    outline: [
      block("b1", "Standup about [[Apollo]]", [page("apollo", "Apollo")], [
        block("b2", "Jane will ship it", [], [
          block("b3", "Ask [[Jane]] on Monday", [page("jane", "Jane")]),
        ]),
      ]),
    ],
    days: { previous: page("09-27-2026", "September 27th, 2026"), next: page("09-29-2026", "September 29th, 2026") },
  }));
  assert.deepEqual(zones(hood), {
    apollo: "south",
    jane: "south",
    "09-27-2026": "west",
    "09-29-2026": "east",
  });
  const jane = hood.nodes.find((node) => node.uid === "jane");
  assert.equal(jane.style, "link");
  assert.equal(jane.writable, null);
  assert.equal(jane.evidence[0].sourceUid, "b3");
});

test("linked references sit north; a link both ways sits west", () => {
  const hood = buildNeighborhood(snap({
    outline: [block("b1", "See [[Mutual]]", [page("m", "Mutual")])],
    mentions: [
      { uid: "x1", string: "Read [[Center]]", page: page("reader", "Reader"), refs: [page("c", "Center")] },
      { uid: "x2", string: "[[Center]] again", page: page("m", "Mutual"), refs: [page("c", "Center")] },
    ],
  }));
  assert.equal(zones(hood).reader, "north");
  assert.equal(zones(hood).m, "west");
});

test("an unlisted attribute reads like a link: value south, entity north", () => {
  const out = buildNeighborhood(snap({
    outline: [block("s1", "Owner:: [[Jane]]", [page("owner", "Owner"), page("jane", "Jane")])],
    out: [{ uid: "h1", attribute: "Owner", source: source("s1", "Owner:: [[Jane]]"), values: [page("jane", "Jane")], labels: [] }],
  }));
  assert.deepEqual(zones(out), { jane: "south" });
  const jane = out.nodes[0];
  assert.equal(jane.style, "typed");
  assert.equal(jane.label, "Owner");
  assert.equal(jane.writable.direction, "out");
  assert.equal(jane.writable.sourceString, "Owner:: [[Jane]]");
  assert.ok(jane.evidence.every((item) => item.kind === "typed"));

  const inbound = buildNeighborhood(snap({
    in: [{ uid: "h2", attribute: "Owner", entity: page("apollo", "Apollo"), source: source("s2", "Owner:: [[Center]]", [], "apollo"), valueSourceUids: ["s2"], labels: [] }],
    mentions: [{ uid: "s2", string: "Owner:: [[Center]]", page: page("apollo", "Apollo"), refs: [page("c", "Center")] }],
  }));
  assert.deepEqual(zones(inbound), { apollo: "north" });
  assert.equal(inbound.nodes[0].style, "typed");
  assert.equal(inbound.nodes[0].writable.direction, "in");
});

test("settings move attributes between sides, with the right inverse", () => {
  const settings = { friend: "Owner", challenger: "Opposes", previous: "Previous", next: "Next" };
  const harc = (attribute, value) => ({ uid: `h-${attribute}`, attribute, source: source(`s-${attribute}`, `${attribute}:: [[${value.title}]]`), values: [value], labels: [] });
  const inHarc = (attribute, entity) => ({ uid: `i-${attribute}`, attribute, entity, source: source(`t-${attribute}`, `${attribute}:: [[Center]]`, [], entity.uid), valueSourceUids: [], labels: [] });
  const out = buildNeighborhood(snap({
    out: [harc("Owner", page("a", "A")), harc("Opposes", page("b", "B")), harc("Previous", page("p", "P")), harc("Next", page("n", "N"))],
  }), settings);
  assert.deepEqual(zones(out), { a: "west", b: "east", p: "west", n: "east" });
  const inbound = buildNeighborhood(snap({
    in: [inHarc("Owner", page("a", "A")), inHarc("Opposes", page("b", "B")), inHarc("Previous", page("p", "P")), inHarc("Next", page("n", "N"))],
  }), settings);
  assert.deepEqual(zones(inbound), { a: "west", b: "east", p: "east", n: "west" });
});

test("Parent:: puts the value north and the entity that names us south", () => {
  const hood = buildNeighborhood(snap({
    out: [{ uid: "h1", attribute: "Parent", source: source("s1", "Parent:: [[Up]]"), values: [page("up", "Up")], labels: [] }],
    in: [{ uid: "h2", attribute: "Part of", entity: page("kid", "Kid"), source: source("s2", "Part of:: [[Center]]", [], "kid"), valueSourceUids: [], labels: [] }],
  }));
  assert.deepEqual(zones(hood), { up: "north", kid: "south" });
});

test("BT_attr* edges show up but are never writable", () => {
  const todo = { uid: "todo", string: "{{[[TODO]]}} ship it" };
  const project = buildNeighborhood(snap({
    in: [{ uid: "h1", attribute: "BT_attrProject", entity: todo, source: source("bt1", "BT_attrProject:: [[Center]]", [], "todo"), valueSourceUids: [], labels: [] }],
  }));
  assert.equal(project.nodes[0].zone, "south");
  assert.equal(project.nodes[0].kind, "block");
  assert.equal(project.nodes[0].title, "TODO ship it");
  assert.equal(project.nodes[0].writable, null);

  const daily = buildNeighborhood(snap({
    center: { uid: "09-28-2026", kind: "page", title: "September 28th, 2026" },
    in: [{ uid: "h2", attribute: "BT_attrDue", entity: todo, source: source("bt2", "BT_attrDue:: [[September 28th, 2026]]", [], "todo"), valueSourceUids: [], labels: [] }],
  }));
  assert.equal(daily.nodes[0].zone, "north");
  assert.equal(daily.nodes[0].writable, null);
});

test("hidden attributes are left out; text values become badges", () => {
  const hood = buildNeighborhood(snap({
    out: [
      { uid: "h1", attribute: "Hidden", source: source("s1", "Hidden:: [[Secret]]"), values: [page("secret", "Secret")], labels: [] },
      { uid: "h2", attribute: "Status", source: source("s2", "Status:: Active"), values: [{ uid: "v-h2", text: "Active" }], labels: [] },
    ],
  }));
  assert.deepEqual(hood.nodes, []);
  assert.deepEqual(hood.center.badges, [{ attribute: "Status", text: "Active" }]);
  const quiet = buildNeighborhood(snap({
    out: [{ uid: "h2", attribute: "Status", source: source("s2", "Status:: Active"), values: [{ uid: "v-h2", text: "Active" }], labels: [] }],
  }), { badges: false });
  assert.deepEqual(quiet.center.badges, []);
});

test("attributes nested under a relation label its edge", () => {
  const hood = buildNeighborhood(snap({
    out: [{ uid: "h1", attribute: "Owner", source: source("s1", "Owner:: [[Jane]]"), values: [page("jane", "Jane")], labels: [{ attribute: "Role", text: "Lead" }] }],
  }));
  assert.equal(hood.nodes[0].label, "Owner · Role: Lead");
});

test("typed beats plain links, listed beats unlisted, and a two-way claim goes west", () => {
  const hood = buildNeighborhood(snap({
    outline: [block("b1", "Talk to [[Jane]] and [[Apollo]]", [page("jane", "Jane"), page("apollo", "Apollo")])],
    out: [
      { uid: "h1", attribute: "Parent", source: source("s1", "Parent:: [[Jane]]"), values: [page("jane", "Jane")], labels: [] },
      { uid: "h2", attribute: "Owner", source: source("s2", "Owner:: [[Jane]]"), values: [page("jane", "Jane")], labels: [] },
      { uid: "h3", attribute: "Works on", source: source("s3", "Works on:: [[Apollo]]"), values: [page("apollo", "Apollo")], labels: [] },
    ],
    in: [{ uid: "h4", attribute: "Owner", entity: page("apollo", "Apollo"), source: source("s4", "Owner:: [[Center]]", [], "apollo"), valueSourceUids: [], labels: [] }],
  }));
  assert.equal(zones(hood).jane, "north");
  assert.equal(zones(hood).apollo, "west");
  assert.equal(hood.nodes.find((node) => node.uid === "apollo").writable, null);
});

test("attribute names, macro names, and class tags are not links", () => {
  const hood = buildNeighborhood(snap({
    outline: [
      block("b1", "{{[[TODO]]}} call [[Jane]] #.urgent", [page("todo", "TODO"), page("jane", "Jane"), page("urgent", ".urgent")]),
      block("b2", "Status:: Active", [page("status", "Status")]),
      block("b3", "Notes:: met [[Bob]] today", [page("notes", "Notes"), page("bob", "Bob")]),
    ],
  }));
  assert.deepEqual(zones(hood), { jane: "south", bob: "south" });
});

test("values listed as children of a bare attribute are typed, not links", () => {
  const children = [{ uid: "v1", string: "[[urgent]]", order: 0 }, { uid: "v2", string: "[[backend]]", order: 1 }];
  const hood = buildNeighborhood(snap({
    outline: [block("s1", "Tags::", [page("tags", "Tags")], [
      block("v1", "[[urgent]]", [page("u", "urgent")]),
      block("v2", "[[backend]]", [page("b", "backend")]),
    ])],
    out: [{ uid: "h1", attribute: "Tags", source: source("s1", "Tags::", children), values: [page("u", "urgent"), page("b", "backend")], labels: [] }],
  }));
  assert.deepEqual(zones(hood), { b: "south", u: "south" });
  assert.ok(hood.nodes.every((node) => node.evidence.every((item) => item.kind === "typed")));
});

test("a block that makes an inbound harc is not also a linked reference", () => {
  const hood = buildNeighborhood(snap({
    in: [{ uid: "h1", attribute: "Owner", entity: page("apollo", "Apollo"), source: source("s1", "Owner::", [], "apollo"), valueSourceUids: ["v1"], labels: [] }],
    mentions: [{ uid: "v1", string: "[[Center]]", page: page("apollo", "Apollo"), refs: [page("c", "Center")] }],
  }));
  assert.equal(hood.nodes.length, 1);
  assert.ok(hood.nodes[0].evidence.every((item) => item.kind === "typed"));
});

test("siblings come from shared parents", () => {
  const hood = buildNeighborhood(snap({
    out: [{ uid: "h1", attribute: "Parent", source: source("s1", "Parent:: [[Up]]"), values: [page("up", "Up")], labels: [] }],
    mentions: [{ uid: "m1", string: "Met [[Center]] and [[Jane]]", page: page("d", "Daily"), refs: [page("c", "Center"), page("jane", "Jane")] }],
    peers: [{
      parentUid: "up",
      incoming: [{ attribute: "Parent", entity: page("s", "Sib") }, { attribute: "Owner", entity: page("x", "Not a sibling") }],
      outgoing: [{ attribute: "Child", value: page("t", "Other") }, { attribute: "Friend", value: page("f", "Friend of up") }],
    }],
  }));
  const siblings = hood.nodes.filter((node) => node.zone === "siblings");
  assert.deepEqual(siblings.map((node) => [node.uid, node.via]).sort(), [["jane", "d"], ["s", "up"], ["t", "up"]]);
  const off = buildNeighborhood(snap({
    mentions: [{ uid: "m1", string: "Met [[Center]] and [[Jane]]", page: page("d", "Daily"), refs: [page("c", "Center"), page("jane", "Jane")] }],
  }), { siblings: false });
  assert.deepEqual(zones(off), { d: "north" });
});

test("each side keeps its limit and reports what it holds back", () => {
  const mentions = Array.from({ length: 15 }, (_, index) => ({
    uid: `m${index}`,
    string: "[[Center]]",
    page: page(`p${String(index).padStart(2, "0")}`, `Page ${String(index).padStart(2, "0")}`),
    refs: [page("c", "Center")],
  }));
  const hood = buildNeighborhood(snap({ mentions }), { maxPerZone: 12 });
  assert.equal(hood.nodes.length, 12);
  assert.deepEqual(hood.overflow, { north: { shown: 12, total: 15 } });
  assert.equal(hood.nodes[0].title, "Page 00");
  const all = buildNeighborhood(snap({ mentions }), { maxPerZone: 12 }, { expanded: new Set(["north"]) });
  assert.equal(all.nodes.length, 15);
  assert.deepEqual(all.overflow, { north: { shown: 15, total: 15 } });
});

test("a block center sits under its page and parent block, with sibling blocks", () => {
  const hood = buildNeighborhood(snap({
    center: {
      uid: "blk",
      kind: "block",
      string: "Do [[X]] **today**",
      page: page("pg", "Project"),
      parent: { uid: "par", string: "Tasks" },
      siblings: [{ uid: "sib", string: "Another task", order: 1 }],
    },
  }));
  assert.equal(hood.center.title, "Do X today");
  assert.deepEqual(zones(hood), { par: "north", pg: "north", sib: "siblings" });
  assert.equal(hood.nodes.find((node) => node.uid === "sib").via, "par");
});

test("namespaces give a parent, children, and siblings", () => {
  const hood = buildNeighborhood(snap({
    center: { uid: "c", kind: "page", title: "Projects/Apollo" },
    namespace: {
      parent: page("projects", "Projects"),
      children: [page("apollo-docs", "Projects/Apollo/Docs")],
      siblings: [page("gemini", "Projects/Gemini")],
    },
  }));
  assert.deepEqual(zones(hood), { projects: "north", "apollo-docs": "south", gemini: "siblings" });
});

test("roleOf is case-insensitive and hidden wins", () => {
  const settings = modelSettings({ hidden: "Owner" });
  assert.deepEqual(roleOf("part of", settings), { role: "parent", explicit: true });
  assert.equal(roleOf("owner", settings), null);
  assert.deepEqual(roleOf("Mood", settings), { role: "child", explicit: false });
});

test("typedParentUids lists pages reached through parent edges", () => {
  const uids = typedParentUids(snap({
    out: [{ uid: "h1", attribute: "Parent", source: null, values: [page("up", "Up"), { uid: "v", text: "x" }], labels: [] }],
    in: [{ uid: "h2", attribute: "Child", entity: page("mom", "Mom"), source: null, valueSourceUids: [], labels: [] }],
  }), {});
  assert.deepEqual(uids, ["up", "mom"]);
});

test("the outline rows carry depth and child counts", () => {
  const hood = buildNeighborhood(snap({
    outline: [block("a", "Top", [], [block("b", "Nested", [])]), block("c2", "Second", [])],
  }));
  assert.deepEqual(hood.outline.map((row) => [row.uid, row.depth, row.childCount, row.parentUid]), [
    ["a", 0, 1, null],
    ["b", 1, 0, "a"],
    ["c2", 0, 0, null],
  ]);
  assert.equal(hood.outlineIndex.get("b").parentUid, "a");
});

test("isDrawingLike matches Excalidraw and Plexus region macros only", () => {
  assert.equal(isDrawingLike({ string: "{{[[excalidraw]]}}" }), true);
  assert.equal(isDrawingLike({ string: "{{excalidraw}}" }), true);
  assert.equal(isDrawingLike({ string: "  {{[[plexus-region]]: abc}}" }), true);
  assert.equal(isDrawingLike({ string: "see {{[[excalidraw]]}}" }), false);
  assert.equal(isDrawingLike({ string: "plain" }), false);
  assert.equal(isDrawingLike({ title: "Page" }), false);
  assert.equal(isDrawingLike(null), false);
});

test("sibling nodes keep their block string so drawings and regions are drawing-like", () => {
  const hood = buildNeighborhood(snap({
    center: {
      uid: "r1",
      kind: "block",
      string: "{{[[plexus-region]]: abc}}",
      page: page("pg", "Drawing"),
      parent: { uid: "par", string: "{{[[plexus-regions]]}}" },
      siblings: [
        { uid: "d1", string: "{{[[excalidraw]]}}", order: 1 },
        { uid: "r2", string: "{{[[plexus-region]]: def}} Filler", order: 2 },
      ],
    },
  }));
  const d1 = hood.nodes.find((n) => n.uid === "d1");
  const r2 = hood.nodes.find((n) => n.uid === "r2");
  assert.equal(d1.zone, "siblings");
  assert.equal(isDrawingLike(d1), true);
  assert.equal(isDrawingLike(r2), true);
});
