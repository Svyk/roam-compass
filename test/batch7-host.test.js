import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import { CROSS_QUERY } from "../src/model/batch7.js";
import { createHost } from "../src/host.js";
import { DEFAULTS, readCompassSettings } from "../src/settings.js";

function install(data) {
  globalThis.roamAlphaAPI = {
    graph: { name: "test" },
    util: { generateUID: () => "gen-uid" },
    data,
  };
}

test("childCounts fills missing uids with 0", () => {
  const seen = [];
  install({
    q: (query, uids) => {
      seen.push([query, uids]);
      return [["a", 2]];
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(host.childCounts(["a", "b"]), { a: 2, b: 0 });
    assert.equal(seen[0][0].includes("(count ?c)"), true);
    assert.deepEqual(seen[0][1], ["a", "b"]);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("childCounts returns {} when the query throws", () => {
  install({
    q: () => { throw new Error("boom"); },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(host.childCounts(["a"]), {});
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("crossRows passes CROSS_QUERY and the uid array", () => {
  const seen = [];
  install({
    q: (query, uids) => {
      seen.push([query, uids]);
      return [["a", "b"]];
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(host.crossRows(["a", "b"]), [["a", "b"]]);
    assert.equal(seen[0][0], CROSS_QUERY);
    assert.deepEqual(seen[0][1], ["a", "b"]);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("findDrawingBlock skips a region and returns the drawing", () => {
  install({
    q: (query, title) => {
      assert.equal(title, "Drawings/T");
      assert.equal(query.includes(":node/title"), true);
      return [
        ["region-1", "{{[[plexus-region]] frame"],
        ["draw-1", "{{[[excalidraw]]}}"],
      ];
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.equal(host.findDrawingBlock("T"), "draw-1");
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("findDrawingBlock returns null for a normal block", () => {
  install({
    q: () => [["note-1", "just a note"]],
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.equal(host.findDrawingBlock("T"), null);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("writeZoneAttribute creates Child:: on the center", async () => {
  const calls = [];
  install({
    pull: () => ({ ":block/uid": "center", ":block/children": [] }),
    q: () => [],
    block: {
      create: async (args) => {
        calls.push(args);
      },
      update: async () => { throw new Error("no update"); },
    },
  });
  const lifecycle = createLifecycle();
  const host = createHost({ lifecycle });
  try {
    const result = await host.writeZoneAttribute({ centerUid: "center", zone: "south", title: "Drawings/T" });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].location["parent-uid"], "center");
    assert.equal(calls[0].location.order, "last");
    assert.equal(calls[0].block.string, "Child:: [[Drawings/T]]");
  } finally {
    await lifecycle.dispose();
    delete globalThis.roamAlphaAPI;
  }
});

test("writeZoneAttribute appends a ref onto the existing attribute", async () => {
  const calls = [];
  install({
    pull: () => ({
      ":block/children": [{ ":block/uid": "attr", ":block/string": "Parent:: [[Other]]" }],
    }),
    block: {
      update: async (args) => { calls.push(args); },
      create: async () => { throw new Error("no create"); },
    },
  });
  const lifecycle = createLifecycle();
  const host = createHost({ lifecycle });
  try {
    const result = await host.writeZoneAttribute({ centerUid: "center", zone: "north", title: "Up" });
    assert.equal(result.ok, true);
    assert.equal(calls[0].block.uid, "attr");
    assert.equal(calls[0].block.string, "Parent:: [[Other]] [[Up]]");
  } finally {
    await lifecycle.dispose();
    delete globalThis.roamAlphaAPI;
  }
});

test("writeZoneAttribute refuses a bracket in the title", async () => {
  let created = 0;
  install({
    pull: () => ({ ":block/children": [] }),
    block: {
      create: async () => { created += 1; },
      update: async () => { created += 1; },
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    const result = await host.writeZoneAttribute({ centerUid: "center", zone: "north", title: "Bad]" });
    assert.deepEqual(result, { ok: false, reason: "title" });
    assert.equal(created, 0);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("cross links default off", () => {
  assert.equal(DEFAULTS["compass-cross-links"], false);
  assert.equal(readCompassSettings({ settings: { get: () => undefined } }).crossLinks, false);
});

test("overlay send path does not open a drawing", () => {
  const overlay = readFileSync(new URL("../src/view/overlay.js", import.meta.url), "utf8");
  for (const phrase of ["Send to drawing", "Start writing", "Empty page", "Create drawing here", "Plexus is needed", "Open a drawing first", "dropSubgraph"]) {
    assert.equal(overlay.includes(phrase), true, phrase);
  }
  const at = overlay.indexOf("async function sendToDrawing");
  assert.equal(at > 0, true);
  const slice = overlay.slice(at, at + 900);
  assert.equal(slice.includes("whenOpen"), false);
  assert.equal(slice.includes(".open("), false);
});

test("attribute planning stays out of move()", () => {
  const host = readFileSync(new URL("../src/host.js", import.meta.url), "utf8");
  assert.equal(host.includes("planAttributeWrite"), true);
  const start = host.indexOf("function move(");
  const end = host.indexOf("function childCounts(");
  assert.equal(host.slice(start, end).includes("planAttributeWrite"), false);
});
