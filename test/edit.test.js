import assert from "node:assert/strict";
import test from "node:test";

import { describeRelation, planFlipOwner, planUnlink } from "../src/model/edit.js";
import { modelSettings } from "../src/model/neighborhood.js";
import { createEdit } from "../src/view/features/edit.js";

const alpha = { uid: "p-alpha", title: "Project Alpha" };
const beta = { uid: "p-beta", title: "Project Beta" };
const programs = { uid: "p-programs", title: "Programs" };

function src(string, children = [], uid = "b-src") {
  return { uid, string, order: 2, parentUid: "p-alpha", children };
}

test("planUnlink deletes a sole refs-tail block and updates a multi-ref tail block", () => {
  assert.deepEqual(
    planUnlink({ source: src("Friend:: [[Project Beta]]"), attribute: "Friend", value: beta }),
    {
      ops: [{ op: "delete", uid: "b-src" }],
      reason: null,
      removesBlock: true,
    },
  );

  assert.deepEqual(
    planUnlink({ source: src("[[Friend]]:: #[[Project Beta]] #.note"), attribute: "friend", value: beta }),
    {
      ops: [{ op: "delete", uid: "b-src" }],
      reason: null,
      removesBlock: true,
    },
  );

  assert.deepEqual(
    planUnlink({ source: src("Friend:: [[Project Beta]] [[Programs]]"), attribute: "Friend", value: beta }),
    {
      ops: [{ op: "update", uid: "b-src", string: "Friend:: [[Programs]]" }],
      reason: null,
      removesBlock: false,
    },
  );

  assert.deepEqual(
    planUnlink({ source: src("Friend:: [[Programs]] [[Project Beta]]"), attribute: "Friend", value: beta }),
    {
      ops: [{ op: "update", uid: "b-src", string: "Friend:: [[Programs]]" }],
      reason: null,
      removesBlock: false,
    },
  );

  assert.deepEqual(
    planUnlink({ source: src("Ref:: ((blk-9))"), attribute: "Ref", value: { uid: "blk-9" } }),
    {
      ops: [{ op: "delete", uid: "b-src" }],
      reason: null,
      removesBlock: true,
    },
  );
});

test("planUnlink handles bare attributes with child value blocks and preserves nested label blocks", () => {
  assert.deepEqual(
    planUnlink({
      source: src("Child::", [{ uid: "c1", string: "[[Project Beta]]", order: 0 }]),
      attribute: "Child",
      value: beta,
    }),
    {
      ops: [{ op: "delete", uid: "b-src" }],
      reason: null,
      removesBlock: true,
    },
  );

  assert.deepEqual(
    planUnlink({
      source: src("Owner::", [
        { uid: "c1", string: "[[Project Beta]]", order: 0 },
        { uid: "l1", string: "Role:: Lead", order: 1 },
      ]),
      attribute: "Owner",
      value: beta,
    }),
    {
      ops: [{ op: "delete", uid: "c1" }],
      reason: null,
      removesBlock: false,
    },
  );

  assert.deepEqual(
    planUnlink({
      source: src("Child::", [
        { uid: "c1", string: "[[Project Beta]]", order: 0 },
        { uid: "c2", string: "[[Programs]]", order: 1 },
      ]),
      attribute: "Child",
      value: beta,
    }),
    {
      ops: [{ op: "delete", uid: "c1" }],
      reason: null,
      removesBlock: false,
    },
  );

  assert.deepEqual(
    planUnlink({
      source: src("Child::", [
        { uid: "c1", string: "[[Project Beta]] [[Programs]]", order: 0 },
      ]),
      attribute: "Child",
      value: beta,
    }),
    {
      ops: [{ op: "update", uid: "c1", string: "[[Programs]]" }],
      reason: null,
      removesBlock: false,
    },
  );

  assert.deepEqual(
    planUnlink({
      source: src("Notes::", [{ uid: "c1", string: "plain child block", order: 0 }]),
      attribute: "Notes",
      value: { uid: "c1" },
    }),
    {
      ops: [{ op: "delete", uid: "b-src" }],
      reason: null,
      removesBlock: true,
    },
  );
});

