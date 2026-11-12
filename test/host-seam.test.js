import assert from "node:assert/strict";
import test from "node:test";

import { createHost } from "../src/host.js";
import { createLifecycle } from "../src/lifecycle.js";

function installRoam({ data = {}, util = {}, graph = "test-graph" } = {}) {
  globalThis.roamAlphaAPI = {
    graph: { name: graph },
    util,
    data,
  };
}

test("host.entity pulls page and block titles and degrades to null on missing or error", () => {
  const seen = [];
  installRoam({
    data: {
      pull(pattern, ref) {
        seen.push([pattern, ref]);
        if (ref.includes('"page-1"')) return { ":block/uid": "page-1", ":node/title": "Alpha" };
        if (ref.includes('"blk-1"')) return { ":block/uid": "blk-1", ":block/string": "**Hello** [[World]]" };
        if (ref.includes('"draw-1"')) {
          return { ":block/uid": "draw-1", ":block/string": "{{[[excalidraw]]}} Text elements in drawing: Map;" };
        }
        if (ref.includes('"boom"')) throw new Error("pull down");
        return null;
      },
    },
  });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(host.entity("page-1"), { uid: "page-1", kind: "page", title: "Alpha" });
    assert.deepEqual(host.entity("blk-1"), { uid: "blk-1", kind: "block", title: "Hello World" });
    assert.deepEqual(host.entity("draw-1"), { uid: "draw-1", kind: "block", title: "Drawing: Map" });
    assert.equal(host.entity("missing"), null);
    assert.equal(host.entity(""), null);
    assert.equal(host.entity("boom"), null);
    assert.equal(seen[0][0], "[:block/uid :node/title :block/string]");
    assert.ok(errors.some((line) => String(line[0]).startsWith("[compass]")));
  } finally {
    console.error = originalError;
    delete globalThis.roamAlphaAPI;
  }
});

