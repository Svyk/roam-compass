import assert from "node:assert/strict";
import test from "node:test";

import { planWrite } from "../src/model/writes.js";

function settings(overrides = {}) {
  return {
    parents: "Parent",
    children: "Child",
    friends: "Friend, Previous",
    challengers: "Challenger, Next",
    hidden: "Hidden",
    maxPerZone: 24,
    showUntyped: true,
    showSiblings: true,
    showBadges: true,
    showOutline: false,
    ...overrides,
  };
}

function base(overrides = {}) {
  const settingOverrides = overrides.settings;
  const rest = { ...overrides };
  delete rest.settings;
  return {
    center: { uid: "center", title: "Center" },
    harcs: [],
    outbound: [],
    inbound: [],
    outline: [],
    namespaceParent: null,
    ...rest,
    settings: settings(settingOverrides),
  };
}

function harc(overrides = {}) {
  return {
    uid: "harc",
    entityUids: ["center"],
    attribute: { uid: "attr", title: "Child" },
    values: [],
    sourceUid: "src",
    sourceString: "Child::",
    valueSourceUids: [],
    labels: [],
    ...overrides,
  };
}

function strings(result) {
  return result.ops.map((op) => op.string).filter(Boolean);
}

test("no existing attribute creates one refs-only block", () => {
  assert.deepEqual(planWrite(base(), { type: "link", zone: "children", title: "A" }), {
    ops: [{ op: "create", parentUid: "center", order: "last", string: "Child:: [[A]]" }],
  });
});

test("a second page splits a refs-only tail and the update string is exactly Child::", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "b", title: "B" }],
      sourceString: "Child:: [[B]]",
      valueSourceUids: ["src"],
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result, {
    ops: [
      { op: "update", uid: "src", string: "Child::" },
      { op: "create", parentUid: "src", order: "last", string: "[[B]]" },
      { op: "create", parentUid: "src", order: "last", string: "[[A]]" },
    ],
  });
  assert.equal(result.ops[0].string, "Child::");
  for (const string of strings(result)) assert.doesNotMatch(string, /\],\s*\[\[/);
});

test("unlinking the only refs-only value deletes that block", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }],
      sourceString: "Child:: [[A]]",
      valueSourceUids: ["src"],
    })],
  }), { type: "unlink", sourceUid: "src", valueUid: "a" });
  assert.deepEqual(result, { ops: [{ op: "delete", uid: "src" }] });
});

test("a scalar Child:: notes is left unchanged and a new sibling Child:: [[A]] is created", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "v-1", vString: "notes" }],
      sourceString: "Child:: notes",
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result, {
    ops: [{ op: "create", parentUid: "center", order: "last", string: "Child:: [[A]]" }],
  });
});

test("unlink of a link-kind edge returns a single open op", () => {
  const result = planWrite(base({
    outbound: [{ uid: "a", title: "A" }],
  }), { type: "unlink", kind: "link", sourceUid: "mention-1", valueUid: "a" });
  assert.deepEqual(result, { ops: [{ op: "open", uid: "mention-1" }] });
});

test("annotate emits Role:: Lead as a child of the source", () => {
  assert.deepEqual(planWrite(base(), {
    type: "annotate",
    sourceUid: "src",
    attribute: "Role",
    text: "Lead",
  }), {
    ops: [{ op: "create", parentUid: "src", order: "last", string: "Role:: Lead" }],
  });
});

test("a bare attribute with page children gains one child ref block", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "b", title: "B" }],
      sourceString: "Child::",
      valueSourceUids: ["blk-b"],
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result, {
    ops: [{ op: "create", parentUid: "src", order: "last", string: "[[A]]" }],
  });
});

test("a comma-separated refs tail splits instead of being rewritten with commas", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "b", title: "B" }, { uid: "c", title: "C" }],
      sourceString: "Child:: [[B]], [[C]]",
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result.ops, [
    { op: "update", uid: "src", string: "Child::" },
    { op: "create", parentUid: "src", order: "last", string: "[[B]]" },
    { op: "create", parentUid: "src", order: "last", string: "[[C]]" },
    { op: "create", parentUid: "src", order: "last", string: "[[A]]" },
  ]);
});

test("unlinking one of two refs-only values leaves a single ref tail", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }, { uid: "b", title: "B" }],
      sourceString: "Child:: [[A]], [[B]]",
    })],
  }), { type: "unlink", sourceUid: "src", valueUid: "a" });
  assert.deepEqual(result, {
    ops: [{ op: "update", uid: "src", string: "Child:: [[B]]" }],
  });
});

test("unlinking one of three refs splits the tail without that page", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [
        { uid: "a", title: "A" },
        { uid: "b", title: "B" },
        { uid: "c", title: "C" },
      ],
      sourceString: "Child:: [[A]], [[B]], [[C]]",
    })],
  }), { type: "unlink", sourceUid: "src", valueUid: "b" });
  assert.deepEqual(result.ops, [
    { op: "update", uid: "src", string: "Child::" },
    { op: "create", parentUid: "src", order: "last", string: "[[A]]" },
    { op: "create", parentUid: "src", order: "last", string: "[[C]]" },
  ]);
});

