import assert from "node:assert/strict";
import test from "node:test";

import {
  adjacentDayUids,
  CENTER_PULL,
  createHost,
  normalizeCenter,
  normalizeIn,
  normalizeMentions,
  normalizeOut,
  normalizeOutline,
  OUTLINE_PULL,
} from "../src/host.js";
import { createLifecycle } from "../src/lifecycle.js";
import { buildNeighborhood } from "../src/model/neighborhood.js";

const rawPage = (uid, title) => ({ ":block/uid": uid, ":node/title": title });

test("normalizeOut keeps attribute, source block, values, and nested labels", () => {
  const [harc] = normalizeOut([{
    ":block/uid": "h1",
    ":harc/a": [{ ":node/title": "Owner" }],
    ":harc/v": [rawPage("jane", "Jane")],
    ":harc/a-source": [{
      ":block/uid": "s1",
      ":block/string": "Owner:: [[Jane]]",
      ":block/order": 2,
      ":block/_children": [{ ":block/uid": "page" }],
      ":block/children": [{ ":block/uid": "l1", ":block/string": "Role:: Lead", ":block/order": 0 }],
    }],
    ":harc/_e": [{ ":harc/a": [{ ":node/title": "Role" }], ":harc/v": [{ ":block/uid": "v-x", ":harc/v-string": "Lead" }] }],
  }]);
  assert.deepEqual(harc, {
    uid: "h1",
    attribute: "Owner",
    source: {
      uid: "s1",
      string: "Owner:: [[Jane]]",
      order: 2,
      parentUid: "page",
      children: [{ uid: "l1", string: "Role:: Lead", order: 0 }],
    },
    values: [{ uid: "jane", title: "Jane" }],
    labels: [{ attribute: "Role", text: "Lead" }],
  });
  const [text] = normalizeOut([{ ":harc/a": { ":node/title": "Status" }, ":harc/v": [{ ":block/uid": "v-h", ":harc/v-string": "Active" }] }]);
  assert.deepEqual(text.values, [{ uid: "v-h", text: "Active" }]);
});

test("normalizeIn drops harc-on-harc entities that are neither page nor block", () => {
  const harcs = normalizeIn([
    { ":harc/a": [{ ":node/title": "Owner" }], ":harc/e": [rawPage("apollo", "Apollo")], ":harc/v-source": [{ ":block/uid": "v1" }] },
    { ":harc/a": [{ ":node/title": "Role" }], ":harc/e": [{ ":block/uid": "h9" }] },
  ]);
  assert.equal(harcs.length, 2);
  assert.deepEqual(harcs[0].entity, { uid: "apollo", title: "Apollo" });
  assert.deepEqual(harcs[0].valueSourceUids, ["v1"]);
  const hood = buildNeighborhood({ center: { uid: "c", kind: "page", title: "C" }, in: harcs });
  assert.deepEqual(hood.nodes.map((node) => node.uid), ["apollo"]);
});

test("normalizeMentions needs a page and caps the list", () => {
  const list = normalizeMentions([
    { ":block/uid": "b", ":block/string": "x [[C]]", ":block/page": rawPage("p", "P"), ":block/refs": [rawPage("c", "C")] },
    { ":block/uid": "a", ":block/string": "no page" },
  ]);
  assert.deepEqual(list, [{ uid: "b", string: "x [[C]]", page: { uid: "p", title: "P" }, refs: [{ uid: "c", title: "C" }] }]);
  assert.equal(normalizeMentions(Array.from({ length: 5 }, (_, i) => ({
    ":block/uid": `m${i}`, ":block/string": "", ":block/page": rawPage("p", "P"),
  })), 3).length, 3);
});

test("normalizeOutline sorts children by order at every depth", () => {
  const outline = normalizeOutline({
    ":block/children": [
      { ":block/uid": "b", ":block/string": "second", ":block/order": 1 },
      {
        ":block/uid": "a",
        ":block/string": "first",
        ":block/order": 0,
        ":block/children": [
          { ":block/uid": "a2", ":block/string": "a two", ":block/order": 1 },
          { ":block/uid": "a1", ":block/string": "a one", ":block/order": 0, ":block/refs": [rawPage("j", "J")] },
        ],
      },
    ],
  });
  assert.deepEqual(outline.map((item) => item.uid), ["a", "b"]);
  assert.deepEqual(outline[0].children.map((item) => item.uid), ["a1", "a2"]);
  assert.deepEqual(outline[0].children[0].refs, [{ uid: "j", title: "J" }]);
});

test("normalizeCenter reads a block's page, parent, and siblings", () => {
  const center = normalizeCenter({
    ":block/string": "me",
    ":block/page": rawPage("pg", "Page"),
    ":block/_children": [{
      ":block/uid": "par",
      ":block/string": "parent",
      ":block/children": [
        { ":block/uid": "me", ":block/string": "me", ":block/order": 0 },
        { ":block/uid": "sib", ":block/string": "sib", ":block/order": 1 },
      ],
    }],
  }, "me");
  assert.equal(center.kind, "block");
  assert.deepEqual(center.page, { uid: "pg", title: "Page" });
  assert.deepEqual(center.parent, { uid: "par", string: "parent" });
  assert.deepEqual(center.siblings, [{ uid: "sib", string: "sib", order: 1 }]);
});

test("adjacentDayUids crosses month and leap-day boundaries", () => {
  assert.deepEqual(adjacentDayUids("09-28-2026"), { previous: "09-27-2026", next: "09-29-2026" });
  assert.deepEqual(adjacentDayUids("03-01-2024"), { previous: "02-29-2024", next: "03-02-2024" });
  assert.equal(adjacentDayUids("abc"), null);
});