test("host.pageByTitle and host.createPage reuse existing pages and create missing ones", async () => {
  const created = [];
  const pages = new Map([["Existing", "uid-existing"]]);
  installRoam({
    util: { generateUID: () => "uid-generated" },
    data: {
      pull(_pattern, ref) {
        const match = /:node\/title "([^"]+)"/.exec(ref);
        const title = match?.[1];
        if (!title || !pages.has(title)) return null;
        return { ":block/uid": pages.get(title), ":node/title": title, ":edit/time": 100 };
      },
      page: {
        async create(args) {
          created.push(args);
          pages.set(args.page.title, args.page.uid);
        },
      },
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(host.pageByTitle("Existing"), { uid: "uid-existing", title: "Existing" });
    assert.equal(host.pageByTitle("Missing"), null);
    assert.equal(await host.createPage("Existing"), "uid-existing");
    assert.equal(created.length, 0);
    assert.equal(await host.createPage("Fresh Page"), "uid-generated");
    assert.deepEqual(created, [{ page: { title: "Fresh Page", uid: "uid-generated" } }]);
    assert.equal(await host.createPage("   "), null);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("host.dailyPage uses Roam date utils and falls back to MM-DD-YYYY", () => {
  const sample = new Date(2026, 8, 5);
  installRoam({
    util: {
      dateToPageUid: (d) => `uid-${d.getFullYear()}`,
      dateToPageTitle: (d) => `Title ${d.getDate()}`,
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(host.dailyPage(sample), { uid: "uid-2026", title: "Title 5" });
    delete globalThis.roamAlphaAPI.util;
    assert.deepEqual(host.dailyPage(sample), { uid: "09-05-2026", title: "09-05-2026" });
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("host.pageAttributes merges harcs of the same attribute, normalizes values, dedupes, and caps at 200", () => {
  const pulledUids = [];
  installRoam({
    data: {
      pull(pattern, ref) {
        assert.equal(
          pattern,
          "[:block/uid {:harc/_e [{:harc/a [:node/title]} {:harc/v [:block/uid :node/title :block/string :harc/v-string]}]}]",
        );
        const match = /:block\/uid "([^"]+)"/.exec(ref);
        const uid = match?.[1];
        pulledUids.push(uid);
        if (uid === "p1") {
          return {
            ":block/uid": "p1",
            ":harc/_e": [
              {
                ":harc/a": [{ ":node/title": "Type" }],
                ":harc/v": [{ ":block/uid": "t-project", ":node/title": "Project" }],
              },
              {
                ":harc/a": [{ ":node/title": "type" }],
                ":harc/v": [{ ":block/uid": "t-active", ":node/title": "Active" }],
              },
              {
                ":harc/a": [{ ":node/title": "Status" }],
                ":harc/v": [{ ":block/uid": "v-str-1", ":harc/v-string": "In Progress" }],
              },
              {
                ":harc/a": [{ ":node/title": "Note" }],
                ":harc/v": [{ ":block/uid": "b-note", ":block/string": "See **details** in [[Spec]]" }],
              },
            ],
          };
        }
        return { ":block/uid": uid };
      },
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    const result = host.pageAttributes(["p1", "p1", "", null, 42, "p2"]);
    assert.deepEqual(pulledUids, ["p1", "p2"]);
    assert.deepEqual(result, {
      p1: {
        type: {
          name: "Type",
          values: [
            { uid: "t-project", title: "Project" },
            { uid: "t-active", title: "Active" },
          ],
        },
        status: {
          name: "Status",
          values: [{ text: "In Progress" }],
        },
        note: {
          name: "Note",
          values: [{ uid: "b-note", text: "See details in Spec" }],
        },
      },
      p2: {},
    });

    pulledUids.length = 0;
    const many = Array.from({ length: 225 }, (_, index) => `u-${index}`);
    const capped = host.pageAttributes(many);
    assert.equal(pulledUids.length, 200);
    assert.equal(Object.keys(capped).length, 200);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});

test("host.applyPlan covers happy path, missing, changed, forbidden, empty, and no-uid", async () => {
  const blocks = new Map([
    ["b1", "Old text"],
    ["b2", "Keep me"],
  ]);
  const writes = [];
  let uidCounter = 0;
  installRoam({
    util: {
      generateUID: () => {
        uidCounter += 1;
        return `gen-${uidCounter}`;
      },
    },
    data: {
      pull(pattern, ref) {
        assert.equal(pattern, "[:block/uid :block/string]");
        const uid = /:block\/uid "([^"]+)"/.exec(ref)?.[1];
        if (!uid || !blocks.has(uid)) return null;
        return { ":block/uid": uid, ":block/string": blocks.get(uid) };
      },
      block: {
        async update(args) {
          writes.push(["update", args.block.uid, args.block.string]);
          blocks.set(args.block.uid, args.block.string);
        },
        async create(args) {
          writes.push(["create", args.location["parent-uid"], args.location.order, args.block.uid, args.block.string]);
          blocks.set(args.block.uid, args.block.string);
        },
        async move(args) {
          writes.push(["move", args.block.uid, args.location["parent-uid"], args.location.order]);
        },
        async delete(args) {
          writes.push(["delete", args.block.uid]);
          blocks.delete(args.block.uid);
        },
      },
    },
  });
  const host = createHost({ lifecycle: createLifecycle() });
  try {
    assert.deepEqual(await host.applyPlan({ lockUid: "p1", guards: [], ops: [] }), {
      ok: false,
      reason: "empty",
    });

    for (const token of [":harc/v", ":entity/attrs", ":attr/proxy"]) {
      const bad = await host.applyPlan({
        lockUid: "p1",
        guards: [{ uid: "b1", string: "Old text" }],
        ops: [{ op: "update", uid: "b1", string: `sneaky ${token}` }],
      });
      assert.deepEqual(bad, { ok: false, reason: "forbidden" });
    }
    assert.equal(writes.length, 0);

    assert.deepEqual(
      await host.applyPlan({
        lockUid: "p1",
        guards: [{ uid: "gone", string: "anything" }],
        ops: [{ op: "update", uid: "b1", string: "Next" }],
      }),
      { ok: false, reason: "missing" },
    );
    assert.equal(writes.length, 0);

    assert.deepEqual(
      await host.applyPlan({
        lockUid: "p1",
        guards: [{ uid: "b1", string: "Stale text" }],
        ops: [{ op: "update", uid: "b1", string: "Next" }],
      }),
      { ok: false, reason: "changed" },
    );
    assert.equal(writes.length, 0);

    const happy = await host.applyPlan({
      lockUid: "p1",
      guards: [
        { uid: "b1", string: "Old text" },
        { uid: "b2", string: "Keep me" },
      ],
      ops: [
        { op: "update", uid: "b1", string: "Updated text" },
        { op: "create", parentUid: "p1", order: "last", string: "Owner:: [[Jane]]" },
        { op: "move", uid: "b2", parentUid: "p1", order: 0 },
        { op: "delete", uid: "b2" },
      ],
    });
    assert.equal(happy.ok, true);
    assert.equal(happy.ops[1].uid, "gen-1");
    assert.deepEqual(writes, [
      ["update", "b1", "Updated text"],
      ["create", "p1", "last", "gen-1", "Owner:: [[Jane]]"],
      ["move", "b2", "p1", 0],
      ["delete", "b2"],
    ]);

    globalThis.roamAlphaAPI.util = {};
    writes.length = 0;
    assert.deepEqual(
      await host.applyPlan({
        lockUid: "p1",
        guards: [],
        ops: [{ op: "create", parentUid: "p1", order: 0, string: "Child:: [[X]]" }],
      }),
      { ok: false, reason: "no-uid" },
    );
    assert.equal(writes.length, 0);
  } finally {
    delete globalThis.roamAlphaAPI;
  }
});