test("planUnlink refuses missing, changed, read-only, text-value, missing-value, and forbidden writes", () => {
  assert.deepEqual(planUnlink({ source: null, attribute: "Friend", value: beta }), {
    ops: [],
    reason: "missing",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("Just a plain bullet"), attribute: "Friend", value: beta }), {
    ops: [],
    reason: "changed",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("Parent:: [[Project Beta]]"), attribute: "Friend", value: beta }), {
    ops: [],
    reason: "changed",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("BT_attrProject:: [[Project Beta]]"), attribute: "BT_attrProject", value: beta }), {
    ops: [],
    reason: "read-only",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("Aliases:: [[Project Beta]]"), attribute: "Aliases", value: beta }), {
    ops: [],
    reason: "read-only",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("Status:: Active"), attribute: "Status", value: beta }), {
    ops: [],
    reason: "text-value",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("Friend:: [[Programs]]"), attribute: "Friend", value: beta }), {
    ops: [],
    reason: "missing-value",
    removesBlock: false,
  });
  assert.deepEqual(planUnlink({ source: src("Friend::", [{ uid: "c1", string: "[[Programs]]", order: 0 }]), attribute: "Friend", value: beta }), {
    ops: [],
    reason: "missing-value",
    removesBlock: false,
  });
  assert.deepEqual(
    planUnlink({ source: src("Friend:: [[Project Beta]] [[:harc/v]]"), attribute: "Friend", value: beta }),
    {
      ops: [],
      reason: "forbidden",
      removesBlock: false,
    },
  );
});

test("planFlipOwner handles missing target, refs-only target, already-present target, and bare target", () => {
  const noTarget = planFlipOwner({
    source: src("Parent:: [[Programs]]"),
    attribute: "Parent",
    owner: alpha,
    value: programs,
    inverse: "Child",
    target: null,
  });
  assert.deepEqual(noTarget, {
    ops: [
      { op: "create", parentUid: "p-programs", order: "last", string: "Child:: [[Project Alpha]]" },
      { op: "delete", uid: "b-src" },
    ],
    reason: null,
    guards: [{ uid: "b-src", string: "Parent:: [[Programs]]" }],
  });

  const appendTarget = planFlipOwner({
    source: src("Parent:: [[Programs]] [[Project Beta]]"),
    attribute: "Parent",
    owner: alpha,
    value: programs,
    inverse: "Child",
    target: { uid: "t-child", string: "Child:: [[Project Gamma]]" },
  });
  assert.deepEqual(appendTarget, {
    ops: [
      { op: "update", uid: "t-child", string: "Child:: [[Project Gamma]] [[Project Alpha]]" },
      { op: "update", uid: "b-src", string: "Parent:: [[Project Beta]]" },
    ],
    reason: null,
    guards: [
      { uid: "b-src", string: "Parent:: [[Programs]] [[Project Beta]]" },
      { uid: "t-child", string: "Child:: [[Project Gamma]]" },
    ],
  });

  const alreadyPresent = planFlipOwner({
    source: src("Parent:: [[Programs]]"),
    attribute: "Parent",
    owner: alpha,
    value: programs,
    inverse: "Child",
    target: { uid: "t-child", string: "Child:: [[Project Alpha]]" },
  });
  assert.deepEqual(alreadyPresent, {
    ops: [{ op: "delete", uid: "b-src" }],
    reason: null,
    guards: [
      { uid: "b-src", string: "Parent:: [[Programs]]" },
      { uid: "t-child", string: "Child:: [[Project Alpha]]" },
    ],
  });

  const bareTarget = planFlipOwner({
    source: src("Parent:: [[Programs]]"),
    attribute: "Parent",
    owner: alpha,
    value: programs,
    inverse: "Child",
    target: { uid: "t-child", string: "Child::" },
  });
  assert.deepEqual(bareTarget, {
    ops: [
      { op: "create", parentUid: "t-child", order: "last", string: "[[Project Alpha]]" },
      { op: "delete", uid: "b-src" },
    ],
    reason: null,
    guards: [
      { uid: "b-src", string: "Parent:: [[Programs]]" },
      { uid: "t-child", string: "Child::" },
    ],
  });
});