function fakeRoam({ pulls, windows = [] }) {
  const calls = [];
  globalThis.roamAlphaAPI = {
    graph: { name: "test" },
    util: { generateUID: () => "gen-uid", dateToPageUid: () => "09-28-2026" },
    ui: {
      mainWindow: { getOpenPageOrBlockUid: async () => null },
      rightSidebar: {
        getWindows: () => windows,
        addWindow: async (args) => { calls.push(["add", args.window["block-uid"]]); },
        removeWindow: async (args) => { calls.push(["remove", args.window["block-uid"]]); },
      },
    },
    data: {
      pull: (pattern, entity) => pulls(pattern, entity),
      q: () => [],
      addPullWatch: (pattern) => calls.push(["watch", pattern]),
      removePullWatch: (pattern) => calls.push(["unwatch", pattern]),
      block: {
        update: async (args) => { calls.push(["update", args.block.uid, args.block.string]); },
        create: async (args) => { calls.push(["create", args.location["parent-uid"], args.location.order, args.block.uid, args.block.string]); },
        move: async (args) => { calls.push(["move", args.block.uid, args.location["parent-uid"], args.location.order]); },
        delete: async (args) => { calls.push(["delete", args.block.uid]); },
      },
    },
  };
  return calls;
}

test("snapshot of a daily note with only nested links still has a neighborhood", async () => {
  fakeRoam({
    pulls(pattern, entity) {
      if (pattern === CENTER_PULL) return { ":block/uid": "09-28-2026", ":node/title": "September 28th, 2026" };
      if (pattern === OUTLINE_PULL) {
        return {
          ":block/children": [{
            ":block/uid": "b1",
            ":block/string": "Standup",
            ":block/order": 0,
            ":block/children": [{
              ":block/uid": "b2",
              ":block/string": "Ask [[Jane]] about [[Apollo]]",
              ":block/order": 0,
              ":block/refs": [rawPage("jane", "Jane"), rawPage("apollo", "Apollo")],
            }],
          }],
        };
      }
      if (entity.includes("09-27-2026")) return rawPage("09-27-2026", "September 27th, 2026");
      return null;
    },
  });
  const lifecycle = createLifecycle();
  try {
    const host = createHost({ lifecycle });
    assert.equal(await host.openPageUid(), "09-28-2026");
    const snap = host.snapshot("09-28-2026", {});
    const hood = buildNeighborhood(snap, {});
    assert.deepEqual(
      Object.fromEntries(hood.nodes.map((node) => [node.title, node.zone])),
      { Apollo: "south", Jane: "south", "September 27th, 2026": "west" },
    );
  } finally {
    await lifecycle.dispose();
    delete globalThis.roamAlphaAPI;
  }
});

test("move plans against a fresh pull and applies the ops in order", async () => {
  const calls = fakeRoam({
    pulls: () => ({
      ":block/uid": "src",
      ":block/string": "Owner::",
      ":block/order": 1,
      ":block/_children": [{ ":block/uid": "page" }],
      ":block/children": [
        { ":block/uid": "v1", ":block/string": "[[Jane]]", ":block/order": 0 },
        { ":block/uid": "v2", ":block/string": "[[Bob]]", ":block/order": 1 },
      ],
    }),
  });
  const lifecycle = createLifecycle();
  try {
    const host = createHost({ lifecycle });
    const stale = await host.move({ sourceUid: "src", fromAttribute: "Owner", toAttribute: "Parent", value: { uid: "jane", title: "Jane" }, expectedString: "Owner:: old" });
    assert.deepEqual(stale, { ok: false, reason: "changed" });
    const result = await host.move({ sourceUid: "src", fromAttribute: "Owner", toAttribute: "Parent", value: { uid: "jane", title: "Jane" }, expectedString: "Owner::" });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      ["create", "page", 2, "gen-uid", "Parent::"],
      ["move", "v1", "gen-uid", 0],
    ]);
  } finally {
    await lifecycle.dispose();
    delete globalThis.roamAlphaAPI;
  }
});

test("the sidecar removes only a sidebar window Compass opened", async () => {
  const windows = [{ type: "outline", "page-uid": "mine" }];
  const calls = fakeRoam({ pulls: () => null, windows });
  const lifecycle = createLifecycle();
  try {
    const host = createHost({ lifecycle });
    await host.syncSidecar("mine", true);
    await host.syncSidecar("other", true);
    await host.syncSidecar("third", true);
    await host.syncSidecar("third", false);
    assert.deepEqual(calls, [["add", "other"], ["remove", "other"], ["add", "third"], ["remove", "third"]]);
    await host.syncSidecar("fourth", true);
    host.releaseSidecar();
  } finally {
    await lifecycle.dispose();
    delete globalThis.roamAlphaAPI;
  }
  assert.deepEqual(calls.at(-1), ["add", "fourth"]);
});

test("watch registers both patterns and unwatch removes them", async () => {
  const calls = fakeRoam({ pulls: () => null });
  const lifecycle = createLifecycle();
  try {
    const host = createHost({ lifecycle });
    host.watch("c", () => {});
    host.watch("d", () => {});
  } finally {
    await lifecycle.dispose();
    delete globalThis.roamAlphaAPI;
  }
  assert.deepEqual(calls.map(([name]) => name), ["watch", "watch", "unwatch", "unwatch", "watch", "watch", "unwatch", "unwatch"]);
});