test("unlinking the only child of a bare attribute deletes the child and the source", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }],
      sourceString: "Child::",
      valueSourceUids: ["blk-a"],
    })],
  }), { type: "unlink", sourceUid: "src", valueUid: "a" });
  assert.deepEqual(result, {
    ops: [
      { op: "delete", uid: "blk-a" },
      { op: "delete", uid: "src" },
    ],
  });
});

test("unlinking one child of a bare attribute leaves the source", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }, { uid: "b", title: "B" }],
      sourceString: "Child::",
      valueSourceUids: ["blk-a", "blk-b"],
    })],
  }), { type: "unlink", sourceUid: "src", valueUid: "a" });
  assert.deepEqual(result, { ops: [{ op: "delete", uid: "blk-a" }] });
});

test("a non-refs tail is not edited when a new page is linked", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "v-1", vString: "see [[B]]" }],
      sourceString: "Child:: see [[B]]",
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result, {
    ops: [{ op: "create", parentUid: "center", order: "last", string: "Child:: [[A]]" }],
  });
});

test("create true emits create-page before the attribute block", () => {
  const result = planWrite(base(), {
    type: "link", zone: "children", title: "New Page", create: true,
  });
  assert.deepEqual(result.ops, [
    { op: "create-page", title: "New Page" },
    { op: "create", parentUid: "center", order: "last", string: "Child:: [[New Page]]" },
  ]);
});

test("create true skips create-page when the title already has a uid", () => {
  const result = planWrite(base({
    outbound: [{ uid: "np", title: "New Page" }],
  }), { type: "link", zone: "children", title: "New Page", create: true });
  assert.deepEqual(result.ops, [
    { op: "create", parentUid: "center", order: "last", string: "Child:: [[New Page]]" },
  ]);
});

test("an empty direction list refuses the link", () => {
  assert.deepEqual(planWrite(base({ settings: { children: "" } }), {
    type: "link", zone: "children", title: "A",
  }), { ops: [] });
});

test("related uses the attribute typed on the action", () => {
  assert.deepEqual(planWrite(base(), {
    type: "link", zone: "related", title: "P", attribute: "Working on",
  }), {
    ops: [{ op: "create", parentUid: "center", order: "last", string: "Working on:: [[P]]" }],
  });
});

test("annotate refuses an empty attribute, a double colon, and an unconfigured BT_attr", () => {
  assert.deepEqual(planWrite(base(), { type: "annotate", sourceUid: "src", attribute: "", text: "x" }), { ops: [] });
  assert.deepEqual(planWrite(base(), {
    type: "annotate", sourceUid: "src", attribute: "Role::No", text: "x",
  }), { ops: [] });
  assert.deepEqual(planWrite(base(), {
    type: "annotate", sourceUid: "src", attribute: "BT_attrProject", text: "x",
  }), { ops: [] });
});

test("relink unlinks the old value then links it in the new zone", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }],
      sourceString: "Child:: [[A]]",
    })],
  }), { type: "relink", sourceUid: "src", valueUid: "a", toZone: "parents" });
  assert.deepEqual(result.ops, [
    { op: "delete", uid: "src" },
    { op: "create", parentUid: "center", order: "last", string: "Parent:: [[A]]" },
  ]);
});

test("linking a page that is already a value does nothing", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "a", title: "A" }],
      sourceString: "Child:: [[A]]",
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result, { ops: [] });
});

test("a class-tag-only tail is bare and accepts a child ref", () => {
  const result = planWrite(base({
    harcs: [harc({
      values: [{ uid: "b", title: "B" }],
      sourceString: "Child:: #.meta",
      valueSourceUids: ["blk-b"],
    })],
  }), { type: "link", zone: "children", title: "A" });
  assert.deepEqual(result, {
    ops: [{ op: "create", parentUid: "src", order: "last", string: "[[A]]" }],
  });
});

test("a configured BT_attr attribute may be written", () => {
  const result = planWrite(base({ settings: { friends: "BT_attrProject" } }), {
    type: "link", zone: "friends", title: "P",
  });
  assert.deepEqual(result, {
    ops: [{ op: "create", parentUid: "center", order: "last", string: "BT_attrProject:: [[P]]" }],
  });
});

test("the planner never emits :harc", () => {
  assert.deepEqual(planWrite(base(), {
    type: "link", zone: "children", title: "bad :harc name",
  }), { ops: [] });
});

test("open is a single open op", () => {
  assert.deepEqual(planWrite(base(), { type: "open", sourceUid: "block-1" }), {
    ops: [{ op: "open", uid: "block-1" }],
  });
});

test("unlinking an inverse source opens it instead of editing", () => {
  const result = planWrite(base({
    harcs: [harc({
      entityUids: ["b"],
      entities: [{ uid: "b", title: "B" }],
      values: [{ uid: "center", title: "Center" }],
      sourceString: "Child:: [[Center]]",
    })],
  }), { type: "unlink", sourceUid: "src", valueUid: "center" });
  assert.deepEqual(result, { ops: [{ op: "open", uid: "src" }] });
});

test("west uses the first friends attribute", () => {
  assert.deepEqual(planWrite(base(), { type: "link", zone: "west", title: "Pal" }), {
    ops: [{ op: "create", parentUid: "center", order: "last", string: "Friend:: [[Pal]]" }],
  });
});