test("planFlipOwner refuses non-pages, missing inverse, read-only, target-text, unlink failures, and forbidden tokens", () => {
  assert.deepEqual(
    planFlipOwner({
      source: src("Parent:: ((blk-1))"),
      attribute: "Parent",
      owner: alpha,
      value: { uid: "blk-1", kind: "block", title: "A block" },
      inverse: "Child",
      target: null,
    }),
    { ops: [], reason: "not-pages", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("Parent:: [[Programs]]"),
      attribute: "Parent",
      owner: { uid: "p-bad", title: "Bad [Title]" },
      value: programs,
      inverse: "Child",
      target: null,
    }),
    { ops: [], reason: "not-pages", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("Parent:: [[Programs]]"),
      attribute: "Parent",
      owner: alpha,
      value: programs,
      inverse: "",
      target: null,
    }),
    { ops: [], reason: "no-attribute", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("Parent:: [[Programs]]"),
      attribute: "Parent",
      owner: alpha,
      value: programs,
      inverse: "BT_attrSub",
      target: null,
    }),
    { ops: [], reason: "read-only", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("BT_attrProject:: [[Programs]]"),
      attribute: "BT_attrProject",
      owner: alpha,
      value: programs,
      inverse: "Child",
      target: null,
    }),
    { ops: [], reason: "read-only", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("Parent:: [[Programs]]"),
      attribute: "Parent",
      owner: alpha,
      value: programs,
      inverse: "Child",
      target: { uid: "t-child", string: "Child:: some plain note" },
    }),
    { ops: [], reason: "target-text", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("Other:: [[Programs]]"),
      attribute: "Parent",
      owner: alpha,
      value: programs,
      inverse: "Child",
      target: null,
    }),
    { ops: [], reason: "changed", guards: [] },
  );

  assert.deepEqual(
    planFlipOwner({
      source: src("Parent:: [[Programs]]"),
      attribute: "Parent",
      owner: { uid: "p-forb", title: " Sneaky :attr/proxy " },
      value: programs,
      inverse: "Child",
      target: null,
    }),
    { ops: [], reason: "forbidden", guards: [] },
  );
});

test("describeRelation formats page endpoints as [[Page]] and block endpoints as quoted plain text", () => {
  assert.equal(
    describeRelation({ owner: alpha, attribute: "Parent", value: programs }),
    "[[Project Alpha]] — Parent:: [[Programs]]",
  );
  assert.equal(
    describeRelation({
      owner: { uid: "b1", kind: "block", string: "{{[[TODO]]}} call **Jane** on [[Monday]]" },
      attribute: "Owner",
      value: alpha,
    }),
    '"TODO call Jane on Monday" — Owner:: [[Project Alpha]]',
  );
  assert.equal(
    describeRelation({
      owner: alpha,
      attribute: "Ref",
      value: { uid: "b2", string: "Review `spec`" },
    }),
    '[[Project Alpha]] — Ref:: "Review spec"',
  );
});

test("createEdit exposes Unlink and Flip owner only where allowed", () => {
  const settings = modelSettings({ parent: "Guide|Explains, Parent", challenger: "BT_attrRisk" });
  const hood = {
    center: { uid: "p-alpha", kind: "page", title: "Project Alpha" },
    settings,
  };
  const edit = createEdit({
    state: {
      get hood() { return hood; },
      get snapshot() { return { center: hood.center }; },
    },
  });

  const typedOut = {
    kind: "typed",
    role: "parent",
    attribute: "Guide",
    direction: "out",
    sourceUid: "b1",
    sourceString: "Guide:: [[Programs]]",
    writable: true,
  };
  const pageNode = { uid: "p-programs", kind: "page", title: "Programs", evidence: [typedOut], writable: typedOut };
  assert.deepEqual(
    edit.evidenceActions({ node: pageNode, item: typedOut }).map((a) => a.title),
    ["Unlink", "Flip owner"],
  );
  assert.deepEqual(
    edit.nodeMenu("p-programs", pageNode).map((a) => a.title),
    ["Unlink…", "Flip owner…"],
  );

  const blockNode = { uid: "b-note", kind: "block", title: "Note", string: "Note", evidence: [typedOut], writable: typedOut };
  assert.deepEqual(
    edit.evidenceActions({ node: blockNode, item: typedOut }).map((a) => a.title),
    ["Unlink"],
  );
  assert.deepEqual(
    edit.nodeMenu("b-note", blockNode).map((a) => a.title),
    ["Unlink…"],
  );

  const noInverseItem = { ...typedOut, role: "challenger", attribute: "Opposes" };
  const chalNode = { uid: "p-risk", kind: "page", title: "Risk", evidence: [noInverseItem], writable: noInverseItem };
  assert.deepEqual(
    edit.evidenceActions({ node: chalNode, item: noInverseItem }).map((a) => a.title),
    ["Unlink"],
  );

  assert.deepEqual(edit.evidenceActions({ node: pageNode, item: { ...typedOut, writable: false } }), []);
  assert.deepEqual(edit.evidenceActions({ node: pageNode, item: { kind: "link", sourceUid: "b2" } }), []);
  assert.deepEqual(edit.nodeMenu("p-programs", { ...pageNode, writable: null }), []);
  assert.equal("commands" in edit, false);
});
